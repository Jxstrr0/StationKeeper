import { describe, expect, it } from 'vitest';
import type { Simulation } from '../src/sim/simulation';
import { makeSim, runUntil } from './helpers';

const ls = (sim: Simulation) => sim.snapshot().lifeSupport;
const rackOff = (sim: Simulation) => sim.command({ type: 'setModuleEnabled', moduleId: 'life-support-1', enabled: false });

describe('life support', () => {
  it('counts crew, guests, and pressurised volume from the modules', () => {
    const l = ls(makeSim());
    expect(l.crew).toBe(3);
    expect(l.guests).toBe(4);
    expect(l.people).toBe(7);
    expect(l.volumeM3).toBe(185);
  });

  it('holds CO2 at the setpoint and keeps O2 topped up while the rack runs', () => {
    const sim = makeSim();
    const before = ls(sim);
    sim.run(600);
    const after = ls(sim);
    expect(after.co2MmHg).toBeCloseTo(sim.scenario.lifeSupport.co2SetpointMmHg, 3);
    expect(after.o2Kg).toBeGreaterThan(before.o2Kg);
    expect(after.health).toBe(1);
  });

  it('electrolysis and leftover losses use water, but recovery keeps most of it', () => {
    const sim = makeSim();
    const cfg = sim.scenario.lifeSupport;
    const start = ls(sim).waterKg;
    sim.run(24 * 60);
    const used = start - ls(sim).waterKg;
    const people = 7;
    const madeO2 = 7.2; // Tanks never fill in the first day, so the rack runs flat out.
    const expected = people * cfg.perPerson.waterKgPerDay * (1 - 0.9) + madeO2 * cfg.waterPerKgO2;
    expect(used).toBeCloseTo(expected, 1);
  });

  it('with the rack off, people use O2 and CO2 builds at the expected rate', () => {
    const sim = makeSim();
    const cfg = sim.scenario.lifeSupport;
    rackOff(sim);
    const before = ls(sim);
    sim.run(60);
    const after = ls(sim);
    expect(before.o2Kg - after.o2Kg).toBeCloseTo((7 * cfg.perPerson.o2KgPerDay) / 24, 4);
    // Ideal gas in 185 m³ at 22 °C: 1 kg of CO2 ≈ 2.26 mmHg.
    const mmHgPerKg = ((1 / 0.04401) * 8.314 * 295.15) / 185 / 133.322;
    expect(after.co2MmHg - before.co2MmHg).toBeCloseTo(((7 * cfg.perPerson.co2KgPerDay) / 24) * mmHgPerKg, 4);
  });

  it('bad air raises alarms, wears the crew down, and they recover once the rack is back', () => {
    const sim = makeSim();
    const alarms: string[] = [];
    sim.events.on('lifeSupportAlarm', (e) => e.active && alarms.push(e.alarm));
    rackOff(sim);
    runUntil(sim, () => ls(sim).co2MmHg > 12, 24 * 60);
    expect(alarms.slice(0, 2)).toEqual(['co2Warn', 'co2Danger']);
    const worn = ls(sim).health;
    expect(worn).toBeLessThan(1);
    sim.command({ type: 'setModuleEnabled', moduleId: 'life-support-1', enabled: true });
    runUntil(sim, () => !ls(sim).alarms.co2Warn, 24 * 60);
    // Condition keeps falling while CO2 is still above the danger level, then recovers once the air is safe.
    const safe = ls(sim).health;
    expect(safe).toBeLessThanOrEqual(worn);
    sim.run(240);
    expect(ls(sim).health).toBeGreaterThan(safe);
  });

  it('running out of O2 is worse than high CO2 alone', () => {
    const sim = makeSim(
      (s) => {
        s.lifeSupport.initialO2Fraction = 0.01;
      },
      (d) => {
        const rack = d.find((m) => m.id === 'life-support')!;
        rack.lifeSupport!.o2KgPerDay = 0; // Broken electrolyser; scrubbers still fine.
      },
    );
    runUntil(sim, () => ls(sim).alarms.o2Out, 120);
    sim.run(60);
    expect(ls(sim).co2MmHg).toBeCloseTo(2, 2);
    expect(ls(sim).health).toBeLessThan(0.75);
  });

  it('cascade: a power shortage sheds the Essential rack and the air goes stale', () => {
    const sim = makeSim(
      (s) => {
        s.power.initialChargeFraction = 1;
      },
      (d) => {
        for (const m of d) if (m.power.generationKw) m.power.generationKw = 0;
      },
    );
    runUntil(sim, () => sim.snapshot().power.shedTiers.essential, 300);
    sim.tick();
    expect(sim.snapshot().modules.find((m) => m.id === 'life-support-1')!.status).toBe('shed');
    const co2 = ls(sim).co2MmHg;
    sim.run(30);
    expect(ls(sim).co2MmHg).toBeGreaterThan(co2);
    expect(ls(sim).co2RemovedKgPerDay).toBe(0);
  });

  it('cascade: an overheated loop trips the rack and the air goes stale', () => {
    const sim = makeSim();
    sim.command({ type: 'setModuleEnabled', moduleId: 'radiator-1', enabled: false });
    runUntil(sim, () => sim.snapshot().thermal.tripped.essential, 600);
    sim.tick();
    expect(sim.snapshot().modules.find((m) => m.id === 'life-support-1')!.status).toBe('overheated');
    const co2 = ls(sim).co2MmHg;
    sim.run(30);
    expect(ls(sim).co2MmHg).toBeGreaterThan(co2);
  });

  it('a bigger cabin dilutes the same CO2', () => {
    const small = makeSim();
    const big = makeSim(undefined, (d) => {
      d.find((m) => m.id === 'habitat')!.cabin!.volumeM3 = 290;
    });
    rackOff(small);
    rackOff(big);
    small.run(120);
    big.run(120);
    expect(ls(big).co2MmHg).toBeLessThan(ls(small).co2MmHg);
  });
});
