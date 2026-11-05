// Power system: solar generation, batteries, and tiered loads on one shared network.
import type { EventBus, SimEvents } from '../events';
import { solveNetwork, type NetworkLoad } from '../network';
import type { ModuleInstance, Station } from '../station';
import type { ModuleStatus, Tier, TierThreshold } from '../types';
import type { Outage } from './reliability';
import { isCooler, type ThermalLimits } from './thermal';

export interface PowerModuleState {
  enabled: boolean;
  /** Broken or being worked on: out of the network whatever the switch says. Set by the sim from reliability. */
  outage: Outage | null;
  status: ModuleStatus;
  storedKwh: number;
  actualDrawKw: number;
  generationKw: number;
}

export interface PowerTotals {
  generationKw: number;
  loadKw: number;
  demandKw: number;
  chargeKw: number;
  dischargeKw: number;
  curtailedKw: number;
  unmetKw: number;
}

export interface PowerState {
  modules: Map<string, PowerModuleState>;
  shedTiers: Record<Tier, boolean>;
  totals: PowerTotals;
}

export function createPowerState(station: Station, initialChargeFraction: number): PowerState {
  const modules = new Map<string, PowerModuleState>();
  for (const m of station.modules) {
    modules.set(m.id, {
      enabled: true,
      outage: null,
      status: 'powered',
      storedKwh: (m.def.power.storageKwh ?? 0) * initialChargeFraction,
      actualDrawKw: 0,
      generationKw: 0,
    });
  }
  return {
    modules,
    shedTiers: { critical: false, essential: false, commercial: false },
    totals: { generationKw: 0, loadKw: 0, demandKw: 0, chargeKw: 0, dischargeKw: 0, curtailedKw: 0, unmetKw: 0 },
  };
}

/** Give a newly built module its power state. Batteries arrive with `chargeFraction` of their capacity. */
export function addPowerModule(state: PowerState, inst: ModuleInstance, chargeFraction: number): void {
  state.modules.set(inst.id, {
    enabled: true,
    outage: null,
    status: 'powered',
    storedKwh: (inst.def.power.storageKwh ?? 0) * chargeFraction,
    actualDrawKw: 0,
    generationKw: 0,
  });
}

function moduleState(state: PowerState, id: string): PowerModuleState {
  const s = state.modules.get(id);
  if (!s) throw new Error(`No power state for module "${id}"`);
  return s;
}

export function storageTotals(state: PowerState, station: Station): { storedKwh: number; capacityKwh: number } {
  let storedKwh = 0;
  let capacityKwh = 0;
  for (const m of station.modules) {
    const cap = m.def.power.storageKwh ?? 0;
    const s = moduleState(state, m.id);
    if (cap <= 0 || !available(s)) continue;
    storedKwh += s.storedKwh;
    capacityKwh += cap;
  }
  return { storedKwh, capacityKwh };
}

export interface PowerStepOptions {
  /** Sunlight factor 0..1 for this tick. */
  sunlight: number;
  thresholds: Readonly<Record<Tier, TierThreshold>>;
  dtHours: number;
  /** When false, update statuses and totals but leave stored energy untouched (used for the first snapshot). */
  commitEnergy?: boolean;
  /** Throttle and overheat trips from the thermal system (last tick). */
  thermal?: ThermalLimits;
  events?: EventBus<SimEvents>;
}

const running = (s: ModuleStatus) => s === 'powered' || s === 'throttled';
/** Switched on and not broken or under service. */
const available = (s: PowerModuleState) => s.enabled && !s.outage;

export function stepPower(state: PowerState, station: Station, opts: PowerStepOptions): void {
  const { sunlight, thresholds, dtHours, events, thermal } = opts;
  const commitEnergy = opts.commitEnergy ?? true;

  let supply = 0;
  let capacity = 0;
  let stored = 0;
  let maxIn = 0;
  let maxOut = 0;
  const loads: NetworkLoad[] = [];
  const batteries: { id: string; capacity: number }[] = [];
  const demandKw = new Map<string, number>();
  const tripped = new Set<string>();
  const throttled = new Set<string>();

  for (const m of station.modules) {
    const p = m.def.power;
    const s = moduleState(state, m.id);
    const on = available(s);
    s.generationKw = on ? (p.generationKw ?? 0) * sunlight : 0;
    supply += s.generationKw;
    if (on && (p.storageKwh ?? 0) > 0) {
      capacity += p.storageKwh ?? 0;
      stored += s.storedKwh;
      maxIn += p.maxChargeKw ?? 0;
      maxOut += p.maxDischargeKw ?? 0;
      batteries.push({ id: m.id, capacity: p.storageKwh ?? 0 });
    }
    if (!on) continue;
    if (thermal?.tripped[p.tier] && !isCooler(m.def)) {
      tripped.add(m.id);
      continue;
    }
    let demand = p.drawKw;
    if (thermal?.throttled && p.tier === 'commercial' && demand > 0) {
      demand *= thermal.throttleFactor;
      throttled.add(m.id);
    }
    demandKw.set(m.id, demand);
    if (demand > 0) loads.push({ id: m.id, demand, tier: p.tier });
  }

  const result = solveNetwork({
    supply,
    store: { stored, capacity, maxIn, maxOut },
    loads,
    shedTiers: state.shedTiers,
    thresholds,
    dtHours,
  });

  // Tier events.
  for (const tier of ['commercial', 'essential', 'critical'] as const) {
    const charge = capacity > 0 ? stored / capacity : 0;
    if (result.shedTiers[tier] && !state.shedTiers[tier]) events?.emit('tierShed', { tier, charge });
    if (!result.shedTiers[tier] && state.shedTiers[tier]) events?.emit('tierRestored', { tier, charge });
  }
  state.shedTiers = result.shedTiers;

  // Spread the store level back over batteries by capacity.
  if (commitEnergy) {
    for (const b of batteries) moduleState(state, b.id).storedKwh = capacity > 0 ? (result.stored * b.capacity) / capacity : 0;
  }

  // Module statuses.
  for (const m of station.modules) {
    const s = moduleState(state, m.id);
    const before = s.status;
    const tier = m.def.power.tier;
    s.status = statusOf(s, tripped.has(m.id), result.shed.has(m.id), throttled.has(m.id));
    s.actualDrawKw = running(s.status) ? (demandKw.get(m.id) ?? 0) : 0;
    if (running(before) && s.status === 'shed') events?.emit('moduleShed', { moduleId: m.id, tier });
    if (before === 'shed' && running(s.status)) events?.emit('moduleRestored', { moduleId: m.id, tier });
    if (before !== 'overheated' && s.status === 'overheated') events?.emit('moduleOverheated', { moduleId: m.id, tier });
  }

  state.totals = {
    generationKw: supply,
    loadKw: result.load,
    demandKw: result.demand,
    chargeKw: result.flowIn,
    dischargeKw: result.flowOut,
    curtailedKw: result.curtailed,
    unmetKw: result.unmet,
  };
}

function statusOf(s: PowerModuleState, tripped: boolean, shed: boolean, throttled: boolean): ModuleStatus {
  if (s.outage) return s.outage;
  if (!s.enabled) return 'off';
  if (tripped) return 'overheated';
  if (shed) return 'shed';
  return throttled ? 'throttled' : 'powered';
}

export function setOutage(state: PowerState, id: string, outage: Outage | null): void {
  moduleState(state, id).outage = outage;
}

export function setModuleEnabled(state: PowerState, id: string, enabled: boolean): void {
  moduleState(state, id).enabled = enabled;
}
