// Bottom sheet with details for the tapped module.
import type { ModuleSnapshot, SimSnapshot } from '../sim/types';
import { el, setClass, setText } from './dom';
import { KIND_LABEL, STATUS_LABEL, TIER_LABEL, celsius, kw } from './format';

export interface ModuleSheetHandlers {
  onClose(): void;
  onToggle(moduleId: string, enabled: boolean): void;
}

export class ModuleSheet {
  readonly root: HTMLElement;
  private readonly kind = el('div', 'sheet-kind');
  private readonly title = el('h2', 'sheet-title');
  private readonly desc = el('p', 'sheet-desc');
  private readonly tier = el('span', 'chip');
  private readonly draw = el('dd');
  private readonly statusDot = el('span', 'status-dot');
  private readonly statusText = el('span');
  private readonly outputRow: HTMLElement;
  private readonly output = el('dd');
  private readonly outputLabel = el('dt', '', ['Output']);
  private readonly temp = el('dd');
  private readonly heat = el('dd');
  private readonly storedRow: HTMLElement;
  private readonly stored = el('dd');
  private readonly toggle = el('button', 'sheet-toggle');
  private moduleId: string | null = null;
  private descriptions = new Map<string, string>();

  constructor(parent: HTMLElement, handlers: ModuleSheetHandlers, descriptions: Map<string, string>) {
    this.descriptions = descriptions;
    const close = el('button', 'sheet-close', ['×']);
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => handlers.onClose());

    this.toggle.type = 'button';
    this.toggle.addEventListener('click', () => {
      if (!this.moduleId) return;
      handlers.onToggle(this.moduleId, this.toggle.dataset.enable === 'true');
    });

    const row = (label: string, value: HTMLElement) => el('div', 'sheet-row', [el('dt', '', [label]), value]);
    this.outputRow = el('div', 'sheet-row', [this.outputLabel, this.output]);
    this.storedRow = row('Stored', this.stored);
    const head = el('div', 'sheet-head', [el('div', '', [this.kind, this.title]), close]);

    this.root = el('section', 'sheet', [
      el('div', 'sheet-handle'),
      head,
      this.desc,
      el('dl', 'sheet-rows', [
        row('Power draw', this.draw),
        row('Tier', el('dd', '', [this.tier])),
        row('Status', el('dd', 'status', [this.statusDot, this.statusText])),
        this.outputRow,
        this.storedRow,
        row('Temperature', this.temp),
        row('Heat to loop', this.heat),
      ]),
      this.toggle,
    ]);
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);

    // Swipe the sheet down to close it.
    let startY: number | null = null;
    head.addEventListener('pointerdown', (e) => (startY = e.clientY));
    this.root.querySelector('.sheet-handle')!.addEventListener('pointerdown', (e) => (startY = (e as PointerEvent).clientY));
    window.addEventListener('pointerup', (e) => {
      if (startY !== null && e.clientY - startY > 50) handlers.onClose();
      startY = null;
    });
  }

  get openId(): string | null {
    return this.moduleId;
  }

  open(id: string): void {
    this.moduleId = id;
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
  }

  close(): void {
    this.moduleId = null;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
  }

  update(snap: SimSnapshot): void {
    if (!this.moduleId) return;
    const m = snap.modules.find((x) => x.id === this.moduleId);
    if (!m) return this.close();
    this.render(m);
  }

  private render(m: ModuleSnapshot): void {
    setText(this.kind, `${KIND_LABEL[m.kind]} · ${m.id}`);
    setText(this.title, m.name);
    setText(this.desc, this.descriptions.get(m.defId) ?? '');
    setText(
      this.draw,
      m.status === 'powered'
        ? `${kw(m.actualDrawKw)} kW`
        : m.status === 'throttled'
          ? `${kw(m.actualDrawKw)} kW (throttled from ${kw(m.drawKw)})`
          : `0.0 kW (needs ${kw(m.drawKw)})`,
    );
    setText(this.tier, TIER_LABEL[m.tier]);
    this.tier.className = `chip tier-${m.tier}`;
    setText(this.statusText, STATUS_LABEL[m.status]);
    this.statusDot.className = `status-dot ${m.status}`;

    const hasOutput = m.kind === 'solar' || m.kind === 'radiator';
    setClass(this.outputRow, 'hidden', !hasOutput);
    if (m.kind === 'solar') {
      setText(this.outputLabel, 'Output');
      setText(this.output, `${kw(m.generationKw)} kW`);
    } else if (m.kind === 'radiator') {
      setText(this.outputLabel, 'Rejecting');
      setText(this.output, `${kw(m.rejectKw)} kW of heat`);
    }
    setText(this.temp, `${celsius(m.tempC)} °C`);
    setText(this.heat, `${kw(m.heatKw)} kW`);
    const hasStore = m.capacityKwh > 0;
    setClass(this.storedRow, 'hidden', !hasStore);
    if (hasStore) setText(this.stored, `${m.storedKwh.toFixed(2)} / ${m.capacityKwh.toFixed(1)} kWh (${Math.round((m.storedKwh / m.capacityKwh) * 100)}%)`);

    setText(this.toggle, m.enabled ? 'Switch off' : 'Switch on');
    this.toggle.dataset.enable = String(!m.enabled);
    setClass(this.toggle, 'danger', m.enabled && m.tier === 'critical');
  }
}
