// A record of how each scenario has gone: how often it's been won, the fastest win, and how many stations were lost.
// Kept in localStorage beside the save, and outlives it: starting a new station never clears the record.
import type { Outcome } from './sim/types';

const KEY = 'stationkeeper.records';

export interface ScenarioRecord {
  wins: number;
  /** In-game minutes to the fastest win, or null if never won. */
  bestMinutes: number | null;
  losses: number;
  /** How the most recent loss ended. */
  lastLoss: Outcome | null;
}

export type Records = Readonly<Record<string, ScenarioRecord>>;

const EMPTY: ScenarioRecord = { wins: 0, bestMinutes: null, losses: 0, lastLoss: null };
const OUTCOMES: readonly Outcome[] = ['bankrupt', 'evacuated', 'replaced'];

export function recordFor(records: Records, id: string): ScenarioRecord {
  return records[id] ?? EMPTY;
}

export function withWin(records: Records, id: string, minutes: number): Records {
  const r = recordFor(records, id);
  const best = r.bestMinutes === null ? minutes : Math.min(r.bestMinutes, minutes);
  return { ...records, [id]: { ...r, wins: r.wins + 1, bestMinutes: best } };
}

export function withLoss(records: Records, id: string, outcome: Outcome): Records {
  const r = recordFor(records, id);
  return { ...records, [id]: { ...r, losses: r.losses + 1, lastLoss: outcome } };
}

const count = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : 0);

/** Whatever is stored, cleaned up: unknown fields dropped, bad values zeroed. Never throws. */
export function parseRecords(raw: string | null): Records {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const out: Record<string, ScenarioRecord> = {};
  for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    const best = typeof r.bestMinutes === 'number' && Number.isFinite(r.bestMinutes) && r.bestMinutes >= 0 ? r.bestMinutes : null;
    const lastLoss = OUTCOMES.find((o) => o === r.lastLoss) ?? null;
    out[id] = { wins: count(r.wins), bestMinutes: best, losses: count(r.losses), lastLoss };
  }
  return out;
}

export function loadRecords(): Records {
  try {
    return parseRecords(localStorage.getItem(KEY));
  } catch {
    return {};
  }
}

function store(records: Records): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // A record we can't keep is a shame, not a problem.
  }
}

export function recordWin(id: string, minutes: number): Records {
  const next = withWin(loadRecords(), id, minutes);
  store(next);
  return next;
}

export function recordLoss(id: string, outcome: Outcome): Records {
  const next = withLoss(loadRecords(), id, outcome);
  store(next);
  return next;
}
