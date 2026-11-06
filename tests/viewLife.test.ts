import { describe, expect, it } from 'vitest';
import {
  approachOffset,
  approachPlan,
  approachProgress,
  emberPulse,
  failFlicker,
  guestOccupancy,
  scatterOrder,
  wearLook,
  wearLookInto,
  windowLights,
} from '../src/view/lifeMath';

describe('wearLook', () => {
  it('is clean when new and grimes up with wear', () => {
    expect(wearLook(0, 'powered')).toEqual({ grime: 0, scorch: 0, ember: 0 });
    const mid = wearLook(0.5, 'powered');
    const worn = wearLook(0.9, 'powered');
    expect(mid.grime).toBeGreaterThan(0);
    expect(worn.grime).toBeGreaterThan(mid.grime);
    expect(worn.grime).toBeCloseTo(1);
  });

  it('only scorches past half wear', () => {
    expect(wearLook(0.45, 'powered').scorch).toBe(0);
    expect(wearLook(0.8, 'powered').scorch).toBeGreaterThan(0);
    expect(wearLook(1, 'powered').scorch).toBeLessThan(1);
  });

  it('shows a failed module clearly, even when nearly new', () => {
    const l = wearLook(0.05, 'failed');
    expect(l.scorch).toBeGreaterThan(0.7);
    expect(l.ember).toBe(1);
    expect(l.grime).toBeGreaterThanOrEqual(0.6);
  });

  it('clamps bad input and writes in place', () => {
    expect(wearLook(-1, 'off').grime).toBe(0);
    expect(wearLook(Number.NaN, 'off').grime).toBe(0);
    expect(wearLook(4, 'off')).toEqual(wearLook(1, 'off'));
    const out = { grime: 9, scorch: 9, ember: 9 };
    expect(wearLookInto(out, 0.9, 'failed')).toBe(out);
    expect(out).toEqual(wearLook(0.9, 'failed'));
  });
});

describe('motion', () => {
  it('holds the ember steady and never flickers with reduced motion', () => {
    for (let t = 0; t < 20; t += 0.37) {
      expect(emberPulse(t, 0.3, true)).toBe(0.7);
      expect(failFlicker(t, 0.3, true)).toBe(false);
      const p = emberPulse(t, 0.3, false);
      expect(p).toBeGreaterThanOrEqual(0.45);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('flickers now and then, not constantly', () => {
    let on = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) if (failFlicker(i / 14, 0.5, false)) on++;
    expect(on / n).toBeGreaterThan(0.01);
    expect(on / n).toBeLessThan(0.15);
  });
});

describe('cargo approach', () => {
  it('appears for the last hour only', () => {
    expect(approachProgress(3)).toBeNull();
    expect(approachProgress(1.01)).toBeNull();
    expect(approachProgress(1)).toBe(0);
    expect(approachProgress(0.5)).toBeCloseTo(0.5);
    expect(approachProgress(0)).toBe(1);
    expect(approachProgress(-0.1)).toBe(1);
    expect(approachProgress(Number.NaN)).toBeNull();
  });

  it('stops just past where the module will sit', () => {
    const plan = approachPlan(0, 0, 10, -46);
    expect(plan.endAlong).toBeCloseTo(13);
    expect(plan.startAlong).toBeCloseTo(68);
    const end = approachOffset(1, plan);
    expect(end.along).toBeCloseTo(plan.endAlong);
    expect(end.side).toBeCloseTo(0);
    const start = approachOffset(0, plan);
    expect(start.along).toBeCloseTo(plan.startAlong);
    expect(start.side).toBeCloseTo(plan.lateral);
  });

  it('closes in steadily and slows at the end', () => {
    const plan = approachPlan(0, 1, 5, -46);
    let prev = Infinity;
    let prevStep = Infinity;
    for (let i = 1; i <= 10; i++) {
      const a = approachOffset(i / 10, plan).along;
      expect(a).toBeLessThan(prev);
      if (prev !== Infinity) {
        expect(prev - a).toBeLessThan(prevStep + 1e-9);
        prevStep = prev - a;
      }
      prev = a;
    }
  });

  it('never starts below the floor for a port facing Earth', () => {
    const floor = -46;
    const plan = approachPlan(-3, -1, 6, floor);
    const start = -3 - plan.startAlong;
    expect(start).toBeGreaterThanOrEqual(floor - 1e-9);
    expect(plan.startAlong).toBeGreaterThan(plan.endAlong);
    expect(plan.lateral).toBeGreaterThan(approachPlan(0, 1, 6, floor).lateral);
  });
});

describe('windows', () => {
  it('scatters every pane exactly once, the same way each time', () => {
    const o = scatterOrder(12, 12);
    expect([...o].sort((a, b) => a - b)).toEqual([...Array(12).keys()]);
    expect(scatterOrder(12, 12)).toEqual(o);
    expect(o).not.toEqual([...Array(12).keys()]);
    expect(scatterOrder(0)).toEqual([]);
  });

  it('lights panes by occupancy, keeps one lit when empty, and draws all dark when unpowered', () => {
    expect(windowLights(12, 1, true).shown).toBe(12);
    expect(windowLights(12, 0.5, true).shown).toBe(6);
    expect(windowLights(12, 0, true).shown).toBe(1);
    expect(windowLights(12, 1, true).intensity).toBeGreaterThan(windowLights(12, 0.25, true).intensity);
    expect(windowLights(12, 1, false)).toEqual({ shown: 12, intensity: 0.02 });
    expect(windowLights(0, 1, true).shown).toBe(0);
  });

  it('reads occupancy from the guest snapshot', () => {
    expect(guestOccupancy(8, 2)).toBe(0.25);
    expect(guestOccupancy(0, 0)).toBe(1);
    expect(guestOccupancy(4, 9)).toBe(1);
  });
});
