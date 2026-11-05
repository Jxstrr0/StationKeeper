// Build mode overlay: a Build button, a tray of modules, a "tap a port" hint, and an effect preview
// with Build / Back. main.ts runs the steps; this file only draws them and reports taps.
import type { Forecast } from '../sim/forecast';
import type { ModuleDef } from '../sim/types';
import { el, setClass, setText } from './dom';
import { KIND_LABEL, TIER_LABEL, kw } from './format';

export interface BuildPanelHandlers {
  onOpen(): void;
  onClose(): void;
  onPick(defId: string): void;
  onBack(): void;
  onConfirm(): void;
}

const BUILD_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

/** The two or three facts that matter most about a module, for its tray card. */
export function moduleHighlights(def: ModuleDef): string[] {
  const out: string[] = [];
  const p = def.power;
  if (p.generationKw) out.push(`+${kw(p.generationKw)} kW in sunlight`);
  if (p.storageKwh) out.push(`+${kw(p.storageKwh)} kWh storage`);
  if (def.thermal.rejectKw) out.push(`+${kw(def.thermal.rejectKw)} kW heat rejection`);
  if (def.lifeSupport) out.push(`O₂ ${def.lifeSupport.o2KgPerDay} kg/day · CO₂ ${def.lifeSupport.co2KgPerDay} kg/day`);
  const people = [def.cabin?.crew && `${def.cabin.crew} crew`, def.cabin?.guests && `${def.cabin.guests} guests`].filter(Boolean);
  if (people.length) out.push(people.join(', '));
  if (p.drawKw > 0) out.push(`Draws ${kw(p.drawKw)} kW · ${TIER_LABEL[p.tier]}`);
  return out;
}

export interface PreviewRow {
  label: string;
  before: string;
  after: string;
  /** Whether the change is good, bad, or neither. */
  tone: 'good' | 'bad' | 'same';
}

/** Compare two forecasts into rows worth showing. Rows that don't change are dropped, except the first two. */
export function previewRows(base: Forecast, next: Forecast): PreviewRow[] {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const deg = (v: number) => `${v.toFixed(1)} °C`;
  const min = (v: number) => `${v} min`;
  const tone = (b: number, a: number, higherIsBetter: boolean, eps: number): PreviewRow['tone'] =>
    Math.abs(a - b) < eps ? 'same' : a > b === higherIsBetter ? 'good' : 'bad';
  const rows: (PreviewRow & { always?: boolean })[] = [
    { label: 'Lowest battery', before: pct(base.minCharge), after: pct(next.minCharge), tone: tone(base.minCharge, next.minCharge, true, 0.005), always: true },
    { label: 'Hottest loop', before: deg(base.maxLoopC), after: deg(next.maxLoopC), tone: tone(base.maxLoopC, next.maxLoopC, false, 0.05), always: true },
    { label: 'Load shed', before: min(base.shedMinutes), after: min(next.shedMinutes), tone: tone(base.shedMinutes, next.shedMinutes, false, 0.5) },
    { label: 'Throttled', before: min(base.throttledMinutes), after: min(next.throttledMinutes), tone: tone(base.throttledMinutes, next.throttledMinutes, false, 0.5) },
    { label: 'Overheated', before: min(base.trippedMinutes), after: min(next.trippedMinutes), tone: tone(base.trippedMinutes, next.trippedMinutes, false, 0.5) },
    {
      label: 'Peak CO₂',
      before: `${base.highestCo2MmHg.toFixed(1)} mmHg`,
      after: `${next.highestCo2MmHg.toFixed(1)} mmHg`,
      tone: tone(base.highestCo2MmHg, next.highestCo2MmHg, false, 0.05),
    },
    { label: 'People aboard', before: String(base.people), after: String(next.people), tone: 'same' },
    {
      label: 'Water used',
      before: `${Math.max(0, -base.waterChangeKg).toFixed(1)} kg`,
      after: `${Math.max(0, -next.waterChangeKg).toFixed(1)} kg`,
      tone: tone(-base.waterChangeKg, -next.waterChangeKg, false, 0.05),
    },
  ];
  return rows.filter((r) => r.always || r.before !== r.after).map(({ label, before, after, tone }) => ({ label, before, after, tone }));
}

