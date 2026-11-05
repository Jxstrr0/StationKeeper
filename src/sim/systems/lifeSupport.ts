// Life support: everyone aboard breathes O2, breathes out CO2, and uses water. Racks make O2 by
// electrolysis (which costs water), scrub CO2 out of the cabin, and recover most used water, but only
// while they have power. The racks are an Essential load, so a power or heat problem becomes a
// breathing problem: CO2 builds in hours, O2 runs out in days, water in weeks.
import { bandHigh, bandLow } from '../band';
import type { EventBus, LifeSupportAlarm, SimEvents } from '../events';
import type { Station } from '../station';
import type { LifeSupportConfig, LifeSupportSnapshot } from '../types';
import { bookedGuests } from './guests';
import type { PowerState } from './power';

const CO2_KG_PER_MOL = 0.04401;
const GAS_CONSTANT = 8.314;
const PA_PER_MMHG = 133.322;
const EPS = 1e-9;

export type Alarms = LifeSupportSnapshot['alarms'];

export interface LifeSupportRates {
  o2MadeKgPerDay: number;
  o2UsedKgPerDay: number;
  co2RemovedKgPerDay: number;
  waterNetKgPerDay: number;
}

export interface LifeSupportState {
  o2Kg: number;
  waterKg: number;
  /** CO2 mass in the cabin air, kg. Stored as mass so a bigger station dilutes it. */
  co2Kg: number;
  health: number;
  alarms: Alarms;
  rates: LifeSupportRates;
}

/** Fixed facts about the station's life support, read from module data. */
export interface LifeSupportPlant {
  crew: number;
  guests: number;
  volumeM3: number;
  o2CapacityKg: number;
  waterCapacityKg: number;
  /** CO2 partial pressure per kg of CO2 in the cabin, mmHg/kg. */
  mmHgPerKg: number;
}

/** `crew` is how many crew are aboard; guests (at `occupancy` of their places), air volume, and tanks come from the modules. */
export function lifeSupportPlant(station: Station, cfg: LifeSupportConfig, crew: number, occupancy = 1): LifeSupportPlant {
  let guests = 0;
  let volumeM3 = 0;
  let o2CapacityKg = 0;
  let waterCapacityKg = 0;
  for (const m of station.modules) {
    guests += bookedGuests(m.def.cabin?.guests ?? 0, occupancy);
    volumeM3 += m.def.cabin?.volumeM3 ?? 0;
    o2CapacityKg += m.def.lifeSupport?.o2TankKg ?? 0;
    waterCapacityKg += m.def.lifeSupport?.waterTankKg ?? 0;
  }
  // Ideal gas: p = (m / M) R T / V.
  const mmHgPerKg = volumeM3 > 0 ? ((1 / CO2_KG_PER_MOL) * GAS_CONSTANT * (cfg.cabinC + 273.15)) / volumeM3 / PA_PER_MMHG : 0;
  return { crew, guests, volumeM3, o2CapacityKg, waterCapacityKg, mmHgPerKg };
}

export function createLifeSupportState(plant: LifeSupportPlant, cfg: LifeSupportConfig): LifeSupportState {
  return {
    o2Kg: plant.o2CapacityKg * cfg.initialO2Fraction,
    waterKg: plant.waterCapacityKg * cfg.initialWaterFraction,
    co2Kg: plant.mmHgPerKg > 0 ? cfg.initialCo2MmHg / plant.mmHgPerKg : 0,
    health: 1,
    alarms: { co2Warn: false, co2Danger: false, o2Low: false, o2Out: false, waterLow: false, waterOut: false, healthLow: false },
    rates: { o2MadeKgPerDay: 0, o2UsedKgPerDay: 0, co2RemovedKgPerDay: 0, waterNetKgPerDay: 0 },
  };
}

export function co2MmHg(state: LifeSupportState, plant: LifeSupportPlant): number {
  return state.co2Kg * plant.mmHgPerKg;
}

export interface LifeSupportStepOptions {
  cfg: LifeSupportConfig;
  dtHours: number;
  /** When false, refresh the rates but leave tanks, air, and health alone. */
  commit?: boolean;
  events?: EventBus<SimEvents>;
}

