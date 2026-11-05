// Money: cash, the loan, running income and costs, research contracts, and quarterly books.
// Guests pay while their habitat runs. Crew and ground operations cost money every minute, and so does the loan.
// Research labs earn through contracts: a set number of lab hours before a deadline, paid on completion and
// penalised on failure. Business quarters are compressed (see EconomyConfig.quarterDays) because orbit time can't be.
import type { EventBus, SimEvents } from '../events';
import type { Rng } from '../rng';
import { labRates } from './crew';
import type { Station } from '../station';
import type { ContractDef, ContractSnapshot, EconomyConfig, Ledger, LedgerCategory, ModuleStatus, QuarterReport } from '../types';
import type { PowerState } from './power';

export interface ContractOffer {
  uid: string;
  defId: string;
  /** Elapsed minutes when the offer lapses. */
  expiresAt: number;
}

export interface ActiveContract {
  uid: string;
  defId: string;
  progressHours: number;
  /** Elapsed minutes of the deadline. */
  dueAt: number;
}

export interface EconomyState {
  cash: number;
  loan: number;
  /** This quarter's books. */
  ledger: Ledger;
  /** Every quarter's books added up; forecasts diff this, since a quarter can roll over mid-forecast. */
  lifetime: Ledger;
  quarter: number;
  lastReport: QuarterReport | null;
  offers: ContractOffer[];
  active: ActiveContract[];
  nextOfferAt: number;
  nextUid: number;
  /** Parts paid for crew jobs in progress, by module id, refunded if the job is cancelled. */
  partsOnJob: Record<string, number>;
  /** This quarter's counters for the report. */
  stats: { contractsDone: number; contractsFailed: number; guestMinutes: number; guestMinutesPossible: number; failures: number };
}

const emptyLedger = (): Ledger => ({ guests: 0, contracts: 0, wages: 0, operations: 0, interest: 0, construction: 0, repairs: 0, penalties: 0 });
const emptyStats = (): EconomyState['stats'] => ({ contractsDone: 0, contractsFailed: 0, guestMinutes: 0, guestMinutesPossible: 0, failures: 0 });

export function createEconomyState(cfg: EconomyConfig, rng: Rng): EconomyState {
  const state: EconomyState = {
    cash: cfg.startCash,
    loan: cfg.loan.principal,
    ledger: emptyLedger(),
    lifetime: emptyLedger(),
    quarter: 1,
    lastReport: null,
    offers: [],
    active: [],
    nextOfferAt: cfg.contracts.offerEveryHours * 60,
    nextUid: 1,
    partsOnJob: {},
    stats: emptyStats(),
  };
  for (let i = 0; i < cfg.contracts.startingOffers; i++) addOffer(state, cfg, rng, 0);
  return state;
}

export function contractDef(cfg: EconomyConfig, defId: string): ContractDef {
  const def = cfg.contracts.pool.find((c) => c.id === defId);
  if (!def) throw new Error(`No contract "${defId}"`);
  return def;
}

/** Add an offer from the pool, preferring contracts not already offered or running. */
function addOffer(state: EconomyState, cfg: EconomyConfig, rng: Rng, now: number): void {
  const pool = cfg.contracts.pool;
  if (pool.length === 0 || state.offers.length >= cfg.contracts.maxOffers) return;
  const taken = new Set([...state.offers.map((o) => o.defId), ...state.active.map((a) => a.defId)]);
  const fresh = pool.filter((c) => !taken.has(c.id));
  const from = fresh.length > 0 ? fresh : pool;
  const def = from[rng.int(0, from.length - 1)]!;
  state.offers.push({ uid: `c${state.nextUid++}`, defId: def.id, expiresAt: now + cfg.contracts.offerLifeHours * 60 });
}

/** Book money in or out (negative) under a category. */
export function book(state: EconomyState, category: LedgerCategory, amount: number): void {
  state.cash += amount;
  state.ledger[category] += amount;
  state.lifetime[category] += amount;
}

const running = (s: ModuleStatus | undefined) => s === 'powered' || s === 'throttled';

/** How many labs there are, and how much lab time each active contract gets this minute (0..1 per hour). */
/** Who is aboard to do the work, and what they cost. */
export interface Staffing {
  /** Work paces of the scientists fit to run a lab, fastest first. */
  scientistPaces: readonly number[];
  /** Share of its speed a lab works at with no scientist. */
  unstaffedFactor: number;
  wagesPerDay: number;
}

