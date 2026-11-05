// Wear, failures, and the crew's repair queue.
// Modules wear while they run, faster when hot. The chance of failing rises steeply with wear, so a worn module
// is a gamble. The crew can service a working module (offline for a while, wear back to new) or repair a failed
// one, which takes longer. Failures are rolled on the sim's seeded rng, so a run replays exactly.
import { bandHigh } from '../band';
import type { EventBus, SimEvents } from '../events';
import type { Rng } from '../rng';
import type { Station } from '../station';
import type { ModuleDef, ModuleStatus, ReliabilityConfig, ReliabilityData, RepairSnapshot } from '../types';
import type { PowerState } from './power';
import type { ThermalState } from './thermal';

export type Outage = 'failed' | 'servicing';

export interface ReliabilityModuleState {
  wear: number;
  failed: boolean;
  /** "Due for service" warning, with hysteresis. */
  worn: boolean;
  /** Failure rate at the current wear and temperature, per day, while running. */
  hazardPerDay: number;
}

export interface RepairJob {
  moduleId: string;
  kind: 'service' | 'repair';
  hoursLeft: number;
  /** Set once a crew team has picked it up. */
  started: boolean;
}

export interface ReliabilityState {
  modules: Map<string, ReliabilityModuleState>;
  /** The first `repairTeams` jobs are being worked on; the rest wait in order. */
  queue: RepairJob[];
  /** Running total of failure hazard × time over all running modules. Forecasts turn its growth into a chance. */
  exposure: number;
}

export function createReliabilityState(station: Station, cfg: ReliabilityData): ReliabilityState {
  const modules = new Map<string, ReliabilityModuleState>();
  for (const m of station.modules) {
    const wear = m.def.reliability ? (cfg.initialWear[m.id] ?? 0) : 0;
    modules.set(m.id, { wear, failed: false, worn: wear > cfg.worn.above, hazardPerDay: 0 });
  }
  return { modules, queue: [], exposure: 0 };
}

/** New modules arrive new. */
export function addReliabilityModule(state: ReliabilityState, id: string): void {
  state.modules.set(id, { wear: 0, failed: false, worn: false, hazardPerDay: 0 });
}

function moduleState(state: ReliabilityState, id: string): ReliabilityModuleState {
  const s = state.modules.get(id);
  if (!s) throw new Error(`No reliability state for module "${id}"`);
  return s;
}

/** How much faster a module wears and fails at `tempC` than at its rated temperature. */
export function heatFactor(tempC: number, cfg: ReliabilityData): number {
  return 2 ** (Math.max(0, tempC - cfg.ratedC) / cfg.doublingC);
}

/** Failure rate per day for a module of `def` at `wear` and `tempC`. Zero for modules that never fail. */
export function hazardPerDay(def: ModuleDef, wear: number, tempC: number, cfg: ReliabilityData): number {
  const r = def.reliability;
  if (!r) return 0;
  return r.failPerDay * (cfg.newFailShare + (1 - cfg.newFailShare) * wear * wear) * heatFactor(tempC, cfg);
}

/** Why a module is out of action because of wear or repairs, if it is. Fed to the power system. */
export function outage(state: ReliabilityState, id: string, cfg: ReliabilityConfig): Outage | null {
  const job = activeJob(state, id, cfg);
  if (job) return 'servicing';
  return moduleState(state, id).failed ? 'failed' : null;
}

function activeJob(state: ReliabilityState, id: string, cfg: ReliabilityConfig): RepairJob | undefined {
  const i = state.queue.findIndex((j) => j.moduleId === id);
  return i >= 0 && i < cfg.repairTeams ? state.queue[i] : undefined;
}

/**
 * Where a module stands in the crew's queue. `pace` is each repair team's work pace, fastest first: a job under way
 * shows the clock time left at its team's pace; a queued one shows its work-hours.
 */
export function repairSnapshot(state: ReliabilityState, id: string, cfg: ReliabilityConfig, pace: readonly number[] = []): RepairSnapshot | null {
  const i = state.queue.findIndex((j) => j.moduleId === id);
  if (i < 0) return null;
  const job = state.queue[i]!;
  const active = i < cfg.repairTeams;
  const hoursLeft = active ? job.hoursLeft / (pace[i] ?? 1) : job.hoursLeft;
  return { kind: job.kind, active, hoursLeft, queuePosition: active ? 0 : i - cfg.repairTeams + 1 };
}

function jobHours(def: ModuleDef, kind: RepairJob['kind'], cfg: ReliabilityConfig): number {
  const hours = def.reliability?.serviceHours ?? 0;
  return kind === 'repair' ? hours * cfg.repairFactor : hours;
}

