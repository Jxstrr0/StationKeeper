import modulesJson from '../src/data/modules.json';
import scenarioJson from '../src/data/scenarios/longlight-one.json';
import { parseModuleDefs, parseScenario } from '../src/sim/data';
import { Simulation, type SimOptions } from '../src/sim/simulation';
import type { ModuleDef, ScenarioDef } from '../src/sim/types';

export const defs = parseModuleDefs(modulesJson);
export const baseScenario = parseScenario(scenarioJson);

/**
 * A sim from the shipped data, optionally patched. Failures are off by default so tests of other systems
 * aren't interrupted by a dice roll; reliability tests turn them on.
 */
export function makeSim(
  patch: (s: ScenarioDef) => void = () => {},
  patchDefs: (d: ModuleDef[]) => void = () => {},
  options: SimOptions = { failures: false },
): Simulation {
  const scenario = structuredClone(baseScenario);
  const moduleDefs = structuredClone(defs);
  patch(scenario);
  patchDefs(moduleDefs);
  return new Simulation(moduleDefs, scenario, scenario.layout, options);
}

/** Everyone works at exactly full speed whatever their morale: for tests that count work-hours. Pace has its own tests. */
export function flatPace(s: ScenarioDef): void {
  s.crew.needs.morale.pace = { ...s.crew.needs.morale.pace, floor: 1, best: 1 };
}

/** Fares stay at the base rate whatever the reviews: for tests that count guest income. Reviews have their own tests. */
export function flatFares(s: ScenarioDef): void {
  s.guests.fare = { worst: 1, best: 1 };
}

/** Tick until the predicate holds, failing after `limit` ticks. */
export function runUntil(sim: Simulation, pred: () => boolean, limit = 1000): void {
  for (let i = 0; i < limit; i++) {
    if (pred()) return;
    sim.tick();
  }
  throw new Error(`Condition not reached within ${limit} ticks`);
}