function labShare(station: Station, power: PowerState, def: ContractDef, activeCount: number, throttleFactor: number, staff: Staffing): number {
  const speeds: number[] = [];
  for (const m of station.modules) {
    if (m.def.kind !== 'lab') continue;
    const status = power.modules.get(m.id)?.status;
    if (status === 'powered') speeds.push(1);
    else if (status === 'throttled' && !def.stable) speeds.push(throttleFactor);
  }
  // Each contract runs on one lab, so no contract goes faster than the best lab, however many stand idle.
  const rates = labRates(speeds, staff.scientistPaces, staff.unstaffedFactor);
  const capacity = rates.reduce((sum, r) => sum + r, 0);
  return activeCount > 0 ? Math.min(rates[0] ?? 0, capacity / activeCount) : 0;
}

export function labCount(station: Station): number {
  return station.modules.filter((m) => m.def.kind === 'lab').length;
}

/** Why a contract can't be accepted, or null if it can. */
export function acceptProblem(state: EconomyState, station: Station, uid: string): string | null {
  if (!state.offers.some((o) => o.uid === uid)) return 'That offer is no longer open';
  const labs = labCount(station);
  if (labs === 0) return 'Contracts need a Research Lab on the station';
  if (state.active.length >= labs) return labs === 1 ? 'The lab is already running a contract' : 'Every lab is already running a contract';
  return null;
}

export function acceptContract(state: EconomyState, cfg: EconomyConfig, uid: string, now: number, events?: EventBus<SimEvents>): void {
  const i = state.offers.findIndex((o) => o.uid === uid);
  if (i < 0) throw new Error(`No offer "${uid}"`);
  const offer = state.offers.splice(i, 1)[0]!;
  const def = contractDef(cfg, offer.defId);
  state.active.push({ uid, defId: def.id, progressHours: 0, dueAt: now + def.deadlineHours * 60 });
  events?.emit('contractAccepted', { uid, title: def.title });
}

/** Walk away from a contract: the sponsor keeps the penalty. Returns false if no such contract is running. */
export function abandonContract(state: EconomyState, cfg: EconomyConfig, uid: string, events?: EventBus<SimEvents>): boolean {
  const i = state.active.findIndex((a) => a.uid === uid);
  if (i < 0) return false;
  const c = state.active.splice(i, 1)[0]!;
  const def = contractDef(cfg, c.defId);
  book(state, 'penalties', -def.penalty);
  state.stats.contractsFailed++;
  events?.emit('contractFailed', { uid, title: def.title, penalty: def.penalty, abandoned: true });
  return true;
}

/** Pay down the loan from cash. Returns the amount repaid. */
export function repayLoan(state: EconomyState, amount: number): number {
  const paid = Math.max(0, Math.min(amount, state.loan, state.cash));
  state.loan -= paid;
  state.cash -= paid;
  return paid;
}

export interface EconomyStepOptions {
  cfg: EconomyConfig;
  rng: Rng;
  /** Elapsed minutes after this tick. */
  now: number;
  dtHours: number;
  /** Commercial throttle factor from the thermal config: throttled labs work at this rate. */
  throttleFactor: number;
  staff: Staffing;
  /** What every guest's fare is multiplied by: comforts and reputation together. */
  fareFactor: number;
  events?: EventBus<SimEvents>;
}