type Mode = 'closed' | 'tray' | 'placing' | 'preview';

export class BuildPanel {
  readonly button = el('button', 'build-fab');
  readonly root = el('section', 'build-sheet');
  private readonly tray = el('div', 'build-tray');
  private readonly hint = el('div', 'build-hint');
  private readonly hintText = el('span');
  private readonly preview = el('div', 'build-preview');
  private readonly previewTitle = el('h3', 'build-preview-title');
  private readonly previewSub = el('p', 'build-preview-sub');
  private readonly previewRowsEl = el('dl', 'build-rows');
  private readonly blocked = el('p', 'build-blocked');
  private readonly confirm = el('button', 'build-confirm');
  private mode: Mode = 'closed';

  constructor(parent: HTMLElement, defs: readonly ModuleDef[], handlers: BuildPanelHandlers) {
    this.button.type = 'button';
    this.button.innerHTML = `${BUILD_ICON}<span>Build</span>`;
    this.button.setAttribute('aria-label', 'Build a module');
    this.button.addEventListener('click', () => (this.mode === 'closed' ? handlers.onOpen() : handlers.onClose()));

    const close = el('button', 'sheet-close', ['×']);
    close.type = 'button';
    close.setAttribute('aria-label', 'Close build mode');
    close.addEventListener('click', () => handlers.onClose());

    for (const def of defs) {
      const card = el('button', 'build-card', [
        el('span', 'build-card-kind', [KIND_LABEL[def.kind]]),
        el('span', 'build-card-name', [def.name]),
        ...moduleHighlights(def).map((h) => el('span', 'build-card-line', [h])),
      ]);
      card.type = 'button';
      card.addEventListener('click', () => handlers.onPick(def.id));
      this.tray.append(card);
    }

    const back = (label: string) => {
      const b = el('button', 'build-back', [label]);
      b.type = 'button';
      b.addEventListener('click', () => handlers.onBack());
      return b;
    };
    this.hint.append(this.hintText, back('Back'));
    this.confirm.type = 'button';
    this.confirm.textContent = 'Build';
    this.confirm.addEventListener('click', () => handlers.onConfirm());
    this.preview.append(
      this.previewTitle,
      this.previewSub,
      this.previewRowsEl,
      this.blocked,
      el('div', 'build-actions', [back('Back'), this.confirm]),
    );

    this.root.append(
      el('div', 'build-head', [el('h2', 'build-title', ['Build']), close]),
      this.tray,
      this.hint,
      this.preview,
    );
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root, this.button);
    this.setMode('closed');
  }

  get isOpen(): boolean {
    return this.mode !== 'closed';
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    setClass(this.root, 'open', mode !== 'closed');
    this.root.setAttribute('aria-hidden', String(mode === 'closed'));
    setClass(this.button, 'active', mode !== 'closed');
    setClass(this.tray, 'hidden', mode !== 'tray');
    setClass(this.hint, 'hidden', mode !== 'placing');
    setClass(this.preview, 'hidden', mode !== 'preview');
    setClass(this.root, 'compact', mode === 'placing');
  }

  showTray(): void {
    this.setMode('tray');
  }

  /** "Tap a glowing port" step. */
  showPlacing(name: string, portCount: number): void {
    setText(this.hintText, portCount > 0 ? `Tap a glowing port to place the ${name}.` : `No free port fits a ${name}.`);
    this.setMode('placing');
  }

  /** Preview step. `rows` is null while the forecast is still being worked out. */
  showPreview(title: string, sub: string, rows: PreviewRow[] | null, blockedBy: string | null): void {
    setText(this.previewTitle, title);
    setText(this.previewSub, sub);
    this.previewRowsEl.replaceChildren(
      ...(rows ?? []).map((r) =>
        el('div', `build-row ${r.tone}`, [el('dt', '', [r.label]), el('dd', '', [r.before, el('span', 'arrow', [' → ']), el('b', '', [r.after])])]),
      ),
    );
    setText(this.blocked, blockedBy ? `Blocked: it would run into the ${blockedBy}.` : '');
    setClass(this.blocked, 'hidden', !blockedBy);
    this.confirm.disabled = !!blockedBy || rows === null;
    this.setMode('preview');
  }

  close(): void {
    this.setMode('closed');
  }
}