export function stepLifeSupport(
  state: LifeSupportState,
  plant: LifeSupportPlant,
  station: Station,
  power: PowerState,
  opts: LifeSupportStepOptions,
): void {
  const { cfg, dtHours, events } = opts;
  const commit = opts.commit ?? true;
  const dtDays = dtHours / 24;
  const people = plant.crew + plant.guests;

  // What the running racks can do this tick.
  let o2GenKgPerDay = 0;
  let scrubKgPerDay = 0;
  let recovery = 0;
  for (const m of station.modules) {
    const ls = m.def.lifeSupport;
    const status = power.modules.get(m.id)?.status;
    if (!ls || (status !== 'powered' && status !== 'throttled')) continue;
    o2GenKgPerDay += ls.o2KgPerDay;
    scrubKgPerDay += ls.co2KgPerDay;
    recovery = Math.max(recovery, ls.waterRecovery);
  }

  const o2Use = people * cfg.perPerson.o2KgPerDay * dtDays;
  const co2Made = people * cfg.perPerson.co2KgPerDay * dtDays;
  const waterUse = people * cfg.perPerson.waterKgPerDay * dtDays;
  const waterBack = waterUse * recovery;

  // Electrolysis tops the O2 tanks up, if there is water left to split.
  const o2Room = Math.max(0, plant.o2CapacityKg - state.o2Kg + o2Use);
  const waterForO2 = Math.max(0, state.waterKg - waterUse + waterBack);
  const o2Made = Math.min(o2GenKgPerDay * dtDays, o2Room, waterForO2 / cfg.waterPerKgO2);

  // Scrubbers hold the CO2 setpoint when they can.
  const setpointKg = plant.mmHgPerKg > 0 ? cfg.co2SetpointMmHg / plant.mmHgPerKg : 0;
  const co2Removed = Math.min(scrubKgPerDay * dtDays, Math.max(0, state.co2Kg + co2Made - setpointKg));

  const water = Math.min(plant.waterCapacityKg, Math.max(0, state.waterKg - waterUse + waterBack - o2Made * cfg.waterPerKgO2));
  state.rates = {
    o2MadeKgPerDay: o2Made / dtDays,
    o2UsedKgPerDay: o2Use / dtDays,
    co2RemovedKgPerDay: co2Removed / dtDays,
    waterNetKgPerDay: (water - state.waterKg) / dtDays,
  };
  if (!commit) return;

  state.o2Kg = Math.min(plant.o2CapacityKg, Math.max(0, state.o2Kg + o2Made - o2Use));
  state.waterKg = water;
  state.co2Kg = Math.max(0, state.co2Kg + co2Made - co2Removed);

  // Crew condition: bad air or no water wears people down; good air lets them recover.
  const co2 = co2MmHg(state, plant);
  const o2Out = people > 0 && state.o2Kg <= EPS;
  const waterOut = people > 0 && state.waterKg <= EPS;
  let loss = Math.max(0, co2 - cfg.co2Danger.above) * cfg.health.co2PerMmHgHour * dtHours;
  if (o2Out) loss += cfg.health.hypoxiaPerHour * dtHours;
  if (waterOut) loss += cfg.health.thirstPerDay * dtDays;
  if (loss > 0) state.health -= loss;
  else if (co2 < cfg.co2Warn.above) state.health += cfg.health.recoverPerHour * dtHours;
  state.health = Math.min(1, Math.max(0, state.health));

  const before = state.alarms;
  const o2Frac = plant.o2CapacityKg > 0 ? state.o2Kg / plant.o2CapacityKg : 1;
  const waterFrac = plant.waterCapacityKg > 0 ? state.waterKg / plant.waterCapacityKg : 1;
  const after: Alarms = {
    co2Warn: bandHigh(before.co2Warn, co2, cfg.co2Warn),
    co2Danger: bandHigh(before.co2Danger, co2, cfg.co2Danger),
    o2Low: bandLow(before.o2Low, o2Frac, cfg.o2Low),
    o2Out,
    waterLow: bandLow(before.waterLow, waterFrac, cfg.waterLow),
    waterOut,
    healthLow: bandLow(before.healthLow, state.health, cfg.health.low),
  };
  const value: Record<LifeSupportAlarm, number> = {
    co2Warn: co2,
    co2Danger: co2,
    o2Low: o2Frac,
    o2Out: state.o2Kg,
    waterLow: waterFrac,
    waterOut: state.waterKg,
    healthLow: state.health,
  };
  for (const key of Object.keys(after) as LifeSupportAlarm[]) {
    if (after[key] !== before[key]) events?.emit('lifeSupportAlarm', { alarm: key, active: after[key], value: value[key] });
  }
  state.alarms = after;
}
