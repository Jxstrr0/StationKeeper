// The warning feed: a button that shows how many problems there are, and a sheet that groups them by root cause.
// "Radiator failed" heads a group with "Coolant loop hot", "Essential loads tripped" and "CO₂ high" under it,
// so one repair is clearly the fix for all of them. Root causes on modules get Service, Repair, or Show buttons.
import type { ModuleDef, ModuleSnapshot, SimSnapshot, StationWarning, WarningSeverity } from '../sim/types';
import { effectsOf, rootCauses } from '../sim/warnings';
import { el, setClass, setText } from './dom';
import { minutes } from './format';
import { repairText, warningTitle } from './warningText';

export interface WarningGroup {
  /** Stable id from the root keys. */
  key: string;
  roots: StationWarning[];
  /** Problems these roots cause, nearest first. */
  effects: StationWarning[];
  severity: WarningSeverity;
}

const RANK: Record<WarningSeverity, number> = { info: 0, warn: 1, alarm: 2 };
const worst = (list: readonly StationWarning[]): WarningSeverity =>
  list.reduce<WarningSeverity>((s, w) => (RANK[w.severity] > RANK[s] ? w.severity : s), 'info');

/** Group every warning or alarm under its root causes. Info-only roots (eclipse, servicing) appear only as causes. */
export function groupWarnings(warnings: readonly StationWarning[]): WarningGroup[] {
  const byKey = new Map(warnings.map((w) => [w.key, w]));
  const groups = new Map<string, { roots: string[]; members: Set<string> }>();
  for (const w of warnings) {
    if (w.severity === 'info') continue;
    const roots = rootCauses(warnings, w.key).sort();
    const key = roots.join('|');
    const g = groups.get(key) ?? { roots, members: new Set<string>() };
    g.members.add(w.key);
    groups.set(key, g);
  }
  // A root cause that is a problem in itself (a failed radiator) already heads the group of what it causes.
  for (const [key, g] of groups) {
    const lone = g.roots.length === 1 && g.members.size === 1 && g.members.has(g.roots[0]!);
    if (lone && [...groups.values()].some((o) => o !== g && o.roots.includes(g.roots[0]!))) groups.delete(key);
  }
  const out: WarningGroup[] = [];
  for (const [key, g] of groups) {
    const roots = g.roots.map((k) => byKey.get(k)!);
    const order = g.roots.flatMap((r) => effectsOf(warnings, r));
    const effects = [...new Set(order)].filter((k) => g.members.has(k) && !g.roots.includes(k)).map((k) => byKey.get(k)!);
    out.push({ key, roots, effects, severity: worst([...roots, ...effects]) });
  }
  return out.sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.key.localeCompare(b.key));
}

export interface WarningsPanelHandlers {
  onOpen(): void;
  onClose(): void;
  /** Point the camera at a module and open its sheet. */
  onShow(moduleId: string): void;
  onRepair(moduleId: string): void;
  onCancelRepair(moduleId: string): void;
  onSwitchOn(moduleId: string): void;
}

const WARN_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 2.2 14.6 13.6H1.4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6.4v3.2M8 11.4v.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

export class WarningsPanel {
  readonly button = el('button', 'warn-fab hidden');
  readonly root = el('section', 'warn-sheet');
  private readonly count = el('span', 'warn-count');
  private readonly list = el('div', 'warn-groups');
  private readonly crew = el('div', 'warn-crew');
  /** Text nodes kept between rebuilds, updated in place each frame. */
  private titles = new Map<string, HTMLElement>();
  private repairNotes = new Map<string, HTMLElement>();
  private structure = '';
  private isOpenNow = false;

