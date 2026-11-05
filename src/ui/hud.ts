// Top bar: in-game date and time, speed controls, the power readout, and the coolant loop.
import type { Speed } from '../sim/time';
import { SPEEDS } from '../sim/time';
import type { SimSnapshot } from '../sim/types';
import { el, setClass, setText } from './dom';
import { HEAT_MAX_C, HEAT_MIN_C, heatGradientCss } from '../view/heatScale';
import { celsius, formatDate, formatTime, kw, minutes } from './format';

const PAUSE_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2.5" width="3.5" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3.5" height="11" rx="1" fill="currentColor"/></svg>';

const HEAT_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6.5 2.5a1.5 1.5 0 0 1 3 0v6.3a3 3 0 1 1-3 0z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="11.3" r="1.4" fill="currentColor"/></svg>';

export interface HudHandlers {
  onSpeed(speed: Speed): void;
  onHeatOverlay(on: boolean): void;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly date = el('span', 'hud-date');
  private readonly time = el('span', 'hud-time');
  private readonly speedButtons = new Map<Speed, HTMLButtonElement>();
  private readonly orbitState = el('div', 'orbit-state');
  private readonly orbitLabel = el('span', 'orbit-label');
  private readonly orbitEta = el('span', 'orbit-eta');
  private readonly gen = el('span', 'stat-v');
  private readonly load = el('span', 'stat-v');
  private readonly battery = el('span', 'stat-v');
  private readonly batteryFill = el('i');
  private readonly batteryBar = el('div', 'battery-bar', [this.batteryFill]);
  private readonly flow = el('span', 'stat-flow');
  private readonly shedNote = el('div', 'shed-note');
  private readonly loop = el('span', 'stat-v');
  private readonly loopFill = el('i');
  private readonly loopThrottleTick = el('b', 'tick');
  private readonly loopBar = el('div', 'loop-bar', [this.loopFill, this.loopThrottleTick]);
  private readonly loopFlow = el('span', 'stat-flow');
  private readonly heatButton = el('button', 'heat-toggle');
  private readonly legend = el('div', 'heat-legend');
  private heatOn = false;

  constructor(parent: HTMLElement, handlers: HudHandlers) {
    const speeds = el('div', 'speeds');
    speeds.setAttribute('role', 'group');
    speeds.setAttribute('aria-label', 'Game speed');
    for (const s of SPEEDS) {
      const b = el('button', 'speed');
      b.type = 'button';
      if (s === 0) {
        b.innerHTML = PAUSE_ICON;
        b.setAttribute('aria-label', 'Pause');
      } else {
        b.textContent = `${s}×`;
        b.setAttribute('aria-label', `Speed ${s}×`);
      }
      b.addEventListener('click', () => handlers.onSpeed(s));
      speeds.append(b);
      this.speedButtons.set(s, b);
    }

    const stat = (label: string, value: HTMLElement, unit: string, extra: Node[] = []) =>
      el('div', 'stat', [el('span', 'stat-k', [label]), el('span', 'stat-line', [value, el('span', 'stat-u', [unit])]), ...extra]);

    this.orbitState.append(el('span', 'orbit-dot'), this.orbitLabel, this.orbitEta);

    this.heatButton.type = 'button';
    this.heatButton.innerHTML = `${HEAT_ICON}<span>Heat</span>`;
    this.heatButton.setAttribute('aria-pressed', 'false');
    this.heatButton.setAttribute('aria-label', 'Heat overlay');
    this.heatButton.addEventListener('click', () => {
      this.heatOn = !this.heatOn;
      this.heatButton.setAttribute('aria-pressed', String(this.heatOn));
      setClass(this.heatButton, 'active', this.heatOn);
      setClass(this.legend, 'visible', this.heatOn);
      handlers.onHeatOverlay(this.heatOn);
    });
    const ramp = el('i');
    ramp.style.background = heatGradientCss();
    this.legend.append(el('span', '', [`${HEAT_MIN_C}°`]), ramp, el('span', '', [`${HEAT_MAX_C}°C`]));

    this.root = el('header', 'hud', [
      el('div', 'hud-row', [el('div', 'hud-clock', [this.date, this.time, el('span', 'hud-utc', ['UTC'])]), speeds]),
      el('div', 'power-card', [
        this.orbitState,
        el('div', 'stats', [
          stat('Generation', this.gen, 'kW'),
          stat('Load', this.load, 'kW'),
          stat('Battery', this.battery, '%', [this.batteryBar, this.flow]),
        ]),
        el('div', 'thermal-row', [
          el('div', 'stat loop-stat', [
            el('span', 'stat-k', ['Coolant loop']),
            el('span', 'stat-line', [this.loop, el('span', 'stat-u', ['°C'])]),
          ]),
          el('div', 'loop-gauge', [this.loopBar, this.loopFlow]),
          this.heatButton,
        ]),
        this.legend,
        this.shedNote,
      ]),
    ]);
    parent.append(this.root);
  }

