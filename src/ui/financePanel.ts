// Money and research contracts: a cash button at the bottom centre and a sheet with the books, the loan,
// lab contracts on offer and under way, modules on their way, and last quarter's report.
// Like the warnings sheet, the DOM is rebuilt only when the structure changes (a contract comes or goes);
// numbers are updated in place every frame so buttons never get replaced under a finger at 20×.
import type { ContractSnapshot, GoalDef, DeliverySnapshot, EconomySnapshot, Ledger, LedgerCategory, QuarterReport, SimSnapshot } from '../sim/types';
import { el, setClass, setText } from './dom';
import { minutes, money } from './format';
import { deadlineText, goalLine, goalProgress } from './goalText';

export interface FinancePanelHandlers {
  onOpen(): void;
  onClose(): void;
  onAccept(uid: string): void;
  onAbandon(uid: string): void;
  /** Amount in $ millions; the sim caps it at the loan and the cash on hand. */
  onRepay(amount: number): void;
  /** Scrap this station and start again. Only called after the player confirms. */
  onNewGame(): void;
}

/** How long the "tap again" confirmation on New station stays armed, ms. */
const CONFIRM_MS = 4000;

const LEDGER_ORDER: readonly { key: LedgerCategory; label: string }[] = [
  { key: 'guests', label: 'Guests' },
  { key: 'contracts', label: 'Research contracts' },
  { key: 'wages', label: 'Crew wages' },
  { key: 'operations', label: 'Operations' },
  { key: 'interest', label: 'Loan interest' },
  { key: 'construction', label: 'Construction' },
  { key: 'repairs', label: 'Spare parts' },
  { key: 'penalties', label: 'Penalties' },
];

/** Below half a thousand dollars a row would show as "$0k", so it counts as zero. */
const ZERO = 0.0005;

/** Ledger rows for display: income first then costs, skipping zero rows, plus a net total. */
export function ledgerRows(ledger: Ledger): { label: string; amount: number }[] {
  const rows = LEDGER_ORDER.filter((r) => Math.abs(ledger[r.key]) >= ZERO).map((r) => ({ label: r.label, amount: ledger[r.key] }));
  const net = LEDGER_ORDER.reduce((sum, r) => sum + ledger[r.key], 0);
  return [...rows, { label: 'Net', amount: net }];
}

