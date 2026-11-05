// The simulation: owns all sim state, advances one tick per in-game minute, and hands out snapshots.
// The view and UI read snapshots and send commands; they never touch sim state directly.
import { EventBus, type SimEvents } from './events';
import { createOrbit, isInShadowArc, orbitSnapshot, phaseAt, sunlightAt, type OrbitModel } from './orbit';
import { Rng } from './rng';
import { attachModule, attachProblem, buildStation, freePorts, indexDefs, mountPort, type Station } from './station';
import {
  abandonContract,
  acceptContract,
  acceptProblem,
  book,
  contractSnapshots,
  createEconomyState,
  labCount,
  netPerDay,
  repayLoan,
  stepEconomy,
  type EconomyState,
} from './systems/economy';
import {
  addPowerModule,
  createPowerState,
  setModuleEnabled,
  setOutage,
  stepPower,
  storageTotals,
  type PowerModuleState,
  type PowerState,
} from './systems/power';
import {
  co2MmHg,
  createLifeSupportState,
  lifeSupportPlant,
  stepLifeSupport,
  type LifeSupportPlant,
  type LifeSupportState,
} from './systems/lifeSupport';
import {
  addReliabilityModule,
  cancelRepair,
  createReliabilityState,
  hazardPerDay,
  outage,
  queueRepair,
  repairProblem,
  repairSnapshot,
  stepReliability,
  type ReliabilityModuleState,
  type ReliabilityState,
} from './systems/reliability';
import {
  addThermalModule,
  createThermalState,
  stepThermal,
  thermalLimits,
  type ThermalModuleState,
  type ThermalState,
} from './systems/thermal';
import { MINUTE_MS } from './time';
import type { EndingSnapshot, GoalSnapshot, LayoutEntry, Ledger, ModuleDef, ModuleSnapshot, Outcome, ScenarioDef, SimSnapshot } from './types';
import { diagnose } from './warnings';

export type SimCommand =
  | { type: 'setModuleEnabled'; moduleId: string; enabled: boolean }
  /** Build a module from `defId`, mounting it by its first port onto `to`'s `port`. */
  | { type: 'addModule'; defId: string; to: string; port: string }
  /** Put a module on the crew's list: a service if it works, a repair if it has failed. */
  | { type: 'repair'; moduleId: string }
  | { type: 'cancelRepair'; moduleId: string }
  | { type: 'acceptContract'; uid: string }
  | { type: 'abandonContract'; uid: string }
  /** Pay down the loan from cash. */
  | { type: 'repayLoan'; amount: number };

/** A module paid for and on its way up. Its port is reserved until it docks. */
interface Delivery {
  moduleId: string;
  defId: string;
  to: string;
  port: string;
  arrivesAt: number;
}

/** Bump when the save's shape changes; older saves are then discarded rather than misread. */
export const SAVE_VERSION = 3;

/** How the game stands: lost, goal reached, or how close the bank is. */
interface EndingState {
  outcome: Outcome | null;
  endedAt: number | null;
  goalAt: number | null;
  /** Quarters closed overdrawn in a row. */
  overdrawnCloses: number;
  /** Contracts delivered over the whole game, for a contracts goal. */
  contractsDone: number;
}

/** A system's state with its per-module map stored as a plain object, so it survives JSON. */
type Saved<T, V> = Omit<T, 'modules'> & { modules: Record<string, V> };

/** Everything needed to rebuild a sim exactly as it was. Plain JSON, so it can go in localStorage. */
export interface SimSave {
  version: typeof SAVE_VERSION;
  /** The scenario this save belongs to. */
  scenarioId: string;
  minutes: number;
  rng: number;
  layout: LayoutEntry[];
  power: Saved<PowerState, PowerModuleState>;
  thermal: Saved<ThermalState, ThermalModuleState>;
  life: LifeSupportState;
  reliability: Saved<ReliabilityState, ReliabilityModuleState>;
  economy: EconomyState;
  deliveries: Delivery[];
  ending: EndingState;
}

const toRecord = <V>(m: Map<string, V>): Record<string, V> => Object.fromEntries(m);

/** Rebuild a module map from a save, in station order, refusing a save that is missing a module. */
function toMap<V>(rec: Record<string, V>, ids: readonly string[], what: string): Map<string, V> {
  const map = new Map<string, V>();
  for (const id of ids) {
    const v = rec[id];
    if (v === undefined) throw new Error(`Save has no ${what} state for "${id}"`);
    map.set(id, v);
  }
  return map;
}