  update(snap: SimSnapshot, speed: Speed): void {
    setText(this.date, formatDate(snap.timeMs));
    setText(this.time, formatTime(snap.timeMs));
    for (const [s, b] of this.speedButtons) {
      setClass(b, 'active', s === speed);
      b.setAttribute('aria-pressed', String(s === speed));
    }

    const o = snap.orbit;
    setClass(this.orbitState, 'eclipse', !o.sunlit);
    setText(this.orbitLabel, o.sunlit ? 'Sunlight' : 'Eclipse');
    setText(this.orbitEta, o.sunlit ? `Eclipse in ${minutes(o.minutesToTransition)}` : `Sunrise in ${minutes(o.minutesToTransition)}`);

    const p = snap.power;
    setText(this.gen, kw(p.generationKw));
    setText(this.load, kw(p.loadKw));
    const pct = Math.round(p.charge * 100);
    setText(this.battery, String(pct));
    this.batteryFill.style.width = `${pct}%`;
    setClass(this.batteryBar, 'low', p.charge < 0.3);
    const net = p.chargeKw - p.dischargeKw;
    setText(this.flow, Math.abs(net) < 0.05 ? (p.charge > 0.995 ? 'Full' : 'Idle') : `${net > 0 ? '+' : '−'}${kw(Math.abs(net))} kW`);
    setClass(this.flow, 'charging', net > 0.05);
    setClass(this.flow, 'discharging', net < -0.05);

    // Coolant loop: the gauge runs from the setpoint (empty) to the first trip (full).
    const th = snap.thermal;
    setText(this.loop, celsius(th.loopC));
    const span = Math.max(1e-6, th.tripAboveC - th.setpointC);
    const frac = Math.min(1, Math.max(0, (th.loopC - th.setpointC) / span));
    this.loopFill.style.width = `${(frac * 100).toFixed(1)}%`;
    this.loopThrottleTick.style.left = `${(((th.throttleAboveC - th.setpointC) / span) * 100).toFixed(1)}%`;
    setClass(this.loopBar, 'warm', th.loopC > th.throttleAboveC || th.throttled);
    setClass(this.loopBar, 'hot', th.tripped.commercial);
    const netHeat = th.heatKw - th.rejectKw;
    setText(this.loopFlow, Math.abs(netHeat) < 0.05 ? `Holding · ${kw(th.rejectKw)} kW out` : `${netHeat > 0 ? 'Warming' : 'Cooling'} ${kw(Math.abs(netHeat))} kW`);
    setClass(this.loopFlow, 'discharging', netHeat > 0.05);
    setClass(this.loopFlow, 'charging', netHeat < -0.05);

    const notes: string[] = [];
    const shed = [p.shedTiers.essential && 'Essential', (p.shedTiers.commercial || p.shedTiers.essential) && 'Commercial'].filter(Boolean);
    const offline = snap.modules.filter((m) => m.status === 'shed').map((m) => m.name);
    if (offline.length) notes.push(`Load shedding (${shed.join(', ') || 'emergency'}): ${offline.join(', ')} offline`);
    const cooked = snap.modules.filter((m) => m.status === 'overheated').map((m) => m.name);
    if (cooked.length) notes.push(`Overheating: ${cooked.join(', ')} tripped until the loop cools`);
    else if (th.throttled) notes.push('Running hot: Commercial loads throttled');
    setClass(this.shedNote, 'visible', notes.length > 0);
    setText(this.shedNote, notes.join(' · '));
  }
}
