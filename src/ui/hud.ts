// Top bar: in-game date and time, speed controls, the power readout, the coolant loop, and life support.
import type { Speed } from '../sim/time';
import { SPEEDS } from '../sim/time';
import type { SimSnapshot } from '../sim/types';
import { el, setClass, setText } from './dom';
import { HEAT_MAX_C, HEAT_MIN_C, heatGradientCss } from '../view/heatScale';
import { celsius, formatDate, formatTime, kw, minutes } from './format';

const PAUSE_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2.5" width="3.5" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3.5" height="11" rx="1" fill="currentColor"/></svg>';

const CHEVRON_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const COMPACT_KEY = 'stationkeeper.hudCompact';

/** Phones start with the power card folded to one row; the choice is remembered per browser. */
function initialCompact(): boolean {
  try {
    const saved = localStorage.getItem(COMPACT_KEY);
    if (saved === '1' || saved === '0') return saved === '1';
  } catch {
    // Storage blocked: fall through to the screen-size default.
  }
  return window.matchMedia('(max-width: 719px)').matches;
}

const HEAT_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6.5 2.5a1.5 1.5 0 0 1 3 0v6.3a3 3 0 1 1-3 0z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="11.3" r="1.4" fill="currentColor"/></svg>';

export interface HudHandlers {
  onSpeed(speed: Speed): void;
  onHeatOverlay(on: boolean): void;
  /** The crew reading was tapped. */
  onCrew(): void;
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
  private readonly co2 = el('span', 'mini-v');
  private readonly o2 = el('span', 'mini-v');
  private readonly water = el('span', 'mini-v');
  private readonly crew = el('span', 'mini-v');
  private readonly aboard = el('span', 'mini-u');
  // The folded card: one row of the readings that matter minute to minute.
  private readonly card = el('div', 'power-card');
  private readonly foldButton = el('button', 'fold-toggle');
  private readonly cPower = el('span', 'mini-v');
  private readonly cBattery = el('span', 'mini-v');
  private readonly cBatteryFill = el('i');
  private readonly cBatteryBar = el('div', 'battery-bar', [this.cBatteryFill]);
  private readonly cLoop = el('span', 'mini-v');
  private readonly cCrew = el('span', 'mini-v');
  private compact = initialCompact();

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

    const mini = (label: string, value: HTMLElement, unit: string, extra?: HTMLElement) =>
      el('div', 'mini', [
        el('span', 'stat-k', [label]),
        el('span', 'stat-line', [value, el('span', 'stat-u', [unit])]),
        ...(extra ? [extra] : []),
      ]);
    const stat = (label: string, value: HTMLElement, unit: string, extra: Node[] = []) =>
      el('div', 'stat', [el('span', 'stat-k', [label]), el('span', 'stat-line', [value, el('span', 'stat-u', [unit])]), ...extra]);

    this.foldButton.type = 'button';
    this.foldButton.innerHTML = CHEVRON_ICON;
    // The whole orbit row folds the card: a bigger target than the chevron alone.
    this.orbitState.addEventListener('click', () => this.setCompact(!this.compact));
    this.orbitState.append(el('span', 'orbit-dot'), this.orbitLabel, this.orbitEta, this.foldButton);

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

    const compactRow = el('div', 'compact-row', [
      mini('Power', this.cPower, 'kW'),
      el('div', 'mini', [el('span', 'stat-k', ['Battery']), el('span', 'stat-line', [this.cBattery, el('span', 'stat-u', ['%'])]), this.cBatteryBar]),
      mini('Loop', this.cLoop, '°C'),
      this.crewCell(mini('Crew', this.cCrew, '%'), handlers.onCrew),
    ]);
    this.card.append(
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
      el('div', 'life-row', [
        mini('CO₂', this.co2, 'mmHg'),
        mini('O₂', this.o2, '%'),
        mini('Water', this.water, '%'),
        this.crewCell(mini('Crew', this.crew, '%', this.aboard), handlers.onCrew),
      ]),
      compactRow,
      this.shedNote,
    );
    this.setCompact(this.compact, false);

