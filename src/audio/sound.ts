// A small synthesised sound engine: every cue and the station hum are built from Web Audio nodes, so there are no files to load.
// Browsers (iOS Safari above all) only start audio from a user gesture, so nothing exists until unlock() is called from one.
// Audio is a garnish, never a dependency: every public method swallows errors and does nothing when Web Audio is missing.

export type Cue = 'click' | 'open' | 'close' | 'toast' | 'warn' | 'alarm' | 'docked' | 'report' | 'win' | 'lose' | 'shutter' | 'build';

/** Same cue repeats closer than this are dropped, so a flurry of taps or events doesn't machine-gun. */
const CUE_GAP_S = 0.12;
/** The alarm is tiring if it nags; once every few seconds is enough to be heard. */
const ALARM_GAP_S = 4;
/** A burst of events can't pile up more than this many cues at once. */
const MAX_VOICES = 8;
/** Master headroom under the user volume; the compressor catches what's left. */
const MASTER_LEVEL = 0.7;
const DEFAULT_VOLUME = 0.8;
/** The hum sits well under the cues: present when the room is quiet, gone under any UI sound. */
const AMBIENT_DB = -30;
const AMBIENT_FADE_S = 1.5;
/** How long after a fade-out the ambient sources are stopped and freed. */
const AMBIENT_STOP_S = AMBIENT_FADE_S + 0.4;
/** Small lead so the first envelope point is never in the past by the time the graph is built. */
const LEAD_S = 0.01;

type AudioCtor = new () => AudioContext;

const noop = (): void => undefined;
const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** iOS before 14.5 only has the prefixed constructor. */
function audioCtor(): AudioCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** resume/suspend/close return promises that reject when the browser says no; that is not worth an unhandled rejection. */
function quietly(p: Promise<unknown> | undefined): void {
  if (p && typeof p.catch === 'function') p.catch(noop);
}

/** Smooth move to a target without zipper noise; setTargetAtTime reaches ~95% in three time constants. */
function glideTo(p: AudioParam, v: number, now: number, tc: number): void {
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.setTargetAtTime(v, now, tc);
}

/** Percussive envelope: fast linear attack, exponential tail (which sounds natural, but can't reach exactly 0). */
function envelope(p: AudioParam, t0: number, peak: number, attack: number, dur: number): void {
  p.value = 0;
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(peak, t0 + attack);
  p.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, attack + 0.005));
}

function makeNoise(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    // Leaky integrator turns white into brown noise: the soft roar of air handlers rather than hiss.
    b = brown ? (b + 0.02 * w) / 1.02 : w;
    d[i] = b;
  }
  if (brown && len > 1) {
    // Tilt out the drift so the last sample meets the first: a looped buffer then has no click at the seam.
    const drift = d[len - 1] - d[0];
    let mean = 0;
    for (let i = 0; i < len; i++) mean += (d[i] -= (drift * i) / (len - 1));
    mean /= len;
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs((d[i] -= mean)));
    if (peak > 0) for (let i = 0; i < len; i++) d[i] *= 0.9 / peak;
  }
  return buf;
}

/** One cue's nodes. It frees itself when its last source ends, and remembers when that will be for the voice cap. */
class Voice {
  readonly out: GainNode;
  end = 0;
  private readonly nodes: AudioNode[] = [];
  private live = 0;

  constructor(
    readonly ctx: AudioContext,
    dest: AudioNode,
  ) {
    this.out = this.add(ctx.createGain());
    this.out.connect(dest);
  }

  add<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  /** Tracks a source and starts it; `start` lets buffer sources pass an offset, which the base type can't. */
  run<T extends AudioScheduledSourceNode>(src: T, t0: number, t1: number, start: (s: T) => void = (s) => s.start(t0)): void {
    this.add(src);
    this.live++;
    src.onended = () => {
      if (--this.live <= 0) this.free();
    };
    start(src);
    src.stop(t1);
    this.end = Math.max(this.end, t1);
  }

  private free(): void {
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.nodes.length = 0;
  }
}