/** Hours with at most one decimal: "12", "6.2". */
export function hoursText(h: number): string {
  const r = Math.round(h * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "6.2 of 12 lab hours · 9 h 40 min left" for a contract under way. */
export function progressLine(c: ContractSnapshot): string {
  return `${hoursText(c.progressHours)} of ${hoursText(c.labHours)} lab hours · ${minutes(Math.max(0, c.hoursLeft) * 60)} left`;
}

/** "12 lab hours within 24 h · pays $7.0M · penalty $2.0M" for an offer (the deadline counts from signing). */
export function offerTerms(c: ContractSnapshot): string {
  return `${hoursText(c.labHours)} lab hours within ${minutes(c.deadlineHours * 60)} · pays ${money(c.reward)} · penalty ${money(c.penalty)}`;
}

/** Why offers can't be accepted right now, or null if they can. */
export function acceptBlocked(e: Pick<EconomySnapshot, 'labs' | 'active'>): string | null {
  if (e.labs === 0) return 'Needs a Research Lab';
  if (e.active.length >= e.labs) return e.labs === 1 ? 'The lab is busy' : 'Every lab is busy';
  return null;
}

const portName = (port: string) => (port === 'port' ? 'port-side' : port);
const deliveryLine = (d: DeliverySnapshot) => `${d.name} → ${d.to} ${portName(d.port)} port · docks in ${minutes(Math.max(0, d.hoursLeft) * 60)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const rateText = (r: number) => `${Number((r * 100).toFixed(2))}%`;

/** What guests pay, against the base fare: comforts like a cupola put it up. */
export function fareText(e: EconomySnapshot): string {
  return e.fareLift > 0.0005 ? `+${Math.round(e.fareLift * 100)}% from comforts` : 'Base rate';
}
const signed = (m: number) => (Math.abs(m) < 0.0005 ? money(m) : m > 0 ? `+${money(m)}` : money(m));

interface ActiveRefs {
  bar: HTMLElement;
  line: HTMLElement;
  risk: HTMLElement;
  card: HTMLElement;
}

interface OfferRefs {
  ends: HTMLElement;
  accept: HTMLButtonElement;
  reason: HTMLElement;
}

export class FinancePanel {
  readonly button = el('button', 'fin-fab');
  readonly root = el('section', 'fin-sheet');
  private readonly fabCash = el('span', 'fin-fab-cash');
  private readonly fabDot = el('span', 'fin-dot hidden');

  private readonly cash = el('span', 'fin-cash');
  private readonly loan = el('span', 'fin-v');
  private readonly running = el('span', 'fin-v');
  private readonly fares = el('span', 'fin-v');
  private readonly faresRow = el('div', 'fin-fact', [el('dt', '', ['Guest fares']), el('dd', '', [this.fares])]);
  private readonly repayButtons: HTMLButtonElement[] = [];
  private readonly quarter = el('span', 'fin-sub');
  private readonly ledger = el('dl', 'fin-ledger');
  private readonly contracts = el('div', 'fin-contracts');
  private readonly deliveriesSection = el('div', 'fin-section hidden');
  private readonly deliveries = el('ul', 'fin-deliveries');
  private readonly reportSection = el('div', 'fin-section hidden');
  private readonly report = el('div');

  private ledgerAmounts: HTMLElement[] = [];
  private activeRefs = new Map<string, ActiveRefs>();
  private offerRefs = new Map<string, OfferRefs>();
  private deliveryRefs = new Map<string, HTMLElement>();
  private ledgerKey = '';
  private contractsKey = '';
  private deliveriesKey = '';
  private reportKey = '';
  private last: SimSnapshot | null = null;
  private isOpenNow = false;
  private readonly goalLineText = el('p', 'fin-goal-line');
  private readonly goalDeadline = el('span', 'fin-sub');
  private readonly goalFill = el('i');
  private readonly goalState = el('span', 'fin-goal-state');
  private readonly newGame = el('button', 'warn-act fin-new', ['Start a new station']);
  private newGameTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    parent: HTMLElement,
    private readonly handlers: FinancePanelHandlers,
    goal: GoalDef,
    /** False for a station whose scenario offers no research contracts: the section is left out. */
    hasContracts = true,
  ) {
    this.goalLineText.textContent = goalLine(goal);
    this.button.type = 'button';
    this.button.append(this.fabCash, this.fabDot);
    this.button.addEventListener('click', () => (this.isOpenNow ? handlers.onClose() : handlers.onOpen()));

    const close = el('button', 'sheet-close', ['×']);
    close.type = 'button';
    close.setAttribute('aria-label', 'Close finance');
    close.addEventListener('click', () => handlers.onClose());

    const repay = (label: string, amount: () => number) => {
      const b = el('button', 'warn-act', [label]);
      b.type = 'button';
      b.addEventListener('click', () => {
        const a = amount();
        if (a > 0) handlers.onRepay(a);
      });
      this.repayButtons.push(b);
      return b;
    };
    const loanNow = () => this.last?.economy.loan ?? 0;

    const summary = el('div', 'fin-section fin-summary', [
      el('div', 'fin-cash-block', [el('span', 'fin-k', ['Cash']), this.cash]),
      el('dl', 'fin-facts', [
        el('div', 'fin-fact', [el('dt', '', ['Loan']), el('dd', '', [this.loan])]),
        el('div', 'fin-fact', [el('dt', '', ['Running']), el('dd', '', [this.running])]),
        this.faresRow,
      ]),
      el('div', 'fin-repay', [repay('Repay $5M', () => 5), repay('Repay $20M', () => 20), repay('Repay all', loanNow)]),
    ]);

    const goalSection = el('div', 'fin-section fin-goal', [
      el('div', 'fin-h-row', [el('h3', 'fin-h', ['Goal']), this.goalDeadline]),
      this.goalLineText,
      el('div', 'fin-goal-bar', [this.goalFill]),
      this.goalState,
    ]);
    const quarterSection = el('div', 'fin-section', [el('div', 'fin-h-row', [el('h3', 'fin-h', ['This quarter']), this.quarter]), this.ledger]);
    const contractsSection = el('div', hasContracts ? 'fin-section' : 'fin-section hidden', [el('h3', 'fin-h', ['Research contracts']), this.contracts]);
    this.deliveriesSection.append(el('h3', 'fin-h', ['Deliveries']), this.deliveries);
    this.reportSection.append(this.report);

    // Starting over takes two taps, so a stray thumb can't scrap a station.
    this.newGame.type = 'button';
    this.newGame.addEventListener('click', () => {
      if (this.newGameTimer === null) {
        this.armNewGame(true);
        this.newGameTimer = setTimeout(() => this.armNewGame(false), CONFIRM_MS);
      } else {
        this.armNewGame(false);
        handlers.onNewGame();
      }
    });
    const stationSection = el('div', 'fin-section fin-station', [
      el('h3', 'fin-h', ['Station']),
      el('p', 'fin-note', ['Saved automatically on this device.']),
      this.newGame,
    ]);

    this.root.append(
      el('div', 'build-head', [el('h2', 'build-title', ['Finance']), close]),
      el('div', 'fin-scroll', [goalSection, summary, quarterSection, contractsSection, this.deliveriesSection, this.reportSection, stationSection]),
    );
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
    if (this.last) {
      this.render(this.last.economy);
      this.renderGoal(this.last);
    }
  }

  close(): void {
    this.armNewGame(false);
    this.isOpenNow = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    setClass(this.button, 'active', false);
  }

  private armNewGame(armed: boolean): void {
    if (!armed && this.newGameTimer !== null) {
      clearTimeout(this.newGameTimer);
      this.newGameTimer = null;
    }
    setClass(this.newGame, 'armed', armed);
    this.newGame.textContent = armed ? 'Tap again to scrap this station' : 'Start a new station';
  }

  update(snap: SimSnapshot): void {
    this.last = snap;
    const e = snap.economy;
    const risk = e.active.some((c) => c.atRisk);
    const opportunity = e.labs > 0 && e.active.length === 0 && e.offers.length > 0;
    setText(this.fabCash, money(e.cash));
    setClass(this.button, 'negative', e.cash < 0);
    setClass(this.button, 'risk', risk);
    setClass(this.fabDot, 'hidden', !risk && !opportunity);
    setClass(this.fabDot, 'risk', risk);
    const note = risk ? ', a contract is at risk' : opportunity ? ', contracts on offer' : '';
    this.button.setAttribute('aria-label', `Finance: cash ${money(e.cash)}${note}`);
    if (this.isOpenNow) {
      this.render(e);
      this.renderGoal(snap);
    }
  }

  private renderGoal(snap: SimSnapshot): void {
    const g = snap.ending.goal;
    const reached = snap.ending.goalAtMinutes !== null;
    setText(this.goalState, reached ? 'Done' : goalProgress(g));
    this.goalFill.style.width = `${Math.round((reached ? 1 : g.progress) * 100)}%`;
    const left = reached ? null : deadlineText(g, snap.minutes);
    setText(this.goalDeadline, left ?? '');
    setClass(this.goalDeadline, 'neg', left !== null && g.deadlineAtMinutes !== null && g.deadlineAtMinutes - snap.minutes < 1440);
  }

  private render(e: EconomySnapshot): void {
    // Summary
    setText(this.cash, money(e.cash));
    setClass(this.cash, 'neg', e.cash < 0);
    setText(this.loan, e.loan > 0 ? `${money(e.loan)} at ${rateText(e.ratePerQuarter)} a quarter` : 'Paid off');
    setText(this.running, Math.abs(e.netPerDay) < 0.05 ? 'About break-even' : `${signed(e.netPerDay)} a day`);
    setClass(this.running, 'pos', e.netPerDay >= 0);
    setClass(this.running, 'neg', e.netPerDay < 0);
    setText(this.fares, fareText(e));
    setClass(this.fares, 'pos', e.fareLift > 0.0005);
    this.faresRow.hidden = Object.keys(e.guestIncomePerDay).length === 0;
    const canRepay = e.cash > 0 && e.loan > 0;
    for (const b of this.repayButtons) if (b.disabled === canRepay) b.disabled = !canRepay;

    // This quarter
    setText(this.quarter, `Quarter ${e.quarter} · ${Math.floor(e.quarterProgress * 100)}% through`);
    const rows = ledgerRows(e.ledger);
    const ledgerKey = rows.map((r) => r.label).join('|');
    if (ledgerKey !== this.ledgerKey) {
      this.ledgerKey = ledgerKey;
      this.ledgerAmounts = [];
      this.ledger.replaceChildren(
        ...rows.map((r, i) => {
          const amount = el('dd');
          this.ledgerAmounts.push(amount);
          return el('div', i === rows.length - 1 ? 'fin-row net' : 'fin-row', [el('dt', '', [r.label]), amount]);
        }),
      );
    }
    rows.forEach((r, i) => {
      const node = this.ledgerAmounts[i];
      if (!node) return;
      setText(node, money(r.amount));
      setClass(node, 'in', r.amount >= 0);
      setClass(node, 'out', r.amount < 0);
    });

    // Research contracts
    const contractsKey = JSON.stringify([e.labs === 0, e.active.map((c) => c.uid), e.offers.map((c) => c.uid)]);
    if (contractsKey !== this.contractsKey) {
      this.contractsKey = contractsKey;
      this.rebuildContracts(e);
    }
    for (const c of e.active) {
      const refs = this.activeRefs.get(c.uid);
      if (!refs) continue;
      const frac = c.labHours > 0 ? Math.min(1, Math.max(0, c.progressHours / c.labHours)) : 0;
      const width = `${(frac * 100).toFixed(1)}%`;
      if (refs.bar.style.width !== width) refs.bar.style.width = width;
      setText(refs.line, progressLine(c));
      setClass(refs.risk, 'hidden', !c.atRisk);
      setClass(refs.card, 'at-risk', c.atRisk);
    }
    const blocked = acceptBlocked(e);
    for (const c of e.offers) {
      const refs = this.offerRefs.get(c.uid);
      if (!refs) continue;
      setText(refs.ends, `Offer ends in ${minutes(Math.max(0, c.hoursLeft) * 60)}`);
      if (refs.accept.disabled !== !!blocked) refs.accept.disabled = !!blocked;
      setText(refs.reason, blocked ?? '');
      setClass(refs.reason, 'hidden', !blocked);
    }

    // Deliveries
    const deliveriesKey = e.deliveries.map((d) => d.moduleId).join('|');
    if (deliveriesKey !== this.deliveriesKey) {
      this.deliveriesKey = deliveriesKey;
      this.deliveryRefs = new Map();
      this.deliveries.replaceChildren(
        ...e.deliveries.map((d) => {
          const li = el('li', 'fin-delivery');
          this.deliveryRefs.set(d.moduleId, li);
          return li;
        }),
      );
      setClass(this.deliveriesSection, 'hidden', e.deliveries.length === 0);
    }
    for (const d of e.deliveries) {
      const node = this.deliveryRefs.get(d.moduleId);
      if (node) setText(node, deliveryLine(d));
    }

    // Last quarter: fixed once written, so rebuilt only when a new report arrives.
    const reportKey = e.lastReport ? String(e.lastReport.quarter) : '';
    if (reportKey !== this.reportKey) {
      this.reportKey = reportKey;
      this.report.replaceChildren(...(e.lastReport ? this.reportNodes(e.lastReport) : []));
      setClass(this.reportSection, 'hidden', !e.lastReport);
    }
  }

  private rebuildContracts(e: EconomySnapshot): void {
    this.activeRefs = new Map();
    this.offerRefs = new Map();
    const button = (label: string, cls: string, onClick: () => void) => {
      const b = el('button', cls, [label]);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    };
    const head = (c: ContractSnapshot) =>
      el('div', 'fin-card-head', [
        el('div', 'fin-card-names', [el('span', 'fin-card-title', [c.title]), el('span', 'fin-card-sponsor', [c.sponsor])]),
        el('span', 'fin-card-reward', [money(c.reward)]),
      ]);

    const nodes: HTMLElement[] = [];
    if (e.labs === 0) nodes.push(el('p', 'fin-note', ['Build a Research Lab to take on contracts.']));

    for (const c of e.active) {
      const bar = el('i');
      const line = el('span', 'fin-meta');
      const risk = el('span', 'fin-tag risk hidden', ['At risk']);
      const tags = el('div', 'fin-tags', [...(c.stable ? [el('span', 'fin-tag', ['Needs a steady loop'])] : []), risk]);
      const card = el('article', 'fin-card active', [
        head(c),
        el('div', 'fin-bar', [bar]),
        line,
        el('div', 'fin-card-foot', [tags, button(`Abandon (${money(-c.penalty)})`, 'warn-act', () => this.handlers.onAbandon(c.uid))]),
      ]);
      this.activeRefs.set(c.uid, { bar, line, risk, card });
      nodes.push(card);
    }

    if (e.offers.length > 0) {
      nodes.push(el('p', 'fin-leads', [e.offers.length === 1 ? 'On offer' : `${e.offers.length} on offer`]));
      for (const c of e.offers) {
        const ends = el('span', 'fin-meta');
        const reason = el('span', 'fin-reason hidden');
        const accept = button('Accept', 'warn-act primary', () => this.handlers.onAccept(c.uid));
        nodes.push(
          el('article', 'fin-card offer', [
            head(c),
            el('p', 'fin-desc', [c.description]),
            el('span', 'fin-meta', [offerTerms(c)]),
            ...(c.stable ? [el('div', 'fin-tags', [el('span', 'fin-tag', ['Needs a steady loop'])])] : []),
            el('div', 'fin-card-foot', [ends, el('div', 'fin-accept', [reason, accept])]),
          ]),
        );
        this.offerRefs.set(c.uid, { ends, accept, reason });
      }
    } else if (e.labs > 0 && e.active.length === 0) {
      nodes.push(el('p', 'fin-note', ['No offers right now. Sponsors send new ones every few hours.']));
    }

    this.contracts.replaceChildren(...nodes);
  }

  private reportNodes(r: QuarterReport): HTMLElement[] {
    const row = (label: string, value: string, cls = '') => el('div', `fin-row ${cls}`.trim(), [el('dt', '', [label]), el('dd', '', [value])]);
    const contracts = r.contractsFailed > 0 ? `${r.contractsDone} done · ${r.contractsFailed} failed` : `${r.contractsDone} done`;
    return [
      el('h3', 'fin-h', [`Last quarter · Q${r.quarter}`]),
      el('dl', 'fin-ledger', [
        row('Net', money(r.net), r.net >= 0 ? 'good' : 'bad'),
        row('Contracts', contracts, r.contractsFailed > 0 ? 'bad' : ''),
        row('Guest uptime', pct(r.guestUptime)),
        row('Failures', String(r.failures), r.failures > 0 ? 'bad' : ''),
      ]),
    ];
  }
}
