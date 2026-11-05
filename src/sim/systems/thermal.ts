// Thermal system: every watt a module draws ends up as heat in one shared coolant loop.
// Radiators reject that heat to space, better in Earth's shadow than in sunlight. When the loop runs
// hot, Commercial loads throttle; hotter still, tiers trip offline (Commercial, then Essential, then
// Critical). Trips feed back into the power system on the next tick, so heat and power cascade.
import type { EventBus, SimEvents } from '../events';
import type { Station } from '../station';
import type { ModuleDef, TempBand, ThermalConfig, Tier } from '../types';
import type { PowerState } from './power';

export interface ThermalModuleState {
  tempC: number;
  heatKw: number;
  rejectKw: number;
}

export interface ThermalTotals {
  heatKw: number;
  rejectKw: number;
  capacityKw: number;
}

export interface ThermalState {
  loopC: number;
  modules: Map<string, ThermalModuleState>;
  /** Commercial loads run slow while true. */
  throttled: boolean;
  /** Tiers tripped offline by heat. */
  tripped: Record<Tier, boolean>;
  totals: ThermalTotals;
}

/** What the power system needs to know about heat when it decides who runs. */
export interface ThermalLimits {
  throttled: boolean;
  throttleFactor: number;
  tripped: Readonly<Record<Tier, boolean>>;
}

export function createThermalState(station: Station, cfg: ThermalConfig): ThermalState {
  const modules = new Map<string, ThermalModuleState>();
  for (const m of station.modules) modules.set(m.id, { tempC: cfg.initialC, heatKw: 0, rejectKw: 0 });
  return {
    loopC: cfg.initialC,
    modules,
    throttled: false,
    tripped: { critical: false, essential: false, commercial: false },
    totals: { heatKw: 0, rejectKw: 0, capacityKw: 0 },
  };
}

/** Modules that move heat out of the loop. Tripping these would only make things worse, so heat never trips them. */
export function isCooler(def: ModuleDef): boolean {
  return (def.thermal.rejectKw ?? 0) > 0;
}

/** Heat a radiator can reject right now, kW. Sunlight 1 gives `rejectKw × sunlitFactor`; eclipse gives full `rejectKw`. */
export function radiatorCapacity(def: ModuleDef, sunlight: number): number {
  const full = def.thermal.rejectKw ?? 0;
  const f = def.thermal.sunlitFactor ?? 1;
  return full * (f + (1 - f) * (1 - sunlight));
}

/** Trip above `band.above`, clear below `band.below`. */
function hysteresis(active: boolean, value: number, band: TempBand): boolean {
  if (!active && value > band.above) return true;
  if (active && value < band.below) return false;
  return active;
}

function moduleState(state: ThermalState, id: string): ThermalModuleState {
  const s = state.modules.get(id);
  if (!s) throw new Error(`No thermal state for module "${id}"`);
  return s;
}

export interface ThermalStepOptions {
  sunlight: number;
  cfg: ThermalConfig;
  dtHours: number;
  /** When false, refresh heat and rejection figures but leave temperatures and trips alone. */
  commit?: boolean;
  events?: EventBus<SimEvents>;
}

export function stepThermal(state: ThermalState, station: Station, power: PowerState, opts: ThermalStepOptions): void {
  const { sunlight, cfg, dtHours, events } = opts;
  const commit = opts.commit ?? true;

  // Heat in: every kW drawn becomes a kW of heat. Capacity out: radiators whose pumps have power.
  let heatKw = 0;
  let capacityKw = 0;
  for (const m of station.modules) {
    const p = power.modules.get(m.id);
    const t = moduleState(state, m.id);
    t.heatKw = p?.actualDrawKw ?? 0;
    heatKw += t.heatKw;
    const running = p?.status === 'powered' || p?.status === 'throttled';
    t.rejectKw = running ? radiatorCapacity(m.def, sunlight) : 0;
    capacityKw += t.rejectKw;
  }

  // Radiator valves hold the setpoint when they can, and never chill the loop below it.
  const toSetpoint = ((state.loopC - cfg.setpointC) * cfg.loopKwhPerC) / dtHours;
  const rejectKw = Math.min(capacityKw, Math.max(0, heatKw + toSetpoint));
  for (const m of station.modules) {
    const t = moduleState(state, m.id);
    t.rejectKw = capacityKw > 0 ? (rejectKw * t.rejectKw) / capacityKw : 0;
  }
  state.totals = { heatKw, rejectKw, capacityKw };
  if (!commit) return;

  state.loopC += ((heatKw - rejectKw) * dtHours) / cfg.loopKwhPerC;

  // Each module sits a little above the loop, by how much heat it makes, and follows that target with a lag.
  const follow = 1 - Math.exp(-(dtHours * 60) / Math.max(1e-6, cfg.moduleLagMinutes));
  for (const m of station.modules) {
    const t = moduleState(state, m.id);
    const target = state.loopC + t.heatKw * m.def.thermal.riseCPerKw;
    t.tempC += (target - t.tempC) * follow;
  }

  // Throttle and trip decisions take effect on the power system next tick.
  const wasThrottled = state.throttled;
  state.throttled = hysteresis(state.throttled, state.loopC, cfg.throttle);
  if (state.throttled !== wasThrottled) events?.emit('throttleChanged', { throttled: state.throttled, tempC: state.loopC });

  const before = state.tripped;
  const tripped = {
    critical: hysteresis(before.critical, state.loopC, cfg.trip.critical),
    essential: hysteresis(before.essential, state.loopC, cfg.trip.essential),
    commercial: hysteresis(before.commercial, state.loopC, cfg.trip.commercial),
  };
  // A lower tier never runs while a higher one is tripped.
  if (tripped.critical) tripped.essential = true;
  if (tripped.essential) tripped.commercial = true;
  for (const tier of ['commercial', 'essential', 'critical'] as const) {
    if (tripped[tier] && !before[tier]) events?.emit('overheatTrip', { tier, tempC: state.loopC });
    if (!tripped[tier] && before[tier]) events?.emit('overheatCleared', { tier, tempC: state.loopC });
  }
  state.tripped = tripped;
}

export function thermalLimits(state: ThermalState, cfg: ThermalConfig): ThermalLimits {
  return { throttled: state.throttled, throttleFactor: cfg.throttleFactor, tripped: state.tripped };
}