interface ToneOpts {
  type?: OscillatorType;
  attack?: number;
  /** Exponential pitch slide to this frequency over the note. */
  glide?: number;
  lowpass?: number;
  detune?: number;
}

interface NoiseOpts {
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  attack?: number;
}

/** The running hum, with handles on the params that eclipse and pace move. */
interface Ambient {
  fade: GainNode;
  air: AudioBufferSourceNode;
  airFilter: BiquadFilterNode;
  throb: GainNode;
  hum: OscillatorNode;
  humGain: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

export class Sound {
  private ctx: AudioContext | null = null;
  /** Creating the context threw once; don't keep trying on every tap. */
  private broken = false;
  private disposed = false;
  private hidden = false;

  private master: GainNode | null = null;
  private cueBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;

  private volume = DEFAULT_VOLUME;
  private muted = false;
  private ambientOn = false;
  private eclipse = 0;
  private pace = 0;
  private ambient: Ambient | null = null;

  private readonly lastPlayed = new Map<Cue, number>();
  private voices: Voice[] = [];

  private readonly onVisibility = (): void => {
    try {
      this.hidden = document.visibilityState === 'hidden';
      const ctx = this.ctx;
      if (!ctx || ctx.state === 'closed') return;
      // Stop the hum draining a phone battery in a background tab; iOS may refuse the resume, and the next unlock() fixes that.
      if (this.hidden) quietly(ctx.suspend());
      else quietly(ctx.resume());
    } catch {
      // Ignore: visibility handling is best effort.
    }
  };

  constructor() {
    try {
      if (typeof document !== 'undefined') {
        this.hidden = document.visibilityState === 'hidden';
        document.addEventListener('visibilitychange', this.onVisibility);
      }
    } catch {
      // No DOM (tests, workers): nothing to listen to.
    }
  }

  /** Call from a user gesture (click/tap/key). Creates or resumes the AudioContext. Safe to call often. */
  unlock(): void {
    if (this.disposed || this.broken) return;
    try {
      if (!this.ctx) {
        const Ctor = audioCtor();
        if (!Ctor) {
          this.broken = true;
          return;
        }
        this.ctx = new Ctor();
        this.build(this.ctx);
        this.primeIOS(this.ctx);
        if (this.ambientOn) this.startAmbient();
      }
      const ctx = this.ctx;
      if (ctx.state !== 'running' && ctx.state !== 'closed' && !this.hidden) quietly(ctx.resume());
    } catch {
      this.broken = true;
      this.teardown();
    }
  }

  /** 0..1 master volume, ramped smoothly. */
  setVolume(v: number): void {
    if (!Number.isFinite(v)) return;
    this.volume = clamp01(v);
    this.applyMaster();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
  }

  /** The station's background hum: on while playing, off on the title screen. Fades over ~1.5 s either way. */
  setAmbient(on: boolean): void {
    if (this.ambientOn === on) return;
    this.ambientOn = on;
    try {
      if (on) this.startAmbient();
      else this.stopAmbient();
    } catch {
      // Ignore: the hum is optional.
    }
  }

  /** 0 = full sun, 1 = eclipse: pumps and heaters work harder (a slow throb, a heavier hum) and the air goes darker. */
  setEclipse(x: number): void {
    this.eclipse = clamp01(x);
    try {
      this.applyAmbientShape();
    } catch {
      // Ignore.
    }
  }

  /** 0..1 game speed feel: lifts the air handlers' pitch a touch so fast-forward sounds busier. */
  setPace(x: number): void {
    this.pace = clamp01(x);
    try {
      this.applyAmbientShape();
    } catch {
      // Ignore.
    }
  }

