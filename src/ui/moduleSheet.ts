// Bottom sheet with details for the tapped module.
import type { ModuleDef, ModuleSnapshot, SimSnapshot } from '../sim/types';
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
  private readonly aboardRow: HTMLElement;
  private readonly aboard = el('dd');
  private readonly lsRows: HTMLElement[];
  private readonly o2Made = el('dd');
  private readonly co2Scrubbed = el('dd');
  private readonly tanks = el('dd');
  private moduleId: string | null = null;

  constructor(
    parent: HTMLElement,
    handlers: ModuleSheetHandlers,
    private readonly defs: Map<string, ModuleDef>,
  ) {
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
    this.aboardRow = row('Aboard', this.aboard);
    this.lsRows = [row('O₂ made', this.o2Made), row('CO₂ scrubbed', this.co2Scrubbed), row('Tanks', this.tanks)];
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
        ...this.lsRows,
        this.aboardRow,
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
    this.render(m, snap);
  }

  private render(m: ModuleSnapshot, snap: SimSnapshot): void {
    const def = this.defs.get(m.defId);
    setText(this.kind, `${KIND_LABEL[m.kind]} · ${m.id}`);
    setText(this.title, m.name);
    setText(this.desc, def?.description ?? '');
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
    const cabin = def?.cabin;
    const people = [cabin?.crew && `${cabin.crew} crew`, cabin?.guests && `${cabin.guests} guests`].filter(Boolean).join(', ');
    setClass(this.aboardRow, 'hidden', !people);
    setText(this.aboard, people);

    const rack = def?.lifeSupport;
    for (const r of this.lsRows) setClass(r, 'hidden', !rack);
    if (rack) {
      // One rack today, so the station totals are this rack's work.
      const ls = snap.lifeSupport;
      setText(this.o2Made, `${ls.o2MadeKgPerDay.toFixed(1)} of ${rack.o2KgPerDay.toFixed(1)} kg/day`);
      setText(this.co2Scrubbed, `${ls.co2RemovedKgPerDay.toFixed(1)} of ${rack.co2KgPerDay.toFixed(1)} kg/day`);
      setText(this.tanks, `O₂ ${ls.o2Kg.toFixed(1)}/${ls.o2CapacityKg} kg · water ${Math.round(ls.waterKg)}/${ls.waterCapacityKg} kg`);
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
