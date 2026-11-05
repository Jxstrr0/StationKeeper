import { describe, expect, it } from 'vitest';
import modulesJson from '../src/data/modules.json';
import scenarioJson from '../src/data/scenarios/longlight-one.json';
import { parseModuleDefs, parseScenario } from '../src/sim/data';
import type { SimEvents } from '../src/sim/events';
import { Simulation, type SimSave } from '../src/sim/simulation';
import { comfortLift } from '../src/sim/systems/crew';
import type { ScenarioDef } from '../src/sim/types';
import { bonusBlocked, comfortText } from '../src/ui/crewPanel';
import { baseScenario, defs, makeSim, runUntil } from './helpers';

const HOUR = 60;
const galley = defs.find((d) => d.id === 'galley')!;
const bonus = baseScenario.crew.bonus;

/** A station in permanent sunlight with money to spare and a radiator big enough, so a galley is never shed. */
function sunny(patch: (s: ScenarioDef) => void = () => {}): Simulation {
  return makeSim(
    (s) => {
      s.economy.startCash = 500;
      s.economy.deliveryHours = 0;
      s.orbit.betaDeg = 80;
      s.crew.needs.illness.perDay = 0;
      patch(s);
    },
    (d) => (d.find((x) => x.id === 'radiator')!.thermal.rejectKw = 40),
  );
}

function buildGalley(sim: Simulation): string {
  const port = sim.snapshot().freePorts.find((p) => sim.buildProblem('galley', p.moduleId, p.portId) === null)!;
  expect(sim.command({ type: 'addModule', defId: 'galley', to: port.moduleId, port: port.portId })).toMatchObject({ ok: true });
  return sim.snapshot().modules.find((m) => m.kind === 'galley')!.id;
}

const avgMorale = (sim: Simulation) => {
  const here = sim.snapshot().crew.members.filter((m) => m.status !== 'inFlight');
  return here.reduce((n, m) => n + m.morale, 0) / here.length;
};

describe('comforts', () => {
  it('the best comfort counts, and too few seats share it out', () => {
    const g = galley.comfort!;
    expect(comfortLift([], 4)).toEqual({ lift: 0, seats: 0 });
    expect(comfortLift([g], 4)).toEqual({ lift: g.morale, seats: g.seats });
    expect(comfortLift([g], 9).lift).toBeCloseTo((g.morale * g.seats) / 9);
    expect(comfortLift([g, g], 9)).toEqual({ lift: g.morale, seats: 2 * g.seats });
  });

  it('a running galley lifts where morale settles, and stops when switched off', () => {
    const without = sunny();
    const withIt = sunny();
    const id = buildGalley(withIt);
    expect(withIt.snapshot().crew.comfortLift).toBeCloseTo(galley.comfort!.morale);
    without.run(24 * HOUR);
    withIt.run(24 * HOUR);
    expect(avgMorale(withIt) - avgMorale(without)).toBeGreaterThan(galley.comfort!.morale * 0.8);

    withIt.command({ type: 'setModuleEnabled', moduleId: id, enabled: false });
    expect(withIt.snapshot().crew.comfortLift).toBe(0);
    expect(comfortText(withIt.snapshot())).toMatch(/galley/i);
  });

  it('says when the seats are spread thin', () => {
    const sim = sunny((s) => {
      s.crew.roster = Array.from({ length: 8 }, (_, i) => ({ name: `Hand ${i}`, role: 'engineer' as const }));
    });
    buildGalley(sim);
    const s = sim.snapshot();
    expect(s.crew.comfortSeats).toBeLessThan(s.crew.aboard);
    expect(comfortText(s)).toMatch(/shared thin/);
  });
});

describe('bonus', () => {
  it('costs a fixed sum a head, lifts everyone, and waits a day before the next', () => {
    let sim = sunny();
    sim.run(2 * HOUR);
    const before = sim.snapshot();
    const paid: SimEvents['crewBonusPaid'][] = [];
    sim.events.on('crewBonusPaid', (e) => paid.push(e));
    expect(before.crew.bonusCost).toBeCloseTo(before.crew.aboard * bonus.perPerson);
    expect(bonusBlocked(before)).toBeNull();

    expect(sim.command({ type: 'payBonus' })).toEqual({ ok: true });
    const after = sim.snapshot();
    expect(before.economy.cash - after.economy.cash).toBeCloseTo(before.crew.bonusCost);
    expect(paid).toEqual([{ cost: before.crew.bonusCost, people: before.crew.aboard }]);
    for (const m of after.crew.members) {
      const was = before.crew.members.find((x) => x.id === m.id)!;
      expect(m.morale).toBeCloseTo(Math.min(1, was.morale + bonus.morale));
    }

    expect(sim.command({ type: 'payBonus' }).ok).toBe(false);
    expect(bonusBlocked(after)).toMatch(/precedent/);
    expect(after.crew.bonusReadyInHours).toBeCloseTo(bonus.cooldownHours);

    // The cooldown survives a save.
    sim = Simulation.fromSave(defs, sim.scenario, JSON.parse(JSON.stringify(sim.save())) as SimSave, { failures: false });
    expect(sim.command({ type: 'payBonus' }).ok).toBe(false);
    runUntil(sim, () => sim.snapshot().crew.bonusReadyInHours === null, bonus.cooldownHours * HOUR + 1);
    expect(sim.command({ type: 'payBonus' })).toEqual({ ok: true });
  });

  it('pulls someone back from the brink of resigning', () => {
    const sim = sunny((s) => (s.crew.needs.morale.base = 0.1));
    runUntil(sim, () => sim.snapshot().crew.members.some((m) => m.resignsInHours !== null), 2 * 1440);
    sim.command({ type: 'payBonus' });
    expect(sim.snapshot().crew.members.every((m) => m.resignsInHours === null)).toBe(true);
  });

  it("is refused when the cash isn't there", () => {
    const sim = makeSim((s) => (s.economy.startCash = 0.1));
    const r = sim.command({ type: 'payBonus' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cash/);
    expect(bonusBlocked(sim.snapshot())).toMatch(/costs/);
  });
});

describe('comfort and bonus data', () => {
  it('rejects nonsense', () => {
    const withGalley = (comfort: unknown) => () =>
      parseModuleDefs({ ...modulesJson, modules: modulesJson.modules.map((d) => (d.id === 'galley' ? { ...d, comfort } : d)) });
    expect(withGalley({ morale: 0.1, seats: 0 })).toThrow(/seats/);
    expect(withGalley({ morale: 0.1, seats: 2.5 })).toThrow(/seats/);
    expect(withGalley({ morale: 1.5, seats: 4 })).toThrow(/morale/);
    const crew = (b: unknown) => () => parseScenario({ ...scenarioJson, crew: { ...scenarioJson.crew, bonus: b } });
    expect(crew(undefined)).toThrow(/crew.bonus/);
    expect(crew({ perPerson: -1, morale: 0.1, cooldownHours: 24 })).toThrow(/perPerson/);
    expect(crew({ perPerson: 0.3, morale: 2, cooldownHours: 24 })).toThrow(/morale/);
  });
});
