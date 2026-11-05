// Top bar: in-game date and time, speed controls, and the power readout.
import type { Speed } from '../sim/time';
import { SPEEDS } from '../sim/time';
import type { SimSnapshot } from '../sim/types';
import { el, setClass, setText } from './dom';
import { formatDate, formatTime, kw, minutes } from './format';

const PAUSE_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2.5" width="3.5" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3.5" height="11" rx="1" fill="currentColor"/></svg>';

export interface HudHandlers {
  onSpeed(speed: Speed): void;
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

    this.root = el('header', 'hud', [
      el('div', 'hud-row', [el('div', 'hud-clock', [this.date, this.time, el('span', 'hud-utc', ['UTC'])]), speeds]),
      el('div', 'power-card', [
        this.orbitState,
        el('div', 'stats', [
          stat('Generation', this.gen, 'kW'),
          stat('Load', this.load, 'kW'),
          stat('Battery', this.battery, '%', [this.batteryBar, this.flow]),
        ]),
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

    const shed = [p.shedTiers.essential && 'Essential', (p.shedTiers.commercial || p.shedTiers.essential) && 'Commercial'].filter(Boolean);
    const offline = snap.modules.filter((m) => m.status === 'shed').map((m) => m.name);
    setClass(this.shedNote, 'visible', offline.length > 0);
    setText(this.shedNote, offline.length ? `Load shedding (${shed.join(', ') || 'emergency'}): ${offline.join(', ')} offline` : '');
  }
}
