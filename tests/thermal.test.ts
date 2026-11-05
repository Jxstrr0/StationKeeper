import { describe, expect, it } from 'vitest';
import { radiatorCapacity } from '../src/sim/systems/thermal';
import { defs, makeSim, runUntil } from './helpers';

const radiatorDef = defs.find((d) => d.kind === 'radiator')!;

/** Always in sunlight (high beta angle), with weak radiators so the loop cooks. */
function hotSim(rejectKw: number) {
  return makeSim(
    (s) => {
      s.orbit.betaDeg = 80;
    },
    (d) => {
      for (const m of d) if (m.thermal.rejectKw) m.thermal.rejectKw = rejectKw;
    },
  );
}

describe('thermal system', () => {
  it('radiators reject more in eclipse than in sunlight', () => {
    expect(radiatorCapacity(radiatorDef, 0)).toBeCloseTo(radiatorDef.thermal.rejectKw!);
    expect(radiatorCapacity(radiatorDef, 1)).toBeLessThan(radiatorCapacity(radiatorDef, 0));
  });

  it('every kW drawn becomes heat in the loop', () => {
    const sim = makeSim();
    sim.tick();
    const snap = sim.snapshot();
    expect(snap.thermal.heatKw).toBeCloseTo(snap.power.loadKw);
    const sum = snap.modules.reduce((a, m) => a + m.heatKw, 0);
    expect(sum).toBeCloseTo(snap.thermal.heatKw);
  });

  it('the loop warms in sunlight and cools back to the setpoint in eclipse', () => {
    const sim = makeSim((s) => {
      s.orbit.startPhaseDeg = 0; // Orbital noon.
    });
    sim.run(25);
    const warm = sim.snapshot().thermal.loopC;
    expect(warm).toBeGreaterThan(sim.scenario.thermal.setpointC + 1);
    runUntil(sim, () => !sim.snapshot().orbit.sunlit);
    sim.run(30);
    const snap = sim.snapshot();
    expect(snap.thermal.loopC).toBeCloseTo(snap.thermal.setpointC, 1);
    // Valves never chill the loop below its setpoint.
    expect(snap.thermal.rejectKw).toBeLessThanOrEqual(snap.thermal.capacityKw + 1e-9);
  });

  it('throttles Commercial loads when the loop runs warm', () => {
    const sim = hotSim(4);
    runUntil(sim, () => sim.snapshot().thermal.throttled, 200);
    sim.tick();
    const hab = sim.snapshot().modules.find((m) => m.id === 'habitat-1')!;
    expect(hab.status).toBe('throttled');
    expect(hab.actualDrawKw).toBeCloseTo(hab.drawKw * sim.scenario.thermal.throttleFactor);
  });

  it('trips Commercial, then Essential, then Critical as the loop heats, and never trips the radiators', () => {
    const sim = hotSim(4);
    const order: string[] = [];
    sim.events.on('throttleChanged', (e) => e.throttled && order.push('throttle'));
    sim.events.on('overheatTrip', (e) => order.push(e.tier));
    let peak = 0;
    let criticalWasTripped = false;
    for (let i = 0; i < 400; i++) {
      sim.tick();
      const snap = sim.snapshot();
      peak = Math.max(peak, snap.thermal.loopC);
      const status = (id: string) => snap.modules.find((m) => m.id === id)!.status;
      expect(status('radiator-1')).not.toBe('overheated');
      // Critical keeps running until the loop has really cooked. (Trips act on power one tick later.)
      if (!criticalWasTripped) expect(status('core-1')).toBe('powered');
      criticalWasTripped = snap.thermal.tripped.critical;
      if (snap.thermal.tripped.essential) expect(snap.thermal.tripped.commercial).toBe(true);
    }
    expect(order.slice(0, 4)).toEqual(['throttle', 'commercial', 'essential', 'critical']);
    expect(peak).toBeGreaterThan(sim.scenario.thermal.trip.critical.above);
  });

  it('tripped modules draw nothing and come back once the loop cools', () => {
    // Start with a hot loop and healthy radiators.
    const sim = makeSim((s) => {
      s.thermal.initialC = 34;
    });
    sim.run(2);
    let hab = sim.snapshot().modules.find((m) => m.id === 'habitat-1')!;
    expect(hab.status).toBe('overheated');
    expect(hab.actualDrawKw).toBe(0);
    expect(hab.heatKw).toBe(0);
    runUntil(sim, () => !sim.snapshot().thermal.tripped.commercial, 120);
    expect(sim.snapshot().thermal.loopC).toBeLessThan(sim.scenario.thermal.trip.commercial.below);
    sim.tick();
    hab = sim.snapshot().modules.find((m) => m.id === 'habitat-1')!;
    expect(['powered', 'throttled', 'shed']).toContain(hab.status);
  });

  it('switching the radiators off makes the station overheat', () => {
    const sim = makeSim();
    sim.command({ type: 'setModuleEnabled', moduleId: 'radiator-1', enabled: false });
    expect(sim.snapshot().thermal.capacityKw).toBe(0);
    runUntil(sim, () => sim.snapshot().thermal.tripped.commercial, 120);
  });

  it('in the default scenario the loop throttles around sunset but never trips', () => {
    const sim = makeSim();
    let throttles = 0;
    let trips = 0;
    sim.events.on('throttleChanged', (e) => e.throttled && throttles++);
    sim.events.on('overheatTrip', () => trips++);
    sim.run(Math.ceil(sim.orbit.periodMinutes * 5));
    expect(throttles).toBeGreaterThan(0);
    expect(trips).toBe(0);
  });
});
