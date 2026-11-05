import { describe, expect, it } from 'vitest';
import { createOrbit, minutesToTransition, orbitSnapshot, phaseAt, sunlightAt } from '../src/sim/orbit';

describe('orbit', () => {
  const orbit = createOrbit({ altitudeKm: 420, betaDeg: 0, startPhaseDeg: 0 });

  it('has a roughly 90 minute period at 420 km', () => {
    expect(orbit.periodMinutes).toBeGreaterThan(90);
    expect(orbit.periodMinutes).toBeLessThan(95);
  });

  it('spends about a third of each orbit in shadow', () => {
    let dark = 0;
    const steps = 10_000;
    for (let i = 0; i < steps; i++) {
      if (sunlightAt(orbit, (i / steps) * Math.PI * 2) < 0.5) dark++;
    }
    const fraction = dark / steps;
    expect(fraction).toBeGreaterThan(0.3);
    expect(fraction).toBeLessThan(0.42);
  });

  it('is sunlit at orbital noon and dark at orbital midnight', () => {
    expect(sunlightAt(orbit, 0)).toBe(1);
    expect(sunlightAt(orbit, Math.PI)).toBe(0);
  });

  it('a high beta angle removes the eclipse', () => {
    const highBeta = createOrbit({ altitudeKm: 420, betaDeg: 75, startPhaseDeg: 0 });
    expect(highBeta.eclipseHalfAngle).toBe(0);
    expect(minutesToTransition(highBeta, 1)).toBe(Infinity);
  });

  it('counts down to the next transition consistently', () => {
    const snap = orbitSnapshot(orbit, 10);
    const later = phaseAt(orbit, 10 + snap.minutesToTransition + 0.01);
    expect(orbitSnapshot(orbit, 10 + snap.minutesToTransition + 0.01).sunlit).toBe(!snap.sunlit);
    expect(later).toBeGreaterThan(0);
  });

  it('sun direction is a unit vector', () => {
    const [x, y, z] = orbitSnapshot(orbit, 33).sunDirection;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
  });
});
