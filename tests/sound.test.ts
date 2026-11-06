import { afterEach, describe, expect, it } from 'vitest';
import { Sound, type Cue } from '../src/audio/sound';

const CUES: Cue[] = ['click', 'open', 'close', 'toast', 'warn', 'alarm', 'docked', 'report', 'win', 'lose', 'shutter', 'build'];

// Just enough of Web Audio for the engine to build its graph. Automation is collapsed: every scheduled value lands at once,
// so `value` reads as "where this param is heading", which is what the tests care about.
class FakeParam {
  constructor(public value: number) {}
  setValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number): this {
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

class FakeNode {
  connections: unknown[] = [];
  connect<T>(dest: T): T {
    this.connections.push(dest);
    return dest;
  }
  disconnect(): void {
    this.connections = [];
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeBiquad extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  gain = new FakeParam(0);
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
}

class FakeSource extends FakeNode {
  started = false;
  stopAt = Infinity;
  onended: (() => void) | null = null;
  start(): void {
    this.started = true;
  }
  stop(when = 0): void {
    this.stopAt = when;
  }
  end(): void {
    this.onended?.();
  }
}

class FakeOscillator extends FakeSource {
  type = 'sine';
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
}

class FakeBuffer {
  private readonly data: Float32Array;
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  playbackRate = new FakeParam(1);
  detune = new FakeParam(0);
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  compressors: FakeCompressor[] = [];
  resumes = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createOscillator(): FakeOscillator {
    const o = new FakeOscillator();
    this.sources.push(o);
    return o;
  }
  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }
  createBiquadFilter(): FakeBiquad {
    return new FakeBiquad();
  }
  createDynamicsCompressor(): FakeCompressor {
    const c = new FakeCompressor();
    this.compressors.push(c);
    return c;
  }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    return new FakeBuffer(channels, length, rate);
  }
  resume(): Promise<void> {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  /** The master gain is the one feeding the compressor. */
  master(): FakeGain {
    const comp = this.compressors[0];
    const m = this.gains.find((g) => g.connections.includes(comp));
    if (!m) throw new Error('no master gain');
    return m;
  }
  /** Cue voices are the gains that feed a bus, and the buses are what feed the master. */
  voiceOuts(): FakeGain[] {
    const master = this.master();
    const buses = this.gains.filter((g) => g.connections.includes(master));
    return this.gains.filter((g) => buses.some((b) => g.connections.includes(b)));
  }
}

type AudioGlobals = { AudioContext?: unknown; webkitAudioContext?: unknown };
const globals = globalThis as unknown as AudioGlobals;

function installFake(): void {
  FakeAudioContext.instances = [];
  globals.AudioContext = FakeAudioContext;
}

afterEach(() => {
  delete globals.AudioContext;
  delete globals.webkitAudioContext;
});

describe('Sound without Web Audio', () => {
  it('is a silent no-op for every method', () => {
    expect(globals.AudioContext).toBeUndefined();
    const s = new Sound();
    expect(() => {
      s.unlock();
      s.unlock();
      s.setVolume(0.5);
      s.setVolume(Number.NaN);
      s.setMuted(true);
      s.setMuted(false);
      s.setAmbient(true);
      s.setEclipse(1);
      s.setPace(0.5);
      for (const c of CUES) s.play(c);
      s.setAmbient(false);
      s.dispose();
      s.play('click');
      s.unlock();
    }).not.toThrow();
  });

  it('stays quiet when the constructor throws', () => {
    globals.AudioContext = class {
      constructor() {
        throw new Error('blocked');
      }
    };
    const s = new Sound();
    expect(() => {
      s.unlock();
      s.play('click');
      s.setAmbient(true);
      s.dispose();
    }).not.toThrow();
  });
});

describe('Sound with a fake AudioContext', () => {
  it('creates the context once on unlock, and plays the iOS silent buffer', () => {
    installFake();
    const s = new Sound();
    expect(FakeAudioContext.instances).toHaveLength(0);
    s.unlock();
    s.unlock();
    s.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0];
    const primer = ctx.sources.find((src) => src instanceof FakeBufferSource && src.buffer?.length === 1);
    expect(primer?.started).toBe(true);
    expect(primer?.connections).toContain(ctx.destination);
  });

  it('falls back to webkitAudioContext', () => {
    FakeAudioContext.instances = [];
    globals.webkitAudioContext = FakeAudioContext;
    new Sound().unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('resumes a suspended context on a later unlock', () => {
    installFake();
    const s = new Sound();
    s.unlock();
    const ctx = FakeAudioContext.instances[0];
    ctx.state = 'suspended';
    s.unlock();
    expect(ctx.resumes).toBe(1);
    expect(ctx.state).toBe('running');
  });

  it('rate-limits repeats of the same cue, and the alarm much harder', () => {
    installFake();
    const s = new Sound();
    s.unlock();
    const ctx = FakeAudioContext.instances[0];
    const count = (): number => ctx.sources.length;

    let n = count();
    s.play('click');
    expect(count()).toBeGreaterThan(n);
    n = count();
    s.play('click');
    ctx.currentTime += 0.05;
    s.play('click');
    expect(count()).toBe(n);
    ctx.currentTime += 0.1;
    s.play('click');
    expect(count()).toBeGreaterThan(n);

    // A different cue isn't held back by the click.
    n = count();
    s.play('open');
    expect(count()).toBeGreaterThan(n);

    ctx.currentTime += 10;
    n = count();
    s.play('alarm');
    expect(count()).toBeGreaterThan(n);
    n = count();
    ctx.currentTime += 1;
    s.play('alarm');
    ctx.currentTime += 2;
    s.play('alarm');
    expect(count()).toBe(n);
    ctx.currentTime += 1.5;
    s.play('alarm');
    expect(count()).toBeGreaterThan(n);
  });

  it('caps concurrent voices', () => {
    installFake();
    const s = new Sound();
    s.unlock();
    const ctx = FakeAudioContext.instances[0];
    for (const c of CUES) s.play(c);
    expect(ctx.voiceOuts()).toHaveLength(8);
    // Once they've all finished there is room again.
    ctx.currentTime += 5;
    for (const src of ctx.sources) src.end();
    expect(ctx.voiceOuts()).toHaveLength(0);
    s.play('click');
    s.play('toast');
    expect(ctx.voiceOuts()).toHaveLength(2);
  });

  it('disconnects a cue once its sources end', () => {
    installFake();
    const s = new Sound();
    s.unlock();
    const ctx = FakeAudioContext.instances[0];
    const before = ctx.sources.length;
    s.play('open');
    const voice = ctx.voiceOuts()[0];
    expect(voice.connections).toHaveLength(1);
    for (const src of ctx.sources.slice(before)) src.end();
    expect(voice.connections).toHaveLength(0);
  });

  it('mutes by sending the master gain to 0, and unmutes to the set volume', () => {
    installFake();
    const s = new Sound();
    s.unlock();
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.master().gain.value).toBeGreaterThan(0);
    s.setMuted(true);
    expect(ctx.master().gain.value).toBe(0);
    s.setVolume(0.5);
    expect(ctx.master().gain.value).toBe(0);
    s.setMuted(false);
    const half = ctx.master().gain.value;
    expect(half).toBeGreaterThan(0);
    s.setVolume(1);
    expect(ctx.master().gain.value).toBeCloseTo(half * 2);
  });

  it('plays nothing while muted, and honours a mute set before unlock', () => {
    installFake();
    const s = new Sound();
    s.setMuted(true);
    s.unlock();
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.master().gain.value).toBe(0);
    const n = ctx.sources.length;
    s.play('toast');
    expect(ctx.sources.length).toBe(n);
  });

  it('starts the ambient hum asked for before unlock, and stops it when turned off', () => {
    installFake();
    const s = new Sound();
    s.setAmbient(true);
    s.setEclipse(1);
    s.unlock();
    const ctx = FakeAudioContext.instances[0];
    const air = ctx.sources.find((src) => src instanceof FakeBufferSource && src.loop);
    expect(air?.started).toBe(true);
    expect(air?.stopAt).toBe(Infinity);
    s.setAmbient(false);
    expect(air?.stopAt).toBeLessThan(3);
  });

  it('closes the context on dispose and ignores calls afterwards', () => {
    installFake();
    const s = new Sound();
    s.unlock();
    const ctx = FakeAudioContext.instances[0];
    s.dispose();
    expect(ctx.state).toBe('closed');
    s.unlock();
    s.play('click');
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});