/** One tick of money, after power has settled who is running. */
export function stepEconomy(state: EconomyState, station: Station, power: PowerState, opts: EconomyStepOptions): void {
  const { cfg, rng, now, dtHours, events } = opts;
  const dtDays = dtHours / 24;

  // Guests pay while their habitat runs.
  for (const m of station.modules) {
    const guests = m.def.cabin?.guests ?? 0;
    if (guests <= 0) continue;
    state.stats.guestMinutesPossible += 1;
    if (running(power.modules.get(m.id)?.status)) {
      book(state, 'guests', guests * cfg.guestPerDay * opts.fareFactor * dtDays);
      state.stats.guestMinutes += 1;
    }
  }
  book(state, 'operations', -cfg.operationsPerDay * dtDays);
  book(state, 'wages', -opts.staff.wagesPerDay * dtDays);
  book(state, 'interest', -state.loan * cfg.loan.ratePerQuarter * (dtDays / cfg.quarterDays));

  // Contracts: lab time, completion, deadlines. Lab time is shared by the contracts under way at the start
  // of the minute, so one finishing doesn't hand the others extra time.
  const under = state.active.length;
  for (const c of [...state.active]) {
    const def = contractDef(cfg, c.defId);
    c.progressHours = Math.min(def.labHours, c.progressHours + labShare(station, power, def, under, opts.throttleFactor, opts.staff) * dtHours);
    if (c.progressHours >= def.labHours - 1e-9) {
      state.active = state.active.filter((a) => a !== c);
      book(state, 'contracts', def.reward);
      state.stats.contractsDone++;
      events?.emit('contractCompleted', { uid: c.uid, title: def.title, reward: def.reward });
    } else if (now >= c.dueAt) {
      state.active = state.active.filter((a) => a !== c);
      book(state, 'penalties', -def.penalty);
      state.stats.contractsFailed++;
      events?.emit('contractFailed', { uid: c.uid, title: def.title, penalty: def.penalty, abandoned: false });
    }
  }

  // The offer board.
  state.offers = state.offers.filter((o) => o.expiresAt > now);
  if (now >= state.nextOfferAt) {
    addOffer(state, cfg, rng, now);
    state.nextOfferAt = now + cfg.contracts.offerEveryHours * 60;
  }

  // Quarter end.
  if (now > 0 && now % Math.round(cfg.quarterDays * 1440) === 0) {
    const s = state.stats;
    const report: QuarterReport = {
      quarter: state.quarter,
      ledger: { ...state.ledger },
      net: Object.values(state.ledger).reduce((a, b) => a + b, 0),
      cash: state.cash,
      loan: state.loan,
      contractsDone: s.contractsDone,
      contractsFailed: s.contractsFailed,
      guestUptime: s.guestMinutesPossible > 0 ? s.guestMinutes / s.guestMinutesPossible : 0,
      failures: s.failures,
    };
    state.lastReport = report;
    state.quarter++;
    state.ledger = emptyLedger();
    state.stats = emptyStats();
    events?.emit('quarterReport', { report });
  }
}

/**
 * What running comforts add to guests' fares: each kind's `guestFare`, biggest first, each further kind counting for
 * `stack` of the one before. More of the same kind adds nothing: one view is much like another.
 */
export function fareLift(running: readonly { name: string; guestFare: number }[], stack: number): number {
  const best = new Map<string, number>();
  for (const r of running) if (r.guestFare > 0) best.set(r.name, Math.max(best.get(r.name) ?? 0, r.guestFare));
  return [...best.values()].sort((a, b) => b - a).reduce((sum, f, i) => sum + f * stack ** i, 0);
}

/** Running income minus running costs right now, per day. */
export function netPerDay(station: Station, power: PowerState, state: EconomyState, cfg: EconomyConfig, staff: Staffing, fareFactor: number): number {
  let guests = 0;
  for (const m of station.modules) if (running(power.modules.get(m.id)?.status)) guests += m.def.cabin?.guests ?? 0;
  return guests * cfg.guestPerDay * fareFactor - staff.wagesPerDay - cfg.operationsPerDay - (state.loan * cfg.loan.ratePerQuarter) / cfg.quarterDays;
}

export function contractSnapshots(
  state: EconomyState,
  station: Station,
  power: PowerState,
  cfg: EconomyConfig,
  now: number,
  throttleFactor: number,
  staff: Staffing,
) {
  const base = (def: ContractDef) => ({
    defId: def.id,
    title: def.title,
    sponsor: def.sponsor,
    description: def.description,
    labHours: def.labHours,
    deadlineHours: def.deadlineHours,
    reward: def.reward,
    penalty: def.penalty,
    stable: def.stable ?? false,
  });
  const offers: ContractSnapshot[] = state.offers.map((o) => {
    const def = contractDef(cfg, o.defId);
    return { ...base(def), uid: o.uid, progressHours: 0, hoursLeft: (o.expiresAt - now) / 60, atRisk: false };
  });
  const active: ContractSnapshot[] = state.active.map((c) => {
    const def = contractDef(cfg, c.defId);
    const hoursLeft = (c.dueAt - now) / 60;
    const workLeft = def.labHours - c.progressHours;
    // Little slack left, or the lab isn't working on it right now and the slack is thin.
    const share = labShare(station, power, def, state.active.length, throttleFactor, staff);
    const atRisk = workLeft > hoursLeft * 0.9 || (share < 0.5 && workLeft > hoursLeft * 0.6);
    return { ...base(def), uid: c.uid, progressHours: c.progressHours, hoursLeft, atRisk };
  });
  return { offers, active };
}
