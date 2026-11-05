// The crew sheet: who is aboard and who is on the way up, what they do, and hiring or sending people home.
// Opened from the crew reading in the top bar. Rebuilt only when the roster changes, so buttons stay put at 20×.
import type { CrewMemberSnapshot, CrewRole, SimSnapshot } from '../sim/types';
import { el, setClass, setText } from './dom';
import { minutes, money } from './format';

export interface CrewPanelHandlers {
  onClose(): void;
  onHire(role: CrewRole): void;
  onDismiss(crewId: string): void;
}

const ROLE: Record<CrewRole, { label: string; does: string }> = {
  engineer: { label: 'Engineer', does: 'One more repair team, so one more job can be worked on at a time.' },
  scientist: { label: 'Scientist', does: 'Runs a lab at full speed. A lab with nobody to run it works at half pace.' },
};

/** How long "Send home" stays armed for the second tap, ms. */
const CONFIRM_MS = 4000;

/** Why nobody can be hired right now, or null. */
export function hireBlocked(snap: SimSnapshot): string | null {
  const c = snap.crew;
  if (c.bunksTaken >= c.bunks) return 'Every bunk is taken. Build Crew Quarters for four more.';
  if (snap.economy.cash < c.signingFee) return `Signing someone costs ${money(c.signingFee)}.`;
  return null;
}

/** "Aboard · On shift", "Ill, back in 9 h", "Arrives in 3 h": what someone is doing now. */
export function memberStatusText(m: CrewMemberSnapshot): string {
  switch (m.status) {
    case 'inFlight':
      return `Arrives in ${minutes((m.arrivesInHours ?? 0) * 60)}`;
    case 'onShift':
      return m.tired ? 'On shift, tiring' : 'On shift';
    case 'resting':
      return 'Off shift';
    case 'exhausted':
      return 'Exhausted, resting';
    case 'sick':
      return `Ill, back in ${minutes((m.sickHoursLeft ?? 0) * 60)}`;
  }
}

/** "Fatigue 40% · Morale 72%", plus a resignation countdown when there is one. */
export function memberReadings(m: CrewMemberSnapshot): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const base = `Fatigue ${pct(m.fatigue)} · Morale ${pct(m.morale)}`;
  return m.resignsInHours === null ? base : `${base} · resigns in ${minutes(m.resignsInHours * 60)}`;
}

/** "1 engineer, 1 repair team · 2 scientists for 1 lab". Only those fit to work make a repair team. */
export function crewDuties(snap: SimSnapshot): string {
  const c = snap.crew;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const teams =
    c.engineers === 0 ? 'no repairs possible' : c.fitEngineers === 0 ? 'none fit to work' : n(c.fitEngineers, 'repair team', 'repair teams');
  const labs = c.labs === 0 ? ', no labs yet' : ` for ${n(c.labs, 'lab', 'labs')}`;
  // A station with no labs and nobody to run one: scientists don't come into it.
  if (c.scientists === 0 && c.labs === 0) return `${n(c.engineers, 'engineer', 'engineers')}, ${teams}`;
  return `${n(c.engineers, 'engineer', 'engineers')}, ${teams} · ${n(c.scientists, 'scientist', 'scientists')}${labs}`;
}

export class CrewPanel {
  readonly root = el('section', 'fin-sheet crew-sheet');
  private readonly summary = el('p', 'crew-summary');
  private readonly duties = el('p', 'fin-note');
  private readonly list = el('ul', 'crew-list');
  private readonly blocked = el('p', 'fin-note crew-blocked');
  private readonly hireButtons = new Map<CrewRole, HTMLButtonElement>();
  private readonly terms = el('p', 'fin-note');
  private rosterKey = '';
  private armed: { id: string; button: HTMLButtonElement; timer: ReturnType<typeof setTimeout> } | null = null;
  private readonly rows = new Map<string, { status: HTMLElement; readings: HTMLElement }>();
  private openNow = false;

