// Three manual save slots beside the autosave, and the same thing as a file for moving a station between devices.
// Each slot holds the whole save plus a few lines about it (and a small picture), so the list reads without loading a sim.
import type { SimSave } from './sim/simulation';

export const SLOT_COUNT = 3;
export const slotKey = (i: number) => `stationkeeper.slot.${i + 1}`;
/** Marks an exported file as ours. Bumped only if the wrapper itself changes; the save inside has its own version. */
const FILE_FORMAT = 1;

export interface SlotMeta {
  scenarioId: string;
  scenarioName: string;
  /** In-game time. */
  timeMs: number;
  minutes: number;
  cash: number;
  modules: number;
  ended: boolean;
  /** Real time it was saved. */
  savedAtMs: number;
  /** A small JPEG data URL, or null if the browser wouldn't draw one. */
  thumb: string | null;
}

export interface SlotFile {
  app: 'stationkeeper';
  format: number;
  meta: SlotMeta;
  save: SimSave;
}

/** What a slot shows: empty, a save, or a save this version can't load (it's kept until the player deletes it). */
export type Slot = { kind: 'empty' } | { kind: 'ok'; file: SlotFile } | { kind: 'stale'; meta: SlotMeta | null };

function looksLikeMeta(x: unknown): x is SlotMeta {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.scenarioId === 'string' &&
    typeof m.scenarioName === 'string' &&
    ['timeMs', 'minutes', 'cash', 'modules', 'savedAtMs'].every((k) => typeof m[k] === 'number' && Number.isFinite(m[k])) &&
    typeof m.ended === 'boolean' &&
    (m.thumb === null || typeof m.thumb === 'string')
  );
}

export function makeSlotFile(meta: SlotMeta, save: SimSave): SlotFile {
  return { app: 'stationkeeper', format: FILE_FORMAT, meta, save };
}

/**
 * A slot or an exported file, read back. `version` is the save version this build of the game reads: anything else
 * is stale. The save's own contents are checked when it's loaded, not here.
 */
export function parseSlotFile(raw: string | null, version: number): Slot {
  if (raw === null) return { kind: 'empty' };
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return { kind: 'stale', meta: null };
  }
  if (typeof x !== 'object' || x === null) return { kind: 'stale', meta: null };
  const f = x as Record<string, unknown>;
  const meta = looksLikeMeta(f.meta) ? f.meta : null;
  const save = f.save as Record<string, unknown> | null | undefined;
  if (f.app !== 'stationkeeper' || !meta || typeof save !== 'object' || save === null || save.version !== version) return { kind: 'stale', meta };
  return { kind: 'ok', file: { app: 'stationkeeper', format: typeof f.format === 'number' ? f.format : FILE_FORMAT, meta, save: save as unknown as SimSave } };
}

/** An imported file: one of our exports, or a bare save (the autosave's own format). */
export function parseImport(text: string, version: number): { ok: true; save: SimSave } | { ok: false; reason: string } {
  let x: unknown;
  try {
    x = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file isn't a Station Keeper save" };
  }
  if (typeof x !== 'object' || x === null) return { ok: false, reason: "That file isn't a Station Keeper save" };
  const f = x as Record<string, unknown>;
  const save = (f.app === 'stationkeeper' ? f.save : f) as Record<string, unknown> | null | undefined;
  if (typeof save !== 'object' || save === null || typeof save.version !== 'number' || typeof save.scenarioId !== 'string') {
    return { ok: false, reason: "That file isn't a Station Keeper save" };
  }
  if (save.version !== version) return { ok: false, reason: 'That save is from another version of the game and no longer loads' };
  return { ok: true, save: save as unknown as SimSave };
}

export function readSlot(i: number, version: number): Slot {
  try {
    return parseSlotFile(localStorage.getItem(slotKey(i)), version);
  } catch {
    return { kind: 'empty' };
  }
}

export function readSlots(version: number): Slot[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => readSlot(i, version));
}

/** Returns false if the browser wouldn't store it (private window, or full). */
export function writeSlot(i: number, file: SlotFile): boolean {
  try {
    localStorage.setItem(slotKey(i), JSON.stringify(file));
    return true;
  } catch {
    // A full store: try once more without the picture, which is most of the bytes.
    try {
      localStorage.setItem(slotKey(i), JSON.stringify({ ...file, meta: { ...file.meta, thumb: null } }));
      return true;
    } catch {
      return false;
    }
  }
}

export function clearSlot(i: number): void {
  try {
    localStorage.removeItem(slotKey(i));
  } catch {
    // Nothing we can do.
  }
}
