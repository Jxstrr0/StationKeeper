import { describe, expect, it } from 'vitest';
import { parseRecords, recordFor, withLoss, withWin } from '../src/records';
import { durationText, recordLine } from '../src/ui/goalText';

describe('scenario records', () => {
  it('counts wins, keeps the fastest, and counts losses', () => {
    let r = withWin({}, 'halyard', 9000);
    r = withWin(r, 'halyard', 12000);
    r = withLoss(r, 'halyard', 'evacuated');
    r = withWin(r, 'halyard', 8000);
    expect(recordFor(r, 'halyard')).toEqual({ wins: 3, bestMinutes: 8000, losses: 1, lastLoss: 'evacuated' });
    expect(recordFor(r, 'kittiwake')).toEqual({ wins: 0, bestMinutes: null, losses: 0, lastLoss: null });
  });

  it('leaves the record it was given alone', () => {
    const before = withWin({}, 'a', 100);
    const after = withLoss(before, 'a', 'bankrupt');
    expect(recordFor(before, 'a').losses).toBe(0);
    expect(recordFor(after, 'a').losses).toBe(1);
  });

  it('survives whatever is in storage', () => {
    expect(parseRecords(null)).toEqual({});
    expect(parseRecords('not json')).toEqual({});
    expect(parseRecords('[1,2]')).toEqual({});
    expect(parseRecords(JSON.stringify({ a: { wins: 2, bestMinutes: 90, losses: -1, lastLoss: 'abducted' }, b: 'junk' }))).toEqual({
      a: { wins: 2, bestMinutes: 90, losses: 0, lastLoss: null },
    });
    const real = withLoss(withWin({}, 'x', 5000), 'x', 'replaced');
    expect(parseRecords(JSON.stringify(real))).toEqual(real);
  });

  it('reads as a line for the scenario picker', () => {
    expect(recordLine(recordFor({}, 'x'))).toBeNull();
    expect(recordLine({ wins: 1, bestMinutes: 3 * 1440 + 4 * 60, losses: 0, lastLoss: null })).toBe('Won once, fastest in 3 d 4 h');
    expect(recordLine({ wins: 2, bestMinutes: 600, losses: 1, lastLoss: 'bankrupt' })).toBe('Won twice, fastest in 10 h · 1 station lost');
    expect(recordLine({ wins: 0, bestMinutes: null, losses: 3, lastLoss: 'evacuated' })).toBe('Not won yet · 3 stations lost');
    expect(durationText(2 * 1440)).toBe('2 d');
    expect(durationText(95)).toBe('1 h 35 min');
  });
});
