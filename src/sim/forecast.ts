// Run a copy of the sim ahead and sum up what happens. Used by build mode's effect preview.
import type { SimCommand, Simulation } from './simulation';

export interface Forecast {
  minutes: number;
  /** Lowest battery fill over the run, 0..1. */
  minCharge: number;
  /** Hottest the coolant loop got, °C. */
  maxLoopC: number;
  highestCo2MmHg: number;
  /** Minutes with any Commercial load shed for power. */
  shedMinutes: number;
  /** Minutes with Commercial loads throttled for heat. */
  throttledMinutes: number;
  /** Minutes with any module tripped by heat. */
  trippedMinutes: number;
  /** Peak solar output, kW. */
  peakGenerationKw: number;
  /** Change in stored water over the run, kg. */
  waterChangeKg: number;
  people: number;
  /** Chance that at least one module fails during the run, 0..1, from wear and temperature. */
  failureChance: number;
}

/**
 * Fork `sim`, apply `change` (if any), and run it `minutes` ahead. Returns null if the change is refused.
 * Nothing fails in the fork (it would share the real sim's dice); failure risk is reported as a chance instead.
 */
export function forecast(sim: Simulation, minutes: number, change?: SimCommand): Forecast | null {
  const f = sim.fork({ failures: false });
  if (change && !f.command(change).ok) return null;
  const start = f.snapshot();
  const out: Forecast = {
    minutes,
    minCharge: start.power.charge,
    maxLoopC: start.thermal.loopC,
    highestCo2MmHg: start.lifeSupport.co2MmHg,
    shedMinutes: 0,
    throttledMinutes: 0,
    trippedMinutes: 0,
    peakGenerationKw: 0,
    waterChangeKg: 0,
    people: start.lifeSupport.people,
    failureChance: 0,
  };
  const exposure0 = f.failureExposure;
  let last = start;
  for (let i = 0; i < minutes; i++) {
    f.tick();
    const s = f.snapshot();
    out.minCharge = Math.min(out.minCharge, s.power.charge);
    out.maxLoopC = Math.max(out.maxLoopC, s.thermal.loopC);
    out.highestCo2MmHg = Math.max(out.highestCo2MmHg, s.lifeSupport.co2MmHg);
    out.peakGenerationKw = Math.max(out.peakGenerationKw, s.power.generationKw);
    if (s.power.shedTiers.commercial) out.shedMinutes++;
    if (s.thermal.throttled) out.throttledMinutes++;
    if (s.modules.some((m) => m.status === 'overheated')) out.trippedMinutes++;
    last = s;
  }
  out.waterChangeKg = last.lifeSupport.waterKg - start.lifeSupport.waterKg;
  out.failureChance = 1 - Math.exp(-(f.failureExposure - exposure0));
  return out;
}
