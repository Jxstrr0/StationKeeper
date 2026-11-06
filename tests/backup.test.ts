import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEYS,
  BACKUP_PREFIX,
  backupDue,
  backupFileName,
  backupSummary,
  makeBackupCode,
  readBackupCode,
  readStoredKeys,
  REMIND_AFTER_MS,
  writeBackup,
} from '../src/backup';

/** A small in-memory localStorage, optionally refusing one write (the nth, from 0), as a full store would. */
function fakeStore(initial: Record<string, string> = {}, failAt = -1) {
  const map = new Map(Object.entries(initial));
  let writes = 0;
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (writes++ === failAt) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
}

const stored = {
  'stationkeeper.save': '{"version":1,"name":"Ünïcode ☄ station"}',
  'stationkeeper.slot.2': '{"app":"stationkeeper"}',
  'stationkeeper.settings': '{"volume":0.5}',
  'stationkeeper.nextScenario': 'not backed up',
  'someothergame.save': 'never touched',
};

describe('backup codes', () => {
  it('round-trips only the game’s own keys', () => {
    const keys = readStoredKeys(fakeStore(stored));
    expect(Object.keys(keys).sort()).toEqual(['stationkeeper.save', 'stationkeeper.settings', 'stationkeeper.slot.2']);
    const code = makeBackupCode(keys, 1_800_000_000_000);
    expect(code.startsWith(BACKUP_PREFIX)).toBe(true);
    const read = readBackupCode(code);
    expect(read.ok && read.body.keys).toEqual(keys);
    expect(read.ok && read.body.at).toBe(1_800_000_000_000);
  });

  it('tolerates whitespace and line breaks from a file or a paste', () => {
    const code = makeBackupCode({ 'stationkeeper.save': '{}' }, 1);
    const wrapped = `  ${code.slice(0, 10)}\n${code.slice(10)}\r\n\n`;
    expect(readBackupCode(wrapped).ok).toBe(true);
  });

  it('refuses codes that are cut off, changed, or not ours', () => {
    const code = makeBackupCode(readStoredKeys(fakeStore(stored)), 1);
    expect(readBackupCode(code.slice(0, -3))).toEqual({ ok: false, reason: 'That backup is damaged or cut off' });
    const flipped = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
    expect(readBackupCode(flipped).ok).toBe(false);
    expect(readBackupCode('PEW1:abcdef')).toEqual({ ok: false, reason: "That isn't a Station Keeper backup" });
    expect(readBackupCode('{"app":"stationkeeper"}').ok).toBe(false);
    expect(readBackupCode('').ok).toBe(false);
    expect(readBackupCode(`${BACKUP_PREFIX}abc`).ok).toBe(false);
  });

  it('names its file by the local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('station-keeper-backup-2026-01-05.txt');
  });

  it('sums up what it holds', () => {
    const read = readBackupCode(makeBackupCode(readStoredKeys(fakeStore(stored)), 1));
    expect(read.ok && backupSummary(read.body, '6 Nov 2026')).toBe(
      'Backup from 6 Nov 2026: the station in play and 1 slot. Restoring replaces every station on this device.',
    );
  });
});

describe('restoring a backup', () => {
  it('replaces every game key at once and leaves other games alone', () => {
    const store = fakeStore({ ...stored, 'stationkeeper.slot.1': 'old slot', 'stationkeeper.records': 'old records' });
    const read = readBackupCode(makeBackupCode({ 'stationkeeper.save': 'new save' }, 1));
    expect(read.ok && writeBackup(store, read.body)).toBe(true);
    expect(store.map.get('stationkeeper.save')).toBe('new save');
    for (const k of BACKUP_KEYS.filter((k) => k !== 'stationkeeper.save')) expect(store.map.has(k)).toBe(false);
    expect(store.map.get('someothergame.save')).toBe('never touched');
    expect(store.map.get('stationkeeper.nextScenario')).toBe('not backed up');
  });

  it('puts everything back if the browser refuses part way', () => {
    const before = { ...stored, 'stationkeeper.slot.1': 'old slot' };
    const store = fakeStore(before, 1);
    const read = readBackupCode(makeBackupCode({ 'stationkeeper.save': 'a', 'stationkeeper.slot.1': 'b', 'stationkeeper.records': 'c' }, 1));
    expect(read.ok && writeBackup(store, read.body)).toBe(false);
    expect(Object.fromEntries(store.map)).toEqual(before);
  });
});

describe('the backup reminder', () => {
  const now = 2_000_000_000_000;
  it('waits for progress, then asks if never backed up or 14 days on', () => {
    expect(backupDue(false, null, now)).toBe(false);
    expect(backupDue(true, null, now)).toBe(true);
    expect(backupDue(true, now - REMIND_AFTER_MS + 1000, now)).toBe(false);
    expect(backupDue(true, now - REMIND_AFTER_MS, now)).toBe(true);
  });
});
