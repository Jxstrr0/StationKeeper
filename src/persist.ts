// Keeps the game in the browser's localStorage, so a reload or a closed tab picks up where the player left off.
// Storage can be missing or full (private windows, quota), so every call fails quietly and the game plays on.
import { scenarioById } from './scenarios';
import { SAVE_VERSION, Simulation, type SimSave } from './sim/simulation';
import type { ModuleDef } from './sim/types';

const KEY = 'stationkeeper.save';
/** The scenario picked for the next new game, read once on the reload that starts it. */
const NEXT_KEY = 'stationkeeper.nextScenario';
/** Set before a reload that should go straight into the game (a loaded slot), skipping the title screen. */
const SKIP_TITLE_KEY = 'stationkeeper.skipTitle';

export type LoadResult =
  | { kind: 'none' }
  | { kind: 'loaded'; sim: Simulation }
  /** There was a save but it couldn't be used: another version, or data that no longer fits. */
  | { kind: 'discarded'; reason: string };

/** Shallow shape check; `Simulation.fromSave` catches the rest by throwing. */
function looksLikeSave(x: unknown): x is SimSave {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.version === 'number' &&
    typeof s.scenarioId === 'string' &&
    typeof s.minutes === 'number' &&
    typeof s.rng === 'number' &&
    Array.isArray(s.layout) &&
    Array.isArray(s.deliveries) &&
    ['power', 'thermal', 'life', 'reliability', 'economy'].every((k) => typeof s[k] === 'object' && s[k] !== null)
  );
}

/** A sim from parsed save data. Throws, with a reason, if it isn't a save this version of the game can use. */
export function simFromSave(defs: readonly ModuleDef[], parsed: unknown): Simulation {
  if (!looksLikeSave(parsed)) throw new Error('not a save');
  if (parsed.version !== SAVE_VERSION) throw new Error(`save version ${parsed.version}`);
  const scenario = scenarioById(parsed.scenarioId);
  if (!scenario) throw new Error(`no scenario "${parsed.scenarioId}"`);
  const sim = Simulation.fromSave(defs, scenario, parsed);
  sim.snapshot(); // a save that loads but can't be read is no use either
  return sim;
}

export function loadGame(defs: readonly ModuleDef[]): LoadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { kind: 'none' };
  }
  if (raw === null) return { kind: 'none' };
  try {
    return { kind: 'loaded', sim: simFromSave(defs, JSON.parse(raw)) };
  } catch (err) {
    clearGame();
    return { kind: 'discarded', reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Make `save` the game the next load picks up (a slot or an imported file). Returns false if storage refused. */
export function replaceGame(save: SimSave): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** Returns false if the browser wouldn't store it. */
export function saveGame(sim: Simulation): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(sim.save()));
    return true;
  } catch {
    return false;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, or nothing we can do about it.
  }
}

/** Scrap the current game and start `scenarioId` on the next load. */
export function startNewGame(scenarioId: string): void {
  clearGame();
  try {
    localStorage.setItem(NEXT_KEY, scenarioId);
  } catch {
    // Then the next load starts the first scenario.
  }
}

/** The scenario chosen for this new game, if any. Cleared as it's read. */
export function takeChosenScenario(): string | null {
  try {
    const id = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
    return id;
  } catch {
    return null;
  }
}

/** The next load goes straight into the game. */
export function skipTitleOnce(): void {
  try {
    localStorage.setItem(SKIP_TITLE_KEY, '1');
  } catch {
    // Then the title shows, which is only one more tap.
  }
}

/** Whether this load should skip the title. Cleared as it's read. */
export function takeSkipTitle(): boolean {
  try {
    const on = localStorage.getItem(SKIP_TITLE_KEY) === '1';
    localStorage.removeItem(SKIP_TITLE_KEY);
    return on;
  } catch {
    return false;
  }
}
