// The simulation: owns all sim state, advances one tick per in-game minute, and hands out snapshots.
// The view and UI read snapshots and send commands; they never touch sim state directly.
import { EventBus, type SimEvents } from './events';
import { createOrbit, isInShadowArc, orbitSnapshot, phaseAt, sunlightAt, type OrbitModel } from './orbit';
import { Rng } from './rng';
import { attachModule, attachProblem, buildStation, freePorts, indexDefs, mountPort, nextInstanceId, type Station } from './station';
import { addPowerModule, createPowerState, setModuleEnabled, setOutage, stepPower, storageTotals, type PowerState } from './systems/power';
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
  type ReliabilityState,
} from './systems/reliability';
import { addThermalModule, createThermalState, stepThermal, thermalLimits, type ThermalState } from './systems/thermal';
import { MINUTE_MS } from './time';
import type { LayoutEntry, ModuleDef, ModuleSnapshot, ScenarioDef, SimSnapshot } from './types';
import { diagnose } from './warnings';

export type SimCommand =
  | { type: 'setModuleEnabled'; moduleId: string; enabled: boolean }
  /** Build a module from `defId`, mounting it by its first port onto `to`'s `port`. */
  | { type: 'addModule'; defId: string; to: string; port: string }
  /** Put a module on the crew's list: a service if it works, a repair if it has failed. */
  | { type: 'repair'; moduleId: string }
  | { type: 'cancelRepair'; moduleId: string };

export interface SimOptions {
  /** When false, modules wear but never fail. Forecasts use this so a preview can't reveal the dice. */
  failures?: boolean;
}

export type CommandResult = { ok: true; moduleId?: string } | { ok: false; reason: string };

/** New batteries arrive half charged. */
const NEW_BATTERY_CHARGE = 0.5;

const TICK_HOURS = 1 / 60;

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
    this.solve(false);
  }

  get elapsedMinutes(): number {
    return this.minutes;
  }

  tick(): void {
    const wasShadow = isInShadowArc(this.orbit, phaseAt(this.orbit, this.minutes));
    this.minutes += 1;
    const isShadow = isInShadowArc(this.orbit, phaseAt(this.orbit, this.minutes));
    if (!wasShadow && isShadow) this.events.emit('eclipseBegan', { minutes: this.minutes });
    if (wasShadow && !isShadow) this.events.emit('sunrise', { minutes: this.minutes });
    this.solve(true);
  }

  /** Run many ticks at once (tests, fast-forward). */
  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.tick();
  }

  command(cmd: SimCommand): CommandResult {
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
      case 'cancelRepair':
        if (!cancelRepair(this.reliability, cmd.moduleId, this.scenario.reliability, this.events)) {
          return { ok: false, reason: `No work is planned on "${cmd.moduleId}"` };
        }
        this.solve(false);
        return { ok: true };
    }
  }

  /** Why `defId` can't be built on `to`'s `port`, or null if it can. Sim rules only: the view checks for collisions. */
  buildProblem(defId: string, to: string, port: string): string | null {
    const def = this.defs.get(defId);
    if (!def) return `Unknown module "${defId}"`;
    const via = mountPort(def);
    if (!via) return `${def.name} has no port to mount by`;
    return attachProblem(this.station, this.defs, { id: nextInstanceId(this.station, defId), module: defId, attach: { to, port, via } });
  }

  private addModule(defId: string, to: string, port: string): CommandResult {
    const problem = this.buildProblem(defId, to, port);
    if (problem) return { ok: false, reason: problem };
    const def = this.defs.get(defId)!;
    const id = nextInstanceId(this.station, defId);
    const inst = attachModule(this.station, this.defs, { id, module: defId, attach: { to, port, via: mountPort(def)! } });
    addPowerModule(this.power, inst, NEW_BATTERY_CHARGE);
    addThermalModule(this.thermal, id);
    addReliabilityModule(this.reliability, id);
    // New cabins, crew, and tanks change the plant; the air and tanks keep what they hold (new tanks arrive empty).
    this.lifePlant = lifeSupportPlant(this.station, this.scenario.lifeSupport);
    this.solve(false);
    this.events.emit('moduleAdded', { moduleId: id, defId });
    return { ok: true, moduleId: id };
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
    const copy = new Simulation(this.defList, this.scenario, this.layout(), { failures: options.failures ?? this.failures });
    copy.minutes = this.minutes;
    copy.rng.setState(this.rng.getState());
    copy.power = structuredClone(this.power);
    copy.thermal = structuredClone(this.thermal);
    copy.life = structuredClone(this.life);
    copy.reliability = structuredClone(this.reliability);
    copy.solve(false);
    return copy;
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
      freePorts: freePorts(this.station),
    };
    return { ...snap, warnings: diagnose(snap) };
  }
}
