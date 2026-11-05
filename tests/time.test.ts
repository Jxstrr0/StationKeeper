import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';
import { Clock } from '../src/sim/time';

describe('clock', () => {
  it('runs no ticks while paused', () => {
    const c = new Clock();
    c.setSpeed(0);
    expect(c.advance(10)).toBe(0);
  });

  it('runs speed × seconds ticks and keeps the remainder', () => {
    const c = new Clock();
    c.setSpeed(5);
    expect(c.advance(0.5)).toBe(2);
    expect(c.alpha).toBeCloseTo(0.5);
    expect(c.advance(0.1)).toBe(1);
  });

  it('caps ticks after a long stall', () => {
    const c = new Clock();
    c.setSpeed(20);
    expect(c.advance(3600)).toBe(240);
  });

  it('toggles pause back to the previous speed', () => {
    const c = new Clock();
    c.setSpeed(20);
    c.togglePause();
    expect(c.speed).toBe(0);
    c.togglePause();
    expect(c.speed).toBe(20);
  });
});

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