/** Why the crew can't take on work on this module, or null if they can. */
export function repairProblem(state: ReliabilityState, station: Station, id: string): string | null {
  const m = station.byId.get(id);
  if (!m) return `No module "${id}"`;
  if (!m.def.reliability) return `The ${m.def.name} needs no servicing`;
  if (state.queue.some((j) => j.moduleId === id)) return `The ${m.def.name} is already on the crew's list`;
  return null;
}

/** Put a service (working module) or repair (failed module) on the crew's list. Check `repairProblem` first. */
export function queueRepair(state: ReliabilityState, station: Station, id: string, cfg: ReliabilityConfig, events?: EventBus<SimEvents>): void {
  const problem = repairProblem(state, station, id);
  if (problem) throw new Error(problem);
  const def = station.byId.get(id)!.def;
  const kind = moduleState(state, id).failed ? 'repair' : 'service';
  state.queue.push({ moduleId: id, kind, hoursLeft: jobHours(def, kind, cfg), started: false });
  startJobs(state, cfg, events);
}

/** Take a job off the list. Work done so far is lost; a failed module stays failed. */
export function cancelRepair(state: ReliabilityState, id: string, cfg: ReliabilityConfig, events?: EventBus<SimEvents>): boolean {
  const i = state.queue.findIndex((j) => j.moduleId === id);
  if (i < 0) return false;
  state.queue.splice(i, 1);
  startJobs(state, cfg, events);
  return true;
}

function startJobs(state: ReliabilityState, cfg: ReliabilityConfig, events?: EventBus<SimEvents>): void {
  for (const job of state.queue.slice(0, cfg.repairTeams)) {
    if (job.started) continue;
    job.started = true;
    events?.emit('repairStarted', { moduleId: job.moduleId, kind: job.kind, hours: job.hoursLeft });
  }
}

const running = (s: ModuleStatus | undefined) => s === 'powered' || s === 'throttled';

export interface ReliabilityStepOptions {
  cfg: ReliabilityConfig;
  dtHours: number;
  rng: Rng;
  /** When false, wear still builds and hazard is still counted, but nothing breaks (forecasts). */
  failures: boolean;
  /** Each repair team's work pace, fastest first; the first job in the queue gets the fastest. Missing means 1. */
  pace?: readonly number[];
  events?: EventBus<SimEvents>;
}

/**
 * One tick: crew work progresses, then running modules wear and may fail.
 * Uses last tick's power statuses and module temperatures, so it runs before the power solve.
 */
export function stepReliability(state: ReliabilityState, station: Station, power: PowerState, thermal: ThermalState, opts: ReliabilityStepOptions): void {
  const { cfg, dtHours, rng, events, pace = [] } = opts;
  const dtDays = dtHours / 24;

  // Crew work.
  state.queue.slice(0, cfg.repairTeams).forEach((job, i) => (job.hoursLeft -= dtHours * (pace[i] ?? 1)));
  const done = state.queue.filter((j, i) => i < cfg.repairTeams && j.hoursLeft <= 1e-9);
  if (done.length) {
    state.queue = state.queue.filter((j) => !done.includes(j));
    for (const job of done) {
      const s = moduleState(state, job.moduleId);
      s.wear = 0;
      s.failed = false;
      s.worn = false;
      events?.emit('repairDone', { moduleId: job.moduleId, kind: job.kind });
    }
    startJobs(state, cfg, events);
  }

  // Wear and failures.
  for (const m of station.modules) {
    const r = m.def.reliability;
    const s = moduleState(state, m.id);
    const tempC = thermal.modules.get(m.id)?.tempC ?? cfg.ratedC;
    s.hazardPerDay = hazardPerDay(m.def, s.wear, tempC, cfg);
    if (!r || s.failed || !running(power.modules.get(m.id)?.status)) continue;

    s.wear = Math.min(1, s.wear + (dtDays / r.wearDays) * heatFactor(tempC, cfg));
    const wasWorn = s.worn;
    s.worn = bandHigh(s.worn, s.wear, cfg.worn);
    if (s.worn && !wasWorn) events?.emit('moduleWorn', { moduleId: m.id, wear: s.wear });

    state.exposure += s.hazardPerDay * dtDays;
    if (opts.failures && rng.next() < 1 - Math.exp(-s.hazardPerDay * dtDays)) {
      s.failed = true;
      // A service waiting in the queue becomes a (longer) repair.
      const job = state.queue.find((j) => j.moduleId === m.id);
      if (job && !job.started) {
        job.kind = 'repair';
        job.hoursLeft = jobHours(m.def, 'repair', cfg);
      }
      events?.emit('moduleFailed', { moduleId: m.id, tier: m.def.power.tier });
    }
  }
}
