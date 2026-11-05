// The simulation: owns all sim state, advances one tick per in-game minute, and hands out snapshots.
// The view and UI read snapshots and send commands; they never touch sim state directly.
import { EventBus, type SimEvents } from './events';
import { createOrbit, isInShadowArc, orbitSnapshot, phaseAt, sunlightAt, type OrbitModel } from './orbit';
import { Rng } from './rng';
import { buildStation, indexDefs, type Station } from './station';
import { createPowerState, setModuleEnabled, stepPower, storageTotals, type PowerState } from './systems/power';
import {
  co2MmHg,
  createLifeSupportState,
  lifeSupportPlant,
  stepLifeSupport,
  type LifeSupportPlant,
  type LifeSupportState,
} from './systems/lifeSupport';
import { createThermalState, stepThermal, thermalLimits, type ThermalState } from './systems/thermal';
import { MINUTE_MS } from './time';
import type { ModuleDef, ModuleSnapshot, ScenarioDef, SimSnapshot } from './types';

export type SimCommand = { type: 'setModuleEnabled'; moduleId: string; enabled: boolean };

const TICK_HOURS = 1 / 60;

export class Simulation {
  readonly events = new EventBus<SimEvents>();
  readonly station: Station;
  readonly orbit: OrbitModel;
  readonly rng: Rng;
  readonly scenario: ScenarioDef;
  private readonly startMs: number;
  private minutes = 0;
  private readonly power: PowerState;
  private readonly thermal: ThermalState;
  private readonly lifePlant: LifeSupportPlant;
  private readonly life: LifeSupportState;

  constructor(defs: readonly ModuleDef[], scenario: ScenarioDef) {
    this.scenario = scenario;
    this.station = buildStation(indexDefs(defs), scenario.layout);
    this.orbit = createOrbit(scenario.orbit);
    this.rng = new Rng(scenario.seed);
    const start = Date.parse(scenario.startDate);
    if (Number.isNaN(start)) throw new Error(`Bad scenario start date "${scenario.startDate}"`);
    this.startMs = start;
    this.power = createPowerState(this.station, scenario.power.initialChargeFraction);
    this.thermal = createThermalState(this.station, scenario.thermal);
    this.lifePlant = lifeSupportPlant(this.station, scenario.lifeSupport);
    this.life = createLifeSupportState(this.lifePlant, scenario.lifeSupport);
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

  command(cmd: SimCommand): void {
    switch (cmd.type) {
      case 'setModuleEnabled':
        if (!this.station.byId.has(cmd.moduleId)) return;
        setModuleEnabled(this.power, cmd.moduleId, cmd.enabled);
        // Re-solve so the snapshot reflects the switch right away, without spending energy or heat.
        this.solve(false);
        return;
    }
  }

  /** Power first (using last tick's thermal limits), then heat and life support from what actually ran. */
  private solve(commit: boolean): void {
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
      };
    });
    return {
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
    };
  }
}