export interface SimOptions {
  /** When false, modules wear but never fail. Forecasts use this so a preview can't reveal the dice. */
  failures?: boolean;
}

export type CommandResult = { ok: true; moduleId?: string } | { ok: false; reason: string };

/** New batteries arrive half charged. */
const NEW_BATTERY_CHARGE = 0.5;

const TICK_HOURS = 1 / 60;

/** Money for refusal reasons, in $ millions. */
const money = (m: number) => (m >= 1 ? `$${m.toFixed(1)}M` : `$${Math.round(m * 1000)}k`);

export class Simulation {
  readonly events = new EventBus<SimEvents>();
  readonly station: Station;
  readonly orbit: OrbitModel;
  readonly rng: Rng;
  readonly scenario: ScenarioDef;
  private readonly defList: readonly ModuleDef[];
  private readonly defs: Map<string, ModuleDef>;
  private readonly startMs: number;
  private minutes = 0;
  private power: PowerState;
  private thermal: ThermalState;
  private lifePlant: LifeSupportPlant;
  private life: LifeSupportState;
  private reliability: ReliabilityState;
  private economy: EconomyState;
  private deliveries: Delivery[] = [];
  private ending: EndingState = { outcome: null, endedAt: null, goalAt: null, overdrawnCloses: 0, contractsDone: 0 };
  private readonly failures: boolean;

  /** `layout` defaults to the scenario's starting layout; forks pass the current one. */
  constructor(defs: readonly ModuleDef[], scenario: ScenarioDef, layout: readonly LayoutEntry[] = scenario.layout, options: SimOptions = {}) {
    this.failures = options.failures ?? true;
    this.scenario = scenario;
    this.defList = defs;
    this.defs = indexDefs(defs);
    this.station = buildStation(this.defs, layout);
    this.orbit = createOrbit(scenario.orbit);
    this.rng = new Rng(scenario.seed);
    const start = Date.parse(scenario.startDate);
    if (Number.isNaN(start)) throw new Error(`Bad scenario start date "${scenario.startDate}"`);
    this.startMs = start;
    this.power = createPowerState(this.station, scenario.power.initialChargeFraction);
    this.thermal = createThermalState(this.station, scenario.thermal);
    this.lifePlant = lifeSupportPlant(this.station, scenario.lifeSupport);
    this.life = createLifeSupportState(this.lifePlant, scenario.lifeSupport);
    this.reliability = createReliabilityState(this.station, scenario.reliability);
    this.economy = createEconomyState(scenario.economy, this.rng);
    // Spare parts are paid for when a crew team picks a job up, and refunded if it is cancelled.
    this.events.on('repairStarted', ({ moduleId, kind }) => {
      const price = this.station.byId.get(moduleId)?.def.price ?? 0;
      const cost = price * (kind === 'repair' ? scenario.economy.repairCostShare : scenario.economy.serviceCostShare);
      this.economy.partsOnJob[moduleId] = cost;
      book(this.economy, 'repairs', -cost);
    });
    this.events.on('repairDone', ({ moduleId }) => delete this.economy.partsOnJob[moduleId]);
    this.events.on('moduleFailed', () => this.economy.stats.failures++);
    this.events.on('contractCompleted', () => this.ending.contractsDone++);
    this.events.on('quarterReport', ({ report }) => {
      this.ending.overdrawnCloses = report.cash < 0 ? this.ending.overdrawnCloses + 1 : 0;
    });
    this.solve(false);
  }

  get elapsedMinutes(): number {
    return this.minutes;
  }

  /** True once the game is lost. The sim no longer ticks. */
  get ended(): boolean {
    return this.ending.outcome !== null;
  }

  tick(): void {
    if (this.ended) return;
    const wasShadow = isInShadowArc(this.orbit, phaseAt(this.orbit, this.minutes));
    this.minutes += 1;
    const isShadow = isInShadowArc(this.orbit, phaseAt(this.orbit, this.minutes));
    if (!wasShadow && isShadow) this.events.emit('eclipseBegan', { minutes: this.minutes });
    if (wasShadow && !isShadow) this.events.emit('sunrise', { minutes: this.minutes });
    this.deliverDue();
    this.solve(true);
    this.checkEnding();
  }