    this.root = el('header', 'hud', [
      el('div', 'hud-row', [el('div', 'hud-clock', [this.date, this.time, el('span', 'hud-utc', ['UTC'])]), speeds]),
      this.card,
    ]);
    parent.append(this.root);
  }

  private setCompact(on: boolean, remember = true): void {
    this.compact = on;
    setClass(this.card, 'compact', on);
    this.foldButton.setAttribute('aria-expanded', String(!on));
    this.foldButton.setAttribute('aria-label', on ? 'Show all readings' : 'Fold the readings to one row');
    if (!remember) return;
    try {
      localStorage.setItem(COMPACT_KEY, on ? '1' : '0');
    } catch {
      // Storage blocked: the choice lasts until the page closes.
    }
  }

  /** The crew reading doubles as the way into the crew sheet. */
  private crewCell(cell: HTMLElement, onCrew: () => void): HTMLElement {
    cell.classList.add('crew-cell');
    cell.setAttribute('role', 'button');
    cell.tabIndex = 0;
    cell.setAttribute('aria-label', 'Crew: open the crew sheet');
    cell.addEventListener('click', onCrew);
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onCrew();
      }
    });
    return cell;
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
    const eta = !Number.isFinite(o.minutesToTransition)
      ? 'No eclipse on this orbit'
      : o.sunlit
        ? `Eclipse in ${minutes(o.minutesToTransition)}`
        : `Sunrise in ${minutes(o.minutesToTransition)}`;
    setText(this.orbitEta, eta);

    const p = snap.power;
    setText(this.gen, kw(p.generationKw));
    setText(this.load, kw(p.loadKw));
    const pct = Math.round(p.charge * 100);
    setText(this.battery, String(pct));
    this.batteryFill.style.width = `${pct}%`;
    setClass(this.batteryBar, 'low', p.charge < 0.3);
    const net = p.chargeKw - p.dischargeKw;
    setText(this.cPower, `${kw(p.generationKw)} / ${kw(p.loadKw)}`);
    setText(this.cBattery, String(pct));
    this.cBatteryFill.style.width = `${pct}%`;
    setClass(this.cBatteryBar, 'low', p.charge < 0.3);
    setText(this.flow, Math.abs(net) < 0.05 ? (p.charge > 0.995 ? 'Full' : 'Idle') : `${net > 0 ? '+' : '−'}${kw(Math.abs(net))} kW`);
    setClass(this.flow, 'charging', net > 0.05);
    setClass(this.flow, 'discharging', net < -0.05);

    // Coolant loop: the gauge runs from the setpoint (empty) to the first trip (full).
    const th = snap.thermal;
    setText(this.loop, celsius(th.loopC));
    setText(this.cLoop, celsius(th.loopC));
    setClass(this.cLoop, 'warn', th.loopC > th.throttleAboveC || th.throttled);
    setClass(this.cLoop, 'alarm', th.tripped.commercial);
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

    // Life support.
    const ls = snap.lifeSupport;
    const a = ls.alarms;
    setText(this.co2, ls.co2MmHg.toFixed(1));
    setText(this.o2, String(Math.round(ls.o2CapacityKg > 0 ? (ls.o2Kg / ls.o2CapacityKg) * 100 : 0)));
    setText(this.water, String(Math.round(ls.waterCapacityKg > 0 ? (ls.waterKg / ls.waterCapacityKg) * 100 : 0)));
    setText(this.crew, String(Math.round(ls.health * 100)));
    setText(this.aboard, `${ls.crew} crew · ${ls.guests} ${ls.guests === 1 ? 'guest' : 'guests'}`);
    setClass(this.co2, 'warn', a.co2Warn);
    setClass(this.co2, 'alarm', a.co2Danger);
    setClass(this.o2, 'warn', a.o2Low);
    setClass(this.o2, 'alarm', a.o2Out);
    setClass(this.water, 'warn', a.waterLow);
    setClass(this.water, 'alarm', a.waterOut);
    setClass(this.crew, 'warn', ls.health < 0.995);
    setClass(this.crew, 'alarm', a.healthLow);
    setText(this.cCrew, String(Math.round(ls.health * 100)));
    // Folded, the crew figure also stands in for the air and water readings it hides.
    const lsWarn = ls.health < 0.995 || a.co2Warn || a.o2Low || a.waterLow;
    const lsAlarm = a.healthLow || a.co2Danger || a.o2Out || a.waterOut;
    setClass(this.cCrew, 'warn', lsWarn && !lsAlarm);
    setClass(this.cCrew, 'alarm', lsAlarm);

    const notes: string[] = [];
    const shed = [p.shedTiers.essential && 'Essential', (p.shedTiers.commercial || p.shedTiers.essential) && 'Commercial'].filter(Boolean);
    const offline = snap.modules.filter((m) => m.status === 'shed').map((m) => m.name);
    if (offline.length) notes.push(`Load shedding (${shed.join(', ') || 'emergency'}): ${offline.join(', ')} offline`);
    const broken = snap.modules.filter((m) => m.status === 'failed').map((m) => m.name);
    if (broken.length) notes.push(`Failed: ${broken.join(', ')}`);
    const cooked = snap.modules.filter((m) => m.status === 'overheated').map((m) => m.name);
    if (cooked.length) notes.push(`Overheating: ${cooked.join(', ')} tripped until the loop cools`);
    else if (th.throttled) notes.push('Running hot: Commercial loads throttled');
    if (a.o2Out) notes.push('Out of oxygen: crew condition falling fast');
    else if (a.o2Low) notes.push('O₂ reserve low');
    if (a.co2Danger) notes.push(`CO₂ at ${ls.co2MmHg.toFixed(1)} mmHg: crew condition falling`);
    else if (a.co2Warn) notes.push(`CO₂ elevated (${ls.co2MmHg.toFixed(1)} mmHg)`);
    if (a.waterOut) notes.push('Out of water');
    else if (a.waterLow) notes.push('Water running low');
    setClass(this.shedNote, 'visible', notes.length > 0);
    setText(this.shedNote, notes.join(' · '));
  }
}
