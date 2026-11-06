// A backup of the whole game on this device as one line of text: the station in play, the three slots, settings,
// records and the company. It can be copied as a code or kept as a small text file, and restored on any browser.
//
// The shape: "SK1:" + base64url(UTF-8 JSON) + a 6-character checksum. Restoring checks the whole code before anything
// is written, then replaces every key at once (and puts the old ones back if the browser refuses part way).
import { COMPANY_KEY, MODE_KEY } from './company/store';
import { SAVE_KEY } from './persist';
import { RECORDS_KEY } from './records';
import { SETTINGS_KEY } from './settings';
import { SLOT_COUNT, slotKey } from './slots';

export const BACKUP_PREFIX = 'SK1:';
const CHECK_LEN = 6;

/** Every key a backup carries. Only these are ever read or written; the one-load flags (next scenario, skip title) are left out. */
export const BACKUP_KEYS: readonly string[] = [SAVE_KEY, ...Array.from({ length: SLOT_COUNT }, (_, i) => slotKey(i)), SETTINGS_KEY, RECORDS_KEY, COMPANY_KEY, MODE_KEY];

export interface BackupBody {
  app: 'stationkeeper';
  v: 1;
  /** Real time the backup was made. */
  at: number;
  /** Key to stored text, for the keys that held something. */
  keys: Record<string, string>;
}

type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** FNV-1a over the text, as 6 base-36 characters: enough to catch a code that was cut off or mistyped. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(CHECK_LEN, '0').slice(-CHECK_LEN);
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  // In chunks, so a big save doesn't overflow the argument list.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** What the backup keys hold right now. Missing or unreadable keys are left out. */
export function readStoredKeys(store: ReadStore): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of BACKUP_KEYS) {
    try {
      const v = store.getItem(key);
      if (v !== null) out[key] = v;
    } catch {
      // Storage blocked: back up what we can.
    }
  }
  return out;
}

export function makeBackupCode(keys: Record<string, string>, atMs: number): string {
  const body: BackupBody = { app: 'stationkeeper', v: 1, at: atMs, keys: {} };
  for (const key of BACKUP_KEYS) if (typeof keys[key] === 'string') body.keys[key] = keys[key];
  const data = toBase64Url(JSON.stringify(body));
  return `${BACKUP_PREFIX}${data}${checksum(data)}`;
}

export type BackupRead = { ok: true; body: BackupBody } | { ok: false; reason: string };

const NOT_OURS = "That isn't a Station Keeper backup";
const DAMAGED = 'That backup is damaged or cut off';

/** A pasted code or a backup file's text, checked from end to end. Whitespace and line breaks are ignored. */
export function readBackupCode(text: string): BackupRead {
  const code = text.replace(/\s+/g, '');
  if (!code.startsWith(BACKUP_PREFIX)) return { ok: false, reason: NOT_OURS };
  const rest = code.slice(BACKUP_PREFIX.length);
  if (rest.length <= CHECK_LEN) return { ok: false, reason: DAMAGED };
  const data = rest.slice(0, -CHECK_LEN);
  if (!/^[A-Za-z0-9_-]+$/.test(data) || checksum(data) !== rest.slice(-CHECK_LEN)) return { ok: false, reason: DAMAGED };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(data));
  } catch {
    return { ok: false, reason: DAMAGED };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: NOT_OURS };
  const b = parsed as Record<string, unknown>;
  if (b.app !== 'stationkeeper') return { ok: false, reason: NOT_OURS };
  if (b.v !== 1) return { ok: false, reason: 'That backup is from a newer version of the game' };
  if (typeof b.at !== 'number' || !Number.isFinite(b.at) || typeof b.keys !== 'object' || b.keys === null || Array.isArray(b.keys)) {
    return { ok: false, reason: DAMAGED };
  }
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.keys as Record<string, unknown>)) {
    if (!BACKUP_KEYS.includes(k) || typeof v !== 'string') return { ok: false, reason: DAMAGED };
    keys[k] = v;
  }
  return { ok: true, body: { app: 'stationkeeper', v: 1, at: b.at, keys } };
}

/**
 * Replace every backup key with the backup's (removing the ones it doesn't have), all or nothing: if the browser
 * refuses a write, the keys go back to how they were. Returns false then.
 */
export function writeBackup(store: WriteStore, body: BackupBody): boolean {
  const before = new Map<string, string | null>();
  try {
    for (const key of BACKUP_KEYS) before.set(key, store.getItem(key));
  } catch {
    return false;
  }
  try {
    for (const key of BACKUP_KEYS) {
      const v = body.keys[key];
      if (v === undefined) store.removeItem(key);
      else store.setItem(key, v);
    }
    return true;
  } catch {
    // Clear first to free the space, then put the old values back.
    for (const key of before.keys()) {
      try {
        store.removeItem(key);
      } catch {
        // Nothing more we can do.
      }
    }
    for (const [key, v] of before) {
      try {
        if (v !== null) store.setItem(key, v);
      } catch {
        // Nothing more we can do.
      }
    }
    return false;
  }
}

/** One line on what a backup holds, for the confirm step. */
export function backupSummary(body: BackupBody, dateText: string): string {
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => slotKey(i)).filter((k) => body.keys[k] !== undefined).length;
  const parts: string[] = [];
  if (body.keys[SAVE_KEY] !== undefined) parts.push('the station in play');
  if (slots > 0) parts.push(slots === 1 ? '1 slot' : `${slots} slots`);
  if (body.keys[COMPANY_KEY] !== undefined) parts.push('a company');
  const held = parts.length === 0 ? 'no stations' : parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
  return `Backup from ${dateText}: ${held}. Restoring replaces every station on this device.`;
}

/** The backup file's name, by the player's local date. */
export function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `station-keeper-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.txt`;
}

export const REMIND_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/** Whether to nudge the player to back up: they have something worth keeping and no backup, or none for 14 days. */
export function backupDue(hasProgress: boolean, lastBackupMs: number | null, nowMs: number): boolean {
  if (!hasProgress) return false;
  return lastBackupMs === null || nowMs - lastBackupMs >= REMIND_AFTER_MS;
}
