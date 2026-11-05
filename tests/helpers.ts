import modulesJson from '../src/data/modules.json';
import scenarioJson from '../src/data/scenario.json';
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

/** Tick until the predicate holds, failing after `limit` ticks. */
export function runUntil(sim: Simulation, pred: () => boolean, limit = 1000): void {
  for (let i = 0; i < limit; i++) {
    if (pred()) return;
    sim.tick();
  }
  throw new Error(`Condition not reached within ${limit} ticks`);
}