  constructor(
    parent: HTMLElement,
    private readonly defs: Map<string, ModuleDef>,
    /** Repairs take this many times a service (scenario reliability config). */
    private readonly repairFactor: number,
    private readonly handlers: WarningsPanelHandlers,
  ) {
    this.button.type = 'button';
    this.button.innerHTML = WARN_ICON;
    this.button.append(this.count);
    this.button.addEventListener('click', () => (this.isOpenNow ? handlers.onClose() : handlers.onOpen()));

    const close = el('button', 'sheet-close', ['×']);
    close.type = 'button';
    close.setAttribute('aria-label', 'Close warnings');
    close.addEventListener('click', () => handlers.onClose());
    this.root.append(el('div', 'build-head', [el('h2', 'build-title', ['Warnings']), close]), el('div', 'warn-scroll', [this.list, this.crew]));
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root, this.button);
  }

  get isOpen(): boolean {
    return this.isOpenNow;
  }

  open(): void {
    this.isOpenNow = true;
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    setClass(this.button, 'active', true);
  }

  close(): void {
    this.isOpenNow = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    setClass(this.button, 'active', false);
  }

  update(snap: SimSnapshot): void {
    const groups = groupWarnings(snap.warnings);
    const working = snap.modules.filter((m) => m.repair);
    const problems = groups.reduce((n, g) => n + g.roots.length + g.effects.length, 0);
    const severity = groups[0]?.severity ?? 'info';
    setText(this.count, problems > 0 ? String(problems) : working.length > 0 ? 'Crew' : '');
    this.button.setAttribute('aria-label', problems > 0 ? `${problems} warnings` : 'Warnings');
    setClass(this.button, 'hidden', problems === 0 && working.length === 0);
    setClass(this.button, 'alarm', severity === 'alarm');
    setClass(this.button, 'warn', severity === 'warn');
    if (!this.isOpenNow) return;

    const mod = (id: string) => snap.modules.find((m) => m.id === id);
    const structure = JSON.stringify([groups.map((g) => [g.key, g.effects.map((e) => e.key), g.roots.map((r) => this.actionKind(r, mod))]), working.map((m) => m.id)]);
    if (structure !== this.structure) {
      this.structure = structure;
      this.rebuild(groups, working, mod);
    }
    for (const w of snap.warnings) {
      const node = this.titles.get(w.key);
      if (node) setText(node, warningTitle(w, mod));
    }
    for (const m of working) {
      const node = this.repairNotes.get(m.id);
      if (node) setText(node, repairText(m) ?? '');
    }
  }

  /** Which button a root cause gets; part of the structure, so a change rebuilds the list. */
  private actionKind(w: StationWarning, mod: (id: string) => ModuleSnapshot | undefined): string {
    const m = w.moduleId ? mod(w.moduleId) : undefined;
    if (!m) return 'none';
    if (m.repair) return 'listed';
    if (w.kind === 'moduleFailed') return 'repair';
    if (w.kind === 'moduleWorn') return 'service';
    if (w.kind === 'moduleOff') return 'switch';
    return 'show';
  }

  private rebuild(groups: WarningGroup[], working: ModuleSnapshot[], mod: (id: string) => ModuleSnapshot | undefined): void {
    this.titles = new Map();
    this.repairNotes = new Map();
    const title = (w: StationWarning, cls: string) => {
      const node = el('span', cls, [warningTitle(w, mod)]);
      this.titles.set(w.key, node);
      return node;
    };
    const button = (label: string, cls: string, onClick: () => void) => {
      const b = el('button', cls, [label]);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    };

    this.list.replaceChildren(
      ...(groups.length === 0 ? [el('p', 'warn-empty', ['All quiet. Nothing needs attention.'])] : []),
      ...groups.map((g) => {
        const roots = g.roots.map((r) => {
          const m = r.moduleId ? mod(r.moduleId) : undefined;
          const actions: HTMLElement[] = [];
          if (m) {
            const hours = this.defs.get(m.defId)?.reliability?.serviceHours ?? 0;
            const kind = this.actionKind(r, mod);
            if (kind === 'repair') actions.push(button(`Repair · ${minutes(hours * this.repairFactor * 60)}`, 'warn-act primary', () => this.handlers.onRepair(m.id)));
            if (kind === 'service') actions.push(button(`Service · ${minutes(hours * 60)}`, 'warn-act primary', () => this.handlers.onRepair(m.id)));
            if (kind === 'switch') actions.push(button('Switch on', 'warn-act primary', () => this.handlers.onSwitchOn(m.id)));
            actions.push(button('Show', 'warn-act', () => this.handlers.onShow(m.id)));
          }
          const note = m?.repair ? el('span', 'warn-note', [repairText(m) ?? '']) : null;
          if (m && note) this.repairNotes.set(m.id, note);
          return el('div', `warn-root ${r.severity}`, [
            el('span', 'sev-dot'),
            el('div', 'warn-root-text', [title(r, 'warn-title'), ...(note ? [note] : [])]),
            el('div', 'warn-actions', actions),
          ]);
        });
        const effects = g.effects.map((e) => el('li', `warn-effect ${e.severity}`, [title(e, '')]));
        return el('article', `warn-group ${g.severity}`, [
          ...roots,
          ...(effects.length ? [el('p', 'warn-leads', [g.roots.length > 1 ? 'Together these cause:' : 'This causes:']), el('ul', 'warn-effects', effects)] : []),
        ]);
      }),
    );

    this.crew.replaceChildren(
      ...(working.length
        ? [
            el('h3', 'warn-crew-title', ["Crew's list"]),
            ...working.map((m) => {
              const note = el('span', 'warn-note', [repairText(m) ?? '']);
              this.repairNotes.set(m.id, note);
              return el('div', 'warn-crew-row', [
                el('div', 'warn-root-text', [el('span', 'warn-title', [m.name]), note]),
                el('div', 'warn-actions', [button('Cancel', 'warn-act', () => this.handlers.onCancelRepair(m.id)), button('Show', 'warn-act', () => this.handlers.onShow(m.id))]),
              ]);
            }),
          ]
        : []),
    );
  }
}
