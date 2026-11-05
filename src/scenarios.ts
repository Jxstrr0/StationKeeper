// Every scenario the game ships with, parsed once. The first is the one a brand-new player starts on.
import halyard from './data/scenarios/halyard.json';
import kittiwake from './data/scenarios/kittiwake.json';
import longlightOne from './data/scenarios/longlight-one.json';
import saltglass from './data/scenarios/saltglass.json';
import velvetReach from './data/scenarios/velvet-reach.json';
import { parseScenario } from './sim/data';
import type { ScenarioDef } from './sim/types';

export const SCENARIOS: readonly ScenarioDef[] = [longlightOne, kittiwake, halyard, saltglass, velvetReach].map(parseScenario);

const ids = new Set<string>();
for (const s of SCENARIOS) {
  if (ids.has(s.id)) throw new Error(`Two scenarios share the id "${s.id}"`);
  ids.add(s.id);
}

export function scenarioById(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
