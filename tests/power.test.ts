import { describe, expect, it } from 'vitest';
import { makeSim, runUntil } from './helpers';

describe('power system in the station sim', () => {
  it('drains the battery during eclipse', () => {
    const sim = makeSim();
    runUntil(sim, () => !sim.snapshot().orbit.sunlit && sim.snapshot().orbit.sunlight === 0);
    const before = sim.snapshot().power.storedKwh;
    sim.run(10);
    const snap = sim.snapshot();
    expect(snap.power.generationKw).toBe(0);
    expect(snap.power.storedKwh).toBeLessThan(before);
  });

  it('recharges in sunlight', () => {
    const sim = makeSim((s) => {
      s.power.initialChargeFraction = 0.3;
      s.orbit.startPhaseDeg = 0; // Orbital noon.
    });
    const before = sim.snapshot().power.storedKwh;
    sim.run(10);
    const snap = sim.snapshot();
    expect(snap.orbit.sunlit).toBe(true);
    expect(snap.power.generationKw).toBeGreaterThan(0);
    expect(snap.power.storedKwh).toBeGreaterThan(before);
  });

  it('sheds Commercial first, then Essential, and Critical only once the battery is empty', () => {
    // Stress test: a station with dead arrays, so the battery runs all the way down.
    const sim = makeSim(
      (s) => {
        s.power.initialChargeFraction = 1;
      },
      (d) => {
        for (const m of d) if (m.power.generationKw) m.power.generationKw = 0;
      },
    );
    const order: { tier: string; storedKwh: number }[] = [];
    sim.events.on('moduleShed', (e) => order.push({ tier: e.tier, storedKwh: sim.snapshot().power.storedKwh }));

    for (let i = 0; i < 200; i++) {
      sim.tick();
      const snap = sim.snapshot();
      const status = (id: string) => snap.modules.find((m) => m.id === id)!.status;
      if (snap.power.storedKwh > 0) {
        expect(status('core-1')).toBe('powered');
        expect(status('battery-1')).toBe('powered');
      }
      // Commercial never runs while Essential is shed.
      if (snap.power.shedTiers.essential) expect(snap.power.shedTiers.commercial).toBe(true);
    }

    expect(order.map((o) => o.tier)).toEqual(['commercial', 'essential', 'critical', 'critical']);
    for (const o of order.filter((o) => o.tier === 'critical')) expect(o.storedKwh).toBe(0);
  });

  it('a Commercial load sheds near the end of a normal eclipse and comes back in sunlight', () => {
    const sim = makeSim();
    const shed: number[] = [];
    const restored: number[] = [];
    sim.events.on('tierShed', (e) => e.tier === 'commercial' && shed.push(sim.elapsedMinutes));
    sim.events.on('tierRestored', (e) => e.tier === 'commercial' && restored.push(sim.elapsedMinutes));
    sim.run(Math.ceil(sim.orbit.periodMinutes * 3));
    expect(shed.length).toBeGreaterThan(0);
    expect(restored.length).toBeGreaterThan(0);
    expect(restored[0]!).toBeGreaterThan(shed[0]!);
  });

  it('switching a module off removes its load', () => {
    const sim = makeSim();
    const before = sim.snapshot().power.loadKw;
    sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false });
    const snap = sim.snapshot();
    expect(snap.modules.find((m) => m.id === 'habitat-1')!.status).toBe('off');
    expect(snap.power.loadKw).toBeCloseTo(before - 6);
  });

  it('is deterministic', () => {
    const a = makeSim();
    const b = makeSim();
    a.run(500);
    b.run(500);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});