  constructor(
    parent: HTMLElement,
    private readonly handlers: CrewPanelHandlers,
    /** Roles this station hires: no scientists where there are no labs to be had. */
    roles: readonly CrewRole[] = ['engineer', 'scientist'],
  ) {
    const close = el('button', 'sheet-close', ['×']);
    close.type = 'button';
    close.setAttribute('aria-label', 'Close crew');
    close.addEventListener('click', () => handlers.onClose());

    const hireCards = roles.map((role) => {
      const b = el('button', 'warn-act primary crew-hire', [`Hire ${ROLE[role].label.toLowerCase()}`]);
      b.type = 'button';
      b.addEventListener('click', () => handlers.onHire(role));
      this.hireButtons.set(role, b);
      return el('div', 'crew-hire-card', [el('div', 'crew-hire-text', [el('b', '', [ROLE[role].label]), el('span', '', [ROLE[role].does])]), b]);
    });

    this.root.append(
      el('div', 'build-head', [el('h2', 'build-title', ['Crew']), close]),
      el('div', 'fin-scroll', [
        el('div', 'fin-section', [this.summary, this.duties]),
        el('div', 'fin-section', [el('h3', 'fin-h', ['Aboard and on the way']), this.list]),
        el('div', 'fin-section', [el('h3', 'fin-h', ['Hire']), this.terms, ...hireCards, this.blocked]),
      ]),
    );
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.openNow;
  }

  open(): void {
    this.openNow = true;
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
  }

  close(): void {
    this.disarm();
    this.openNow = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
  }

  update(snap: SimSnapshot): void {
    if (!this.openNow) return;
    const c = snap.crew;
    setText(this.summary, `${c.aboard} aboard · ${c.bunksTaken} of ${c.bunks} bunks taken · wages ${money(c.wagesPerDay)} a day`);
    setText(this.duties, crewDuties(snap));
    setText(this.terms, `${money(c.signingFee)} to sign, then ${money(c.wagePerDay)} a day each. The flight up takes ${minutes(c.arrivalHours * 60)}.`);
    const blocked = hireBlocked(snap);
    for (const b of this.hireButtons.values()) if (b.disabled !== (blocked !== null)) b.disabled = blocked !== null;
    setText(this.blocked, blocked ?? '');
    setClass(this.blocked, 'hidden', blocked === null);

    const key = c.members.map((m) => `${m.id}:${m.arrivesInHours === null ? 'a' : 'f'}`).join(',');
    if (key !== this.rosterKey) {
      this.rosterKey = key;
      this.disarm();
      this.rows.clear();
      this.list.replaceChildren(...c.members.map((m) => this.memberRow(m, c.engineers)));
    }
    for (const m of c.members) {
      const row = this.rows.get(m.id);
      if (!row) continue;
      setText(row.status, memberStatusText(m));
      setClass(row.status, 'bad', m.status === 'sick' || m.status === 'exhausted');
      setText(row.readings, m.status === 'inFlight' ? '' : memberReadings(m));
      setClass(row.readings, 'bad', m.moraleLow || m.resignsInHours !== null);
    }
  }

  private memberRow(m: CrewMemberSnapshot, engineers: number): HTMLElement {
    const status = el('span', 'crew-where', [memberStatusText(m)]);
    const readings = el('span', 'crew-readings', [m.status === 'inFlight' ? '' : memberReadings(m)]);
    this.rows.set(m.id, { status, readings });
    const label = m.arrivesInHours === null ? 'Send home' : 'Cancel flight';
    const b = el('button', 'warn-act crew-dismiss', [label]);
    b.type = 'button';
    // The last engineer gets a sharper warning on the second tap.
    const last = m.role === 'engineer' && m.arrivesInHours === null && engineers === 1;
    b.addEventListener('click', () => {
      if (this.armed?.id === m.id) {
        this.disarm();
        this.handlers.onDismiss(m.id);
        return;
      }
      this.disarm();
      b.textContent = last ? 'Tap again: no one left to repair' : 'Tap again to confirm';
      setClass(b, 'armed', true);
      this.armed = { id: m.id, button: b, timer: setTimeout(() => this.disarm(), CONFIRM_MS) };
      b.dataset.label = label;
    });
    return el('li', 'crew-member', [
      el('div', 'crew-who', [el('b', '', [m.name]), el('span', '', [`${ROLE[m.role].label} · `, status]), readings]),
      b,
    ]);
  }

  private disarm(): void {
    if (!this.armed) return;
    clearTimeout(this.armed.timer);
    const b = this.armed.button;
    b.textContent = b.dataset.label ?? 'Send home';
    setClass(b, 'armed', false);
    this.armed = null;
  }
}
