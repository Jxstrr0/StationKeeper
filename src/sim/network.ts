// Shared resource network solver.
//
// Generic over the resource: power today (kW / kWh), heat and life support later.
// Given supply, a store, and prioritised loads, decide which loads run this tick and how the store moves.
import type { Tier, TierThreshold } from './types';

/** Order in which tiers are dropped when there is not enough to go round. */
export const SHED_ORDER: readonly Tier[] = ['commercial', 'essential', 'critical'];

const EPS = 1e-9;

export interface NetworkLoad {
  id: string;
  /** Rate the load wants, e.g. kW. */
  demand: number;
  tier: Tier;
}

export interface NetworkStore {
  /** Amount held, e.g. kWh. */
  stored: number;
  capacity: number;
  /** Max rate in / out, e.g. kW. */
  maxIn: number;
  maxOut: number;
}

export interface NetworkInput {
  /** Rate available from sources this tick. */
  supply: number;
  store: NetworkStore;
  /** Loads in station order. Within a tier, later loads shed first. */
  loads: readonly NetworkLoad[];
  /** Tier-level shed state from the previous tick (for hysteresis). */
  shedTiers: Readonly<Record<Tier, boolean>>;
  thresholds: Readonly<Record<Tier, TierThreshold>>;
  /** Tick length in hours. */
  dtHours: number;
}

export interface NetworkResult {
  shedTiers: Record<Tier, boolean>;
  served: Set<string>;
  shed: Set<string>;
  /** Total rate requested by all loads. */
  demand: number;
  /** Total rate actually supplied to loads. */
  load: number;
  flowIn: number;
  flowOut: number;
  /** Surplus supply the store could not take. */
  curtailed: number;
  /** Load the network could not cover this tick (brownout). Should be ~0. */
  unmet: number;
  /** Store level after the tick. */
  stored: number;
}

/** Tier shed state with hysteresis on the store's fill fraction. Critical never sheds on thresholds. */
function updateTierShedding(input: NetworkInput): Record<Tier, boolean> {
  const shed = { ...input.shedTiers, critical: false };
  const { stored, capacity } = input.store;
  if (capacity > 0) {
    const fraction = stored / capacity;
    for (const tier of ['commercial', 'essential'] as const) {
      const th = input.thresholds[tier];
      if (!shed[tier] && fraction < th.shedBelow) shed[tier] = true;
      else if (shed[tier] && fraction > th.restoreAbove) shed[tier] = false;
    }
  }
  // A lower tier never runs while a higher one is shed.
  if (shed.essential) shed.commercial = true;
  return shed;
}

export function solveNetwork(input: NetworkInput): NetworkResult {
  const { supply, store, loads, dtHours } = input;
  if (!(dtHours > 0)) throw new Error('solveNetwork needs a positive tick length');

  const shedTiers = updateTierShedding(input);
  const served = new Set<string>();
  const shed = new Set<string>();
  let demand = 0;
  let load = 0;

  for (const l of loads) {
    demand += l.demand;
    if (shedTiers[l.tier]) {
      shed.add(l.id);
    } else {
      served.add(l.id);
      load += l.demand;
    }
  }

  // Hard limit: we cannot draw more than sources plus what the store can give this tick.
  // Shed Commercial, then Essential, newest first within a tier.
  const fromStore = Math.min(store.maxOut, store.stored / dtHours);
  const available = supply + fromStore;
  for (const tier of ['commercial', 'essential'] as const) {
    for (let i = loads.length - 1; i >= 0 && load > available + EPS; i--) {
      const l = loads[i]!;
      if (l.tier !== tier || !served.has(l.id)) continue;
      served.delete(l.id);
      shed.add(l.id);
      load -= l.demand;
    }
  }

  // Critical loads keep running while any energy remains. Only an empty store with short supply drops them.
  if (store.stored <= EPS) {
    for (let i = loads.length - 1; i >= 0 && load > supply + EPS; i--) {
      const l = loads[i]!;
      if (l.tier !== 'critical' || !served.has(l.id)) continue;
      served.delete(l.id);
      shed.add(l.id);
      load -= l.demand;
    }
  }

  let flowIn = 0;
  let flowOut = 0;
  let curtailed = 0;
  let unmet = 0;
  const net = supply - load;
  if (net >= 0) {
    const room = Math.max(0, (store.capacity - store.stored) / dtHours);
    flowIn = Math.min(net, store.maxIn, room);
    curtailed = net - flowIn;
  } else {
    flowOut = Math.min(-net, store.stored / dtHours);
    unmet = -net - flowOut;
  }
  // Snap rounding crumbs to zero so "empty" means exactly empty everywhere.
  const raw = Math.min(store.capacity, Math.max(0, store.stored + (flowIn - flowOut) * dtHours));
  const stored = raw <= EPS ? 0 : raw;

  return { shedTiers, served, shed, demand, load: load - unmet, flowIn, flowOut, curtailed, unmet, stored };
}
