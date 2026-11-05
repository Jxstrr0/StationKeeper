// Power system: solar generation, batteries, and tiered loads on one shared network.
import type { EventBus, SimEvents } from '../events';
import { solveNetwork, type NetworkLoad } from '../network';
import type { Station } from '../station';
import type { ModuleStatus, Tier, TierThreshold } from '../types';

export interface PowerModuleState {
  enabled: boolean;
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
    if (cap <= 0 || !s.enabled) continue;
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
  events?: EventBus<SimEvents>;
}

export function stepPower(state: PowerState, station: Station, opts: PowerStepOptions): void {
  const { sunlight, thresholds, dtHours, events } = opts;
  const commitEnergy = opts.commitEnergy ?? true;

  let supply = 0;
  let capacity = 0;
  let stored = 0;
  let maxIn = 0;
  let maxOut = 0;
  const loads: NetworkLoad[] = [];
  const batteries: { id: string; capacity: number }[] = [];

  for (const m of station.modules) {
    const p = m.def.power;
    const s = moduleState(state, m.id);
    s.generationKw = s.enabled ? (p.generationKw ?? 0) * sunlight : 0;
    supply += s.generationKw;
    if (s.enabled && (p.storageKwh ?? 0) > 0) {
      capacity += p.storageKwh ?? 0;
      stored += s.storedKwh;
      maxIn += p.maxChargeKw ?? 0;
      maxOut += p.maxDischargeKw ?? 0;
      batteries.push({ id: m.id, capacity: p.storageKwh ?? 0 });
    }
    if (s.enabled && p.drawKw > 0) loads.push({ id: m.id, demand: p.drawKw, tier: p.tier });
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
    s.status = !s.enabled ? 'off' : result.shed.has(m.id) ? 'shed' : 'powered';
    s.actualDrawKw = s.status === 'powered' ? m.def.power.drawKw : 0;
    if (before === 'powered' && s.status === 'shed') events?.emit('moduleShed', { moduleId: m.id, tier: m.def.power.tier });
    if (before === 'shed' && s.status === 'powered') events?.emit('moduleRestored', { moduleId: m.id, tier: m.def.power.tier });
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

export function setModuleEnabled(state: PowerState, id: string, enabled: boolean): void {
  moduleState(state, id).enabled = enabled;
}