  /** Has the goal been reached, or the game been lost? Called after every tick and loan repayment. */
  private checkEnding(): void {
    const e = this.ending;
    if (e.outcome) return;
    const cfg = this.scenario.endings;
    const goal = this.goalSnapshot();
    if (e.goalAt === null && goal.progress >= 1) {
      e.goalAt = this.minutes;
      this.events.emit('goalReached', { minutes: this.minutes });
    }
    let outcome: Outcome | null = null;
    if (this.life.health < cfg.evacuateBelow) outcome = 'evacuated';
    else if (e.goalAt === null && goal.deadlineAtMinutes !== null && this.minutes >= goal.deadlineAtMinutes) outcome = 'replaced';
    else if (this.economy.cash < -cfg.overdraftLimit || e.overdrawnCloses >= cfg.overdrawnQuarters) outcome = 'bankrupt';
    if (outcome) {
      e.outcome = outcome;
      e.endedAt = this.minutes;
      this.events.emit('gameOver', { outcome, minutes: this.minutes });
    }
  }

  /** Run many ticks at once (tests, fast-forward). */
  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.tick();
  }

  command(cmd: SimCommand): CommandResult {
    if (this.ended) return { ok: false, reason: 'The station is no longer yours to run' };
    switch (cmd.type) {
      case 'setModuleEnabled':
        if (!this.station.byId.has(cmd.moduleId)) return { ok: false, reason: `No module "${cmd.moduleId}"` };
        setModuleEnabled(this.power, cmd.moduleId, cmd.enabled);
        // Re-solve so the snapshot reflects the switch right away, without spending energy or heat.
        this.solve(false);
        return { ok: true };
      case 'addModule':
        return this.addModule(cmd.defId, cmd.to, cmd.port);
      case 'repair': {
        const problem = repairProblem(this.reliability, this.station, cmd.moduleId);
        if (problem) return { ok: false, reason: problem };
        queueRepair(this.reliability, this.station, cmd.moduleId, this.scenario.reliability, this.events);
        this.solve(false);
        return { ok: true };
      }
      case 'cancelRepair': {
        if (!cancelRepair(this.reliability, cmd.moduleId, this.scenario.reliability, this.events)) {
          return { ok: false, reason: `No work is planned on "${cmd.moduleId}"` };
        }
        const refund = this.economy.partsOnJob[cmd.moduleId];
        if (refund !== undefined) {
          book(this.economy, 'repairs', refund);
          delete this.economy.partsOnJob[cmd.moduleId];
        }
        this.solve(false);
        return { ok: true };
      }
      case 'acceptContract': {
        const problem = acceptProblem(this.economy, this.station, cmd.uid);
        if (problem) return { ok: false, reason: problem };
        acceptContract(this.economy, this.scenario.economy, cmd.uid, this.minutes, this.events);
        return { ok: true };
      }
      case 'abandonContract':
        return abandonContract(this.economy, this.scenario.economy, cmd.uid, this.events) ? { ok: true } : { ok: false, reason: 'No such contract is running' };
      case 'repayLoan': {
        if (!(cmd.amount > 0)) return { ok: false, reason: 'Choose an amount to repay' };
        if (this.economy.loan <= 0) return { ok: false, reason: 'The loan is already paid off' };
        if (this.economy.cash <= 0) return { ok: false, reason: 'No cash to repay with' };
        repayLoan(this.economy, cmd.amount);
        this.checkEnding();
        return { ok: true };
      }
    }
  }

  /** Why `defId` can't be built on `to`'s `port`, or null if it can. Sim rules only: the view checks for collisions. */
  buildProblem(defId: string, to: string, port: string): string | null {
    const def = this.defs.get(defId);
    if (!def) return `Unknown module "${defId}"`;
    const via = mountPort(def);
    if (!via) return `${def.name} has no port to mount by`;
    if (def.price === undefined) return `${def.name} is not for sale`;
    if (this.deliveries.some((d) => d.to === to && d.port === port)) return 'A module is already on its way to that port';
    const problem = attachProblem(this.station, this.defs, { id: this.nextId(defId), module: defId, attach: { to, port, via } });
    if (problem) return problem;
    if (this.economy.cash < def.price) return `Not enough cash: the ${def.name} costs ${money(def.price)}`;
    return null;
  }

  /** The next instance id for `defId`, skipping ones already on order. */
  private nextId(defId: string): string {
    let n = 1;
    const taken = (id: string) => this.station.byId.has(id) || this.deliveries.some((d) => d.moduleId === id);
    while (taken(`${defId}-${n}`)) n++;
    return `${defId}-${n}`;
  }

  /** Pay for a module and put it on the next launch. It docks after the delivery time. */
  private addModule(defId: string, to: string, port: string): CommandResult {
    const problem = this.buildProblem(defId, to, port);
    if (problem) return { ok: false, reason: problem };
    const def = this.defs.get(defId)!;
    const id = this.nextId(defId);
    const hours = this.scenario.economy.deliveryHours;
    book(this.economy, 'construction', -def.price!);
    this.deliveries.push({ moduleId: id, defId, to, port, arrivesAt: this.minutes + Math.round(hours * 60) });
    this.events.emit('moduleOrdered', { moduleId: id, defId, cost: def.price!, hours });
    if (hours <= 0) this.deliverDue();
    return { ok: true, moduleId: id };
  }

  /** Dock every module that is on its way, now. Forecasts use this to show a module's effect once installed. */
  deliverAll(): void {
    for (const d of this.deliveries) d.arrivesAt = Math.min(d.arrivesAt, this.minutes);
    this.deliverDue();
  }

  private deliverDue(): void {
    const due = this.deliveries.filter((d) => d.arrivesAt <= this.minutes);
    if (due.length === 0) return;
    this.deliveries = this.deliveries.filter((d) => !due.includes(d));
    for (const d of due) this.install(d);
    this.solve(false);
  }

  private install(d: Delivery): void {
    const def = this.defs.get(d.defId)!;
    const inst = attachModule(this.station, this.defs, { id: d.moduleId, module: d.defId, attach: { to: d.to, port: d.port, via: mountPort(def)! } });
    addPowerModule(this.power, inst, NEW_BATTERY_CHARGE);
    addThermalModule(this.thermal, d.moduleId);
    addReliabilityModule(this.reliability, d.moduleId);
    // New cabins, crew, and tanks change the plant; the air and tanks keep what they hold (new tanks arrive empty).
    this.lifePlant = lifeSupportPlant(this.station, this.scenario.lifeSupport);
    this.events.emit('moduleAdded', { moduleId: d.moduleId, defId: d.defId });
  }

  /** The station's current layout, parents first. */
  layout(): LayoutEntry[] {
    return this.station.modules.map((m) => (m.attach ? { id: m.id, module: m.def.id, attach: { ...m.attach } } : { id: m.id, module: m.def.id }));
  }

  /**
   * An independent copy of this sim at this moment, with its own (empty) event bus.
   * The sim is pure and deterministic, so a fork can run ahead to preview a change without touching the real one.
   * Pass `failures: false` for previews: the fork shares the rng state, so with failures on it would show exactly
   * which module breaks and when.
   */
  fork(options: SimOptions = {}): Simulation {
    return Simulation.fromSave(this.defList, this.scenario, this.save(), { failures: options.failures ?? this.failures });
  }

  /** The whole sim state as plain JSON-safe data. A copy: later ticks don't change it. */
  save(): SimSave {
    const clone = structuredClone({
      power: this.power,
      thermal: this.thermal,
      life: this.life,
      reliability: this.reliability,
      economy: this.economy,
      deliveries: this.deliveries,
      ending: this.ending,
    });
    return {
      version: SAVE_VERSION,
      scenarioId: this.scenario.id,
      minutes: this.minutes,
      rng: this.rng.getState(),
      layout: this.layout(),
      power: { ...clone.power, modules: toRecord(clone.power.modules) },
      thermal: { ...clone.thermal, modules: toRecord(clone.thermal.modules) },
      life: clone.life,
      reliability: { ...clone.reliability, modules: toRecord(clone.reliability.modules) },
      economy: clone.economy,
      deliveries: clone.deliveries,
      ending: clone.ending,
    };
  }

  /**
   * Rebuild a sim from `save()`'s output. Throws if the save is from another version or scenario, or names a
   * module the data no longer has. The save is copied, so the caller keeps its own.
   */
  static fromSave(defs: readonly ModuleDef[], scenario: ScenarioDef, saved: SimSave, options: SimOptions = {}): Simulation {
    if (saved.version !== SAVE_VERSION) throw new Error(`Save is version ${String(saved.version)}, expected ${SAVE_VERSION}`);
    if (saved.scenarioId !== scenario.id) throw new Error(`Save is from scenario "${saved.scenarioId}", not "${scenario.id}"`);
    const s = structuredClone(saved);
    const sim = new Simulation(defs, scenario, s.layout, options);
    const ids = sim.station.modules.map((m) => m.id);
    sim.minutes = s.minutes;
    sim.rng.setState(s.rng);
    sim.power = { ...s.power, modules: toMap(s.power.modules, ids, 'power') };
    sim.thermal = { ...s.thermal, modules: toMap(s.thermal.modules, ids, 'thermal') };
    sim.life = s.life;
    sim.reliability = { ...s.reliability, modules: toMap(s.reliability.modules, ids, 'reliability') };
    sim.economy = s.economy;
    sim.deliveries = s.deliveries;
    sim.ending = s.ending;
    for (const d of sim.deliveries) {
      if (!sim.defs.has(d.defId)) throw new Error(`Save has an order for unknown module "${d.defId}"`);
    }
    sim.solve(false);
    return sim;
  }

  /** Total failure hazard × days run so far. Forecasts turn its growth into a chance of failure. */
  get failureExposure(): number {
    return this.reliability.exposure;
  }

  /**
   * Wear and repairs first (from last tick's statuses and temperatures), then power (using last tick's thermal
   * limits), then heat and life support from what actually ran.
   */
  private solve(commit: boolean): void {
    const rcfg = this.scenario.reliability;
    if (commit) {
      stepReliability(this.reliability, this.station, this.power, this.thermal, {
        cfg: rcfg,
        dtHours: TICK_HOURS,
        rng: this.rng,
        failures: this.failures,
        events: this.events,
      });
    }
    for (const m of this.station.modules) setOutage(this.power, m.id, outage(this.reliability, m.id, rcfg));
    // Sunlight at the middle of the minute that just passed (or is about to, for the first solve).
    const mid = commit ? this.minutes - 0.5 : this.minutes;
    const sunlight = sunlightAt(this.orbit, phaseAt(this.orbit, mid));
    stepPower(this.power, this.station, {
      sunlight,
      thresholds: this.scenario.power.thresholds,
      dtHours: TICK_HOURS,
      commitEnergy: commit,
      thermal: thermalLimits(this.thermal, this.scenario.thermal),
      events: this.events,
    });
    stepThermal(this.thermal, this.station, this.power, {
      sunlight,
      cfg: this.scenario.thermal,
      dtHours: TICK_HOURS,
      commit,
      events: this.events,
    });
    stepLifeSupport(this.life, this.lifePlant, this.station, this.power, {
      cfg: this.scenario.lifeSupport,
      dtHours: TICK_HOURS,
      commit,
      events: this.events,
    });
    if (commit) {
      stepEconomy(this.economy, this.station, this.power, {
        cfg: this.scenario.economy,
        rng: this.rng,
        now: this.minutes,
        dtHours: TICK_HOURS,
        throttleFactor: this.scenario.thermal.throttleFactor,
        events: this.events,
      });
    }
  }

  private economySnapshot(): SimSnapshot['economy'] {
    const e = this.economy;
    const cfg = this.scenario.economy;
    const quarterMinutes = Math.round(cfg.quarterDays * 1440);
    return {
      cash: e.cash,
      loan: e.loan,
      ratePerQuarter: cfg.loan.ratePerQuarter,
      quarter: e.quarter,
      quarterProgress: (this.minutes % quarterMinutes) / quarterMinutes,
      ledger: { ...e.ledger },
      netPerDay: netPerDay(this.station, this.power, e, cfg),
      lastReport: e.lastReport ? structuredClone(e.lastReport) : null,
      ...contractSnapshots(e, this.station, this.power, cfg, this.minutes, this.scenario.thermal.throttleFactor),
      labs: labCount(this.station),
      guestIncomePerDay: Object.fromEntries(
        this.station.modules.filter((m) => m.def.cabin?.guests).map((m) => [m.id, (m.def.cabin?.guests ?? 0) * cfg.guestPerDay]),
      ),
      deliveries: this.deliveries.map((d) => ({
        moduleId: d.moduleId,
        defId: d.defId,
        name: this.defs.get(d.defId)?.name ?? d.defId,
        to: d.to,
        port: d.port,
        hoursLeft: (d.arrivesAt - this.minutes) / 60,
      })),
    };
  }

  /** Lifetime books (never reset at quarter ends), for forecasts. */
  get lifetimeLedger(): Readonly<Ledger> {
    return this.economy.lifetime;
  }

  private goalSnapshot(): GoalSnapshot {
    const g = this.scenario.goal;
    const deadlineAtMinutes = g.days === undefined ? null : Math.round(g.days * 1440);
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    switch (g.kind) {
      case 'repayLoan': {
        const principal = this.scenario.economy.loan.principal;
        const left = this.economy.loan;
        return { kind: g.kind, current: left, target: 0, progress: principal > 0 ? clamp(1 - left / principal) : 1, deadlineAtMinutes };
      }
      case 'cash':
        return { kind: g.kind, current: this.economy.cash, target: g.amount, progress: clamp(this.economy.cash / g.amount), deadlineAtMinutes };
      case 'contracts':
        return { kind: g.kind, current: this.ending.contractsDone, target: g.count, progress: clamp(this.ending.contractsDone / g.count), deadlineAtMinutes };
    }
  }

  private endingSnapshot(): EndingSnapshot {
    const cfg = this.scenario.endings;
    return {
      outcome: this.ending.outcome,
      endedAtMinutes: this.ending.endedAt,
      goalAtMinutes: this.ending.goalAt,
      goal: this.goalSnapshot(),
      overdrawnCloses: this.ending.overdrawnCloses,
      overdrawnQuarters: cfg.overdrawnQuarters,
      overdraftLimit: cfg.overdraftLimit,
      evacuateBelow: cfg.evacuateBelow,
    };
  }

  snapshot(): SimSnapshot {
    const { storedKwh, capacityKwh } = storageTotals(this.power, this.station);
    const t = this.power.totals;
    const modules: ModuleSnapshot[] = this.station.modules.map((m) => {
      const s = this.power.modules.get(m.id)!;
      const t = this.thermal.modules.get(m.id)!;
      const r = this.reliability.modules.get(m.id)!;
      return {
        id: m.id,
        defId: m.def.id,
        attach: m.attach,
        name: m.def.name,
        kind: m.def.kind,
        tier: m.def.power.tier,
        status: s.status,
        drawKw: m.def.power.drawKw,
        actualDrawKw: s.actualDrawKw,
        generationKw: s.generationKw,
        storedKwh: s.storedKwh,
        capacityKwh: m.def.power.storageKwh ?? 0,
        enabled: s.enabled,
        tempC: t.tempC,
        heatKw: t.heatKw,
        rejectKw: t.rejectKw,
        wear: r.wear,
        failChancePerDay: r.failed ? 0 : 1 - Math.exp(-hazardPerDay(m.def, r.wear, t.tempC, this.scenario.reliability)),
        canFail: m.def.reliability !== undefined,
        dueForService: r.worn,
        repair: repairSnapshot(this.reliability, m.id, this.scenario.reliability),
      };
    });
    const snap: Omit<SimSnapshot, 'warnings'> = {
      minutes: this.minutes,
      timeMs: this.startMs + this.minutes * MINUTE_MS,
      orbit: orbitSnapshot(this.orbit, this.minutes),
      power: {
        generationKw: t.generationKw,
        loadKw: t.loadKw,
        demandKw: t.demandKw,
        chargeKw: t.chargeKw,
        dischargeKw: t.dischargeKw,
        curtailedKw: t.curtailedKw,
        storedKwh,
        capacityKwh,
        charge: capacityKwh > 0 ? storedKwh / capacityKwh : 0,
        shedTiers: { ...this.power.shedTiers },
      },
      thermal: {
        loopC: this.thermal.loopC,
        setpointC: this.scenario.thermal.setpointC,
        heatKw: this.thermal.totals.heatKw,
        rejectKw: this.thermal.totals.rejectKw,
        capacityKw: this.thermal.totals.capacityKw,
        throttled: this.thermal.throttled,
        tripped: { ...this.thermal.tripped },
        throttleAboveC: this.scenario.thermal.throttle.above,
        tripAboveC: this.scenario.thermal.trip.commercial.above,
      },
      lifeSupport: {
        crew: this.lifePlant.crew,
        guests: this.lifePlant.guests,
        people: this.lifePlant.crew + this.lifePlant.guests,
        volumeM3: this.lifePlant.volumeM3,
        o2Kg: this.life.o2Kg,
        o2CapacityKg: this.lifePlant.o2CapacityKg,
        ...this.life.rates,
        co2MmHg: co2MmHg(this.life, this.lifePlant),
        co2WarnMmHg: this.scenario.lifeSupport.co2Warn.above,
        co2DangerMmHg: this.scenario.lifeSupport.co2Danger.above,
        waterKg: this.life.waterKg,
        waterCapacityKg: this.lifePlant.waterCapacityKg,
        health: this.life.health,
        alarms: { ...this.life.alarms },
      },
      modules,
      freePorts: freePorts(this.station).filter((p) => !this.deliveries.some((d) => d.to === p.moduleId && d.port === p.portId)),
      economy: this.economySnapshot(),
      ending: this.endingSnapshot(),
    };
    return { ...snap, warnings: diagnose(snap) };
  }
}
