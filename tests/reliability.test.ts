import { describe, expect, it } from 'vitest';
import { forecast } from '../src/sim/forecast';
import type { Simulation } from '../src/sim/simulation';
import { hazardPerDay, heatFactor } from '../src/sim/systems/reliability';
import type { ModuleDef } from '../src/sim/types';
import { baseScenario, defs, flatPace, makeSim, runUntil } from './helpers';

const mod = (sim: Simulation, id: string) => sim.snapshot().modules.find((m) => m.id === id)!;
const cfg = baseScenario.reliability;

/** `defId` fails almost at once; everything else can still be serviced but practically never fails. */
const onlyBreaks = (defId: string) => (list: ModuleDef[]) => {
  for (const d of list) {
    if (d.reliability) d.reliability = { ...d.reliability, failPerDay: d.id === defId ? 1e6 : 1e-12 };
  }
};

describe('reliability', () => {
  it('fails rarely when new, at the full rate when worn, and faster when hot', () => {
    const rack = defs.find((d) => d.id === 'life-support')!;
    const r = rack.reliability!;
    expect(hazardPerDay(rack, 0, cfg.ratedC, cfg)).toBeCloseTo(r.failPerDay * cfg.newFailShare);
    expect(hazardPerDay(rack, 1, cfg.ratedC, cfg)).toBeCloseTo(r.failPerDay);
    expect(heatFactor(cfg.ratedC - 10, cfg)).toBe(1);
    expect(heatFactor(cfg.ratedC + cfg.doublingC, cfg)).toBeCloseTo(2);
    expect(hazardPerDay(defs.find((d) => d.id === 'core')!, 1, 50, cfg)).toBe(0);
  });

  it('wears modules while they run, at their data rate, and not while switched off', () => {
    const sim = makeSim();
    sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false });
    const rack0 = mod(sim, 'life-support-1').wear;
    sim.run(6 * 60);
    const r = defs.find((d) => d.id === 'life-support')!.reliability!;
    const grown = mod(sim, 'life-support-1').wear - rack0;
    expect(grown).toBeGreaterThanOrEqual(0.25 / r.wearDays - 1e-9);
    expect(grown).toBeLessThan((0.25 / r.wearDays) * 1.2);
    expect(mod(sim, 'habitat-1').wear).toBe(cfg.initialWear['habitat-1']);
    expect(mod(sim, 'core-1')).toMatchObject({ wear: 0, canFail: false });
  });

  it('wears hot modules faster', () => {
    const cool = makeSim();
    const hot = makeSim((s) => {
      s.reliability.ratedC = 0;
    });
    cool.run(120);
    hot.run(120);
    expect(mod(hot, 'life-support-1').wear).toBeGreaterThan(mod(cool, 'life-support-1').wear + 0.01);
  });

  it('a failure takes the module offline and replays exactly from the same seed', () => {
    const failAt = (seed: number) => {
      const sim = makeSim((s) => (s.seed = seed), onlyBreaks('life-support'), { failures: true });
      let at = -1;
      sim.events.on('moduleFailed', ({ moduleId }) => {
        expect(moduleId).toBe('life-support-1');
        at = sim.elapsedMinutes;
      });
      runUntil(sim, () => at >= 0, 50);
      sim.tick();
      expect(mod(sim, 'life-support-1')).toMatchObject({ status: 'failed', actualDrawKw: 0, failChancePerDay: 0 });
      expect(sim.snapshot().lifeSupport.co2RemovedKgPerDay).toBe(0);
      return at;
    };
    expect(failAt(7)).toBe(failAt(7));
  });

  it('nothing fails with failures off, however worn', () => {
    const sim = makeSim(undefined, onlyBreaks('life-support'));
    sim.run(600);
    expect(mod(sim, 'life-support-1').status).not.toBe('failed');
    expect(sim.failureExposure).toBeGreaterThan(0);
  });

  it('a service takes the module offline for its service hours, then it runs like new', () => {
    const sim = makeSim(flatPace);
    const started: string[] = [];
    const done: string[] = [];
    sim.events.on('repairStarted', ({ moduleId, kind }) => started.push(`${moduleId}:${kind}`));
    sim.events.on('repairDone', ({ moduleId }) => done.push(moduleId));
    expect(mod(sim, 'life-support-1').dueForService).toBe(true);
    expect(sim.command({ type: 'repair', moduleId: 'life-support-1' })).toEqual({ ok: true });
    expect(started).toEqual(['life-support-1:service']);
    expect(mod(sim, 'life-support-1')).toMatchObject({ status: 'servicing', repair: { kind: 'service', active: true, queuePosition: 0 } });

    const hours = defs.find((d) => d.id === 'life-support')!.reliability!.serviceHours;
    sim.run(hours * 60 - 1);
    expect(mod(sim, 'life-support-1').status).toBe('servicing');
    sim.run(1);
    expect(done).toEqual(['life-support-1']);
    expect(mod(sim, 'life-support-1')).toMatchObject({ status: 'powered', wear: 0, dueForService: false, repair: null });
  });

  it('repairing a failure takes longer than a service', () => {
    const sim = makeSim(flatPace, onlyBreaks('radiator'), { failures: true });
    runUntil(sim, () => mod(sim, 'radiator-1').status === 'failed', 50);
    sim.command({ type: 'repair', moduleId: 'radiator-1' });
    const hours = defs.find((d) => d.id === 'radiator')!.reliability!.serviceHours;
    expect(mod(sim, 'radiator-1').repair).toMatchObject({ kind: 'repair', hoursLeft: hours * cfg.repairFactor });
    expect(mod(sim, 'radiator-1').status).toBe('servicing');
  });

  it('one crew team works through the list in order; waiting modules keep running', () => {
    const sim = makeSim();
    sim.command({ type: 'repair', moduleId: 'life-support-1' });
    sim.command({ type: 'repair', moduleId: 'radiator-1' });
    expect(mod(sim, 'radiator-1')).toMatchObject({ status: 'powered', repair: { active: false, queuePosition: 1 } });
    runUntil(sim, () => mod(sim, 'life-support-1').repair === null, 400);
    expect(mod(sim, 'radiator-1')).toMatchObject({ status: 'servicing', repair: { active: true } });
  });

  it('cancelling puts the module back to work with its wear unchanged', () => {
    const sim = makeSim();
    sim.command({ type: 'repair', moduleId: 'life-support-1' });
    sim.run(30);
    const wear = mod(sim, 'life-support-1').wear;
    expect(sim.command({ type: 'cancelRepair', moduleId: 'life-support-1' })).toEqual({ ok: true });
    expect(mod(sim, 'life-support-1')).toMatchObject({ status: 'powered', wear, repair: null });
    expect(sim.command({ type: 'cancelRepair', moduleId: 'life-support-1' }).ok).toBe(false);
  });

  it('refuses work on modules that never fail, twice-listed modules, and unknown ids', () => {
    const sim = makeSim();
    expect(sim.command({ type: 'repair', moduleId: 'core-1' })).toMatchObject({ ok: false, reason: expect.stringMatching(/needs no servicing/) });
    sim.command({ type: 'repair', moduleId: 'array-1' });
    expect(sim.command({ type: 'repair', moduleId: 'array-1' })).toMatchObject({ ok: false, reason: expect.stringMatching(/already/) });
    expect(sim.command({ type: 'repair', moduleId: 'nope' }).ok).toBe(false);
  });

  it('a service still waiting becomes a repair if the module fails first', () => {
    const sim = makeSim(undefined, onlyBreaks('radiator'), { failures: true });
    sim.command({ type: 'repair', moduleId: 'array-1' }); // keeps the team busy
    sim.command({ type: 'repair', moduleId: 'radiator-1' });
    expect(mod(sim, 'radiator-1').repair?.kind).toBe('service');
    runUntil(sim, () => mod(sim, 'radiator-1').status === 'failed', 50);
    expect(mod(sim, 'radiator-1').repair?.kind).toBe('repair');
  });

  it('a battery under service leaves the store, and brings its charge back', () => {
    const sim = makeSim();
    const before = sim.snapshot().power;
    sim.command({ type: 'repair', moduleId: 'battery-1' });
    const during = sim.snapshot().power;
    expect(during.capacityKwh).toBe(0);
    expect(mod(sim, 'battery-1').storedKwh).toBeCloseTo(before.storedKwh);
    sim.command({ type: 'cancelRepair', moduleId: 'battery-1' });
    expect(sim.snapshot().power.storedKwh).toBeCloseTo(before.storedKwh);
  });

  it('forecasts never break anything, report the chance of a failure, and servicing lowers it', () => {
    const sim = makeSim(undefined, undefined, { failures: true });
    const base = forecast(sim, 186)!;
    expect(base.failureChance).toBeGreaterThan(0.05);
    expect(base.failureChance).toBeLessThan(1);
    const serviced = forecast(sim, 186, { type: 'repair', moduleId: 'life-support-1' })!;
    expect(serviced.failureChance).toBeLessThan(base.failureChance);
    // The real sim is untouched, and its dice are where they were.
    expect(mod(sim, 'life-support-1').repair).toBeNull();
    expect(sim.elapsedMinutes).toBe(0);
  });
});