  play(cue: Cue): void {
    try {
      const ctx = this.ctx;
      const bus = this.cueBus;
      if (!ctx || !bus || this.muted || this.hidden || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const prev = this.lastPlayed.get(cue);
      if (prev !== undefined && now - prev < (cue === 'alarm' ? ALARM_GAP_S : CUE_GAP_S)) return;
      this.voices = this.voices.filter((v) => v.end > now);
      if (this.voices.length >= MAX_VOICES) return;
      const v = new Voice(ctx, bus);
      this.render(v, cue, now + LEAD_S);
      if (v.end === 0) {
        v.out.disconnect(); // Unknown cue from untyped callers: nothing was scheduled.
        return;
      }
      this.lastPlayed.set(cue, now);
      this.voices.push(v);
    } catch {
      // Ignore: a lost cue is better than a broken click handler.
    }
  }

  /** Removes the visibility listener and closes the context. The instance is inert afterwards. */
  dispose(): void {
    this.disposed = true;
    try {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    } catch {
      // Ignore.
    }
    this.teardown();
  }

  // ---- graph ----

  private build(ctx: AudioContext): void {
    const comp = ctx.createDynamicsCompressor();
    // Gentle bus glue: only catches stacked cues, never audibly pumps a single one.
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.masterTarget();
    this.master.connect(comp);

    this.cueBus = ctx.createGain();
    this.cueBus.connect(this.master);
    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = dbToGain(AMBIENT_DB);
    this.ambientBus.connect(this.master);

    // Made once and shared: white for clicks and clunks, a long brown loop for the air.
    this.white = makeNoise(ctx, 1, false);
    this.brown = makeNoise(ctx, 4, true);
  }

  /** The usual iOS trick: playing any buffer inside the gesture is what actually unmutes the context there. */
  private primeIOS(ctx: AudioContext): void {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.onended = () => src.disconnect();
    src.start(0);
  }

  private teardown(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = this.cueBus = this.ambientBus = null;
    this.ambient = null;
    this.voices = [];
    if (!ctx) return;
    try {
      if (ctx.state !== 'closed') quietly(ctx.close());
    } catch {
      // Ignore.
    }
  }

  private masterTarget(): number {
    return this.muted ? 0 : this.volume * MASTER_LEVEL;
  }

  private applyMaster(): void {
    try {
      if (this.ctx && this.master) glideTo(this.master.gain, this.masterTarget(), this.ctx.currentTime, 0.04);
    } catch {
      // Ignore.
    }
  }

  // ---- ambient ----

  private startAmbient(): void {
    const ctx = this.ctx;
    const bus = this.ambientBus;
    const brown = this.brown;
    if (!ctx || !bus || !brown || this.ambient) return;
    const now = ctx.currentTime;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const node = <T extends AudioNode>(n: T): T => (nodes.push(n), n);
    const lfo = (hz: number, depth: number, target: AudioParam): GainNode => {
      const o = node(ctx.createOscillator());
      o.frequency.value = hz;
      const g = node(ctx.createGain());
      g.gain.value = depth;
      o.connect(g);
      g.connect(target);
      sources.push(o);
      return g;
    };

    // Each hum has its own fade, so a quick off-on overlaps two fades instead of cutting one short.
    const fade = node(ctx.createGain());
    fade.gain.value = 0;
    fade.connect(bus);

    // Air handlers: looped brown noise, low-passed, with a very slow drift in the filter like air moving through ducts.
    const air = node(ctx.createBufferSource());
    air.buffer = brown;
    air.loop = true;
    const airFilter = node(ctx.createBiquadFilter());
    airFilter.type = 'lowpass';
    airFilter.Q.value = 0.5;
    const airGain = node(ctx.createGain());
    airGain.gain.value = 0.8;
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(fade);
    sources.push(air);
    lfo(0.06, 60, airFilter.frequency);
    // Pump throb on the air level; its depth is zero in sunlight and grows into eclipse.
    const throb = lfo(0.7, 0, airGain.gain);

    // Mains hum: a triangle keeps a little harmonic content, which is all a phone speaker can play of 57 Hz.
    const hum = node(ctx.createOscillator());
    hum.type = 'triangle';
    hum.frequency.value = 57;
    const humGain = node(ctx.createGain());
    hum.connect(humGain);
    humGain.connect(fade);
    sources.push(hum);
    lfo(0.11, 0.7, hum.frequency);

    const amb: Ambient = { fade, air, airFilter, throb, hum, humGain, sources, nodes };
    this.ambient = amb;
    this.applyAmbientShape(true);
    // Start the air loop somewhere random so every session's hum isn't the same four seconds.
    for (const s of sources) {
      if (s === air) air.start(now, Math.random() * brown.duration);
      else s.start(now);
    }
    fade.gain.setValueAtTime(0, now);
    fade.gain.setTargetAtTime(1, now, AMBIENT_FADE_S / 3);
  }

  private stopAmbient(): void {
    const ctx = this.ctx;
    const amb = this.ambient;
    this.ambient = null;
    if (!ctx || !amb) return;
    const now = ctx.currentTime;
    glideTo(amb.fade.gain, 0, now, AMBIENT_FADE_S / 4);
    let live = amb.sources.length;
    for (const s of amb.sources) {
      s.onended = () => {
        if (--live > 0) return;
        for (const n of amb.nodes) {
          try {
            n.disconnect();
          } catch {
            // Already gone.
          }
        }
      };
      s.stop(now + AMBIENT_STOP_S);
    }
  }

  /** Moves the hum's params to match eclipse and pace; `snap` sets them outright on a freshly built graph. */
  private applyAmbientShape(snap = false): void {
    const ctx = this.ctx;
    const amb = this.ambient;
    if (!ctx || !amb) return;
    const e = this.eclipse;
    const p = this.pace;
    const set = (param: AudioParam, v: number): void => {
      if (snap) param.value = v;
      else glideTo(param, v, ctx.currentTime, 1.2);
    };
    set(amb.airFilter.frequency, 480 - 170 * e);
    set(amb.throb.gain, 0.25 * e);
    set(amb.humGain.gain, 0.35 + 0.15 * e);
    set(amb.air.playbackRate, 1 + 0.12 * p);
    set(amb.hum.detune, 40 * p - 30 * e);
  }

  // ---- cues ----

  private tone(v: Voice, freq: number, t0: number, dur: number, peak: number, o: ToneOpts = {}): void {
    const ctx = v.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = v.add(ctx.createGain());
    envelope(g.gain, t0, peak, o.attack ?? 0.005, dur);
    if (o.lowpass) {
      const f = v.add(ctx.createBiquadFilter());
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      osc.connect(f);
      f.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(v.out);
    v.run(osc, t0, t0 + dur + 0.03);
  }

  /** A soft bell: the note plus a quieter octave that dies first. */
  private bell(v: Voice, freq: number, t0: number, dur: number, peak: number): void {
    this.tone(v, freq, t0, dur, peak, { attack: 0.004 });
    this.tone(v, freq * 2, t0, dur * 0.45, peak * 0.25, { attack: 0.003 });
  }

  private noise(v: Voice, t0: number, dur: number, peak: number, o: NoiseOpts): void {
    const buf = this.white;
    if (!buf) return;
    const ctx = v.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = v.add(ctx.createBiquadFilter());
    f.type = o.filter;
    f.frequency.value = o.freq;
    f.Q.value = o.q ?? 0.7;
    const g = v.add(ctx.createGain());
    envelope(g.gain, t0, peak, o.attack ?? 0.001, dur);
    src.connect(f);
    f.connect(g);
    g.connect(v.out);
    // A random start into the shared buffer, so repeated clicks aren't identical.
    const offset = Math.random() * Math.max(0, buf.duration - dur - 0.05);
    v.run(src, t0, t0 + dur + 0.02, (s) => s.start(t0, offset));
  }

  private render(v: Voice, cue: Cue, t: number): void {
    switch (cue) {
      case 'click':
        this.noise(v, t, 0.018, 0.14, { filter: 'bandpass', freq: 3500, q: 1.5 });
        this.tone(v, 2200, t, 0.02, 0.03, { attack: 0.001 });
        break;
      case 'open':
        this.tone(v, 587.33, t, 0.09, 0.1);
        this.tone(v, 880, t + 0.06, 0.12, 0.1);
        break;
      case 'close':
        this.tone(v, 880, t, 0.09, 0.1);
        this.tone(v, 587.33, t + 0.06, 0.12, 0.1);
        break;
      case 'toast':
        this.bell(v, 783.99, t, 0.55, 0.06);
        this.bell(v, 1046.5, t + 0.09, 0.8, 0.06);
        break;
      case 'warn':
        // Falling major third: asks for attention without sounding like an emergency.
        this.tone(v, 659.25, t, 0.16, 0.11, { type: 'triangle', lowpass: 1800 });
        this.tone(v, 523.25, t + 0.2, 0.22, 0.11, { type: 'triangle', lowpass: 1800 });
        break;
      case 'alarm':
        this.alarm(v, t);
        break;
      case 'docked':
        this.tone(v, 120, t, 0.22, 0.45, { attack: 0.004, glide: 42 });
        this.noise(v, t, 0.14, 0.5, { filter: 'lowpass', freq: 500 });
        // Latch tick, then a faint hiss as the hatch pressures equalise.
        this.noise(v, t + 0.07, 0.03, 0.12, { filter: 'bandpass', freq: 2400, q: 4 });
        this.noise(v, t + 0.15, 0.35, 0.03, { filter: 'highpass', freq: 3000, attack: 0.08 });
        break;
      case 'build':
        for (let i = 0; i < 3; i++) this.noise(v, t + i * 0.05, 0.025, 0.16, { filter: 'bandpass', freq: 1600 + i * 400, q: 6 });
        this.tone(v, 1046.5, t + 0.17, 0.14, 0.07, { type: 'triangle' });
        break;
      case 'report':
        this.bell(v, 783.99, t, 0.5, 0.06);
        this.bell(v, 987.77, t + 0.1, 0.5, 0.06);
        this.bell(v, 1174.66, t + 0.2, 0.8, 0.06);
        break;
      case 'win': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => this.tone(v, f, t + i * 0.11, i === 3 ? 1.1 : 0.38, 0.09, { type: 'triangle', lowpass: 2200 }));
        // A slightly detuned double on the top note and a low root underneath make it warm rather than bleepy.
        this.tone(v, 1046.5, t + 0.33, 1.1, 0.04, { detune: 6 });
        this.tone(v, 261.63, t, 1.4, 0.05, { attack: 0.05 });
        break;
      }
      case 'lose':
        this.tone(v, 440, t, 0.3, 0.09, { type: 'triangle', lowpass: 1400 });
        this.tone(v, 349.23, t + 0.24, 0.3, 0.09, { type: 'triangle', lowpass: 1400 });
        this.tone(v, 293.66, t + 0.48, 1.0, 0.09, { type: 'triangle', lowpass: 1400, glide: 285 });
        this.tone(v, 146.83, t + 0.48, 1.0, 0.05, { attack: 0.04 });
        break;
      case 'shutter':
        this.noise(v, t, 0.012, 0.25, { filter: 'highpass', freq: 3000 });
        this.tone(v, 180, t, 0.04, 0.08, { attack: 0.001, glide: 90 });
        this.noise(v, t + 0.065, 0.03, 0.18, { filter: 'bandpass', freq: 1500, q: 1.5 });
        break;
    }
  }

  /** Master-alarm two-tone: a filtered square warbling between two mid notes, held level, under a second. */
  private alarm(v: Voice, t: number): void {
    const ctx = v.ctx;
    const steps = 6;
    const step = 0.12;
    const hold = steps * step;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    for (let i = 0; i < steps; i++) osc.frequency.setValueAtTime(i % 2 ? 622.25 : 830.61, t + i * step);
    // The low-pass takes the edge off the square: urgent, not shrill.
    const f = v.add(ctx.createBiquadFilter());
    f.type = 'lowpass';
    f.frequency.value = 1500;
    f.Q.value = 0.8;
    const g = v.add(ctx.createGain());
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.01);
    g.gain.setValueAtTime(0.09, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.1);
    osc.connect(f);
    f.connect(g);
    g.connect(v.out);
    v.run(osc, t, t + hold + 0.12);
  }
}
