import { describe, expect, it } from 'vitest';
import scenarioJson from '../src/data/scenarios/longlight-one.json';
import { parseScenario } from '../src/sim/data';
import type { SimEvents } from '../src/sim/events';
import type { Simulation } from '../src/sim/simulation';
import { workPace } from '../src/sim/systems/crew';
import type { ScenarioDef } from '../src/sim/types';
import { paceText } from '../src/ui/crewPanel';
import { baseScenario, makeSim, runUntil } from './helpers';

const needs = baseScenario.crew.needs;
const { floor, steadyAt, best } = needs.morale.pace;
const HOUR = 60;

/** A crew whose morale starts and settles at `morale`, so their pace holds still. No illness. */
const settled = (morale: number) => (s: ScenarioDef) => {
  s.crew.needs.illness.perDay = 0;
  s.crew.needs.morale.start = morale;
  s.crew.needs.morale.base = morale;
};

/** Minutes to service the radiator. */
function serviceMinutes(sim: Simulation): number {
  const done: SimEvents['repairDone'][] = [];
  sim.events.on('repairDone', (e) => done.push(e));
  sim.command({ type: 'repair', moduleId: 'radiator-1' });
  const start = sim.elapsedMinutes;
  runUntil(sim, () => done.length > 0, 10 * HOUR);
  return sim.elapsedMinutes - start;
}

/** A lab running a long contract all day in permanent sunlight, with a radiator big enough for it. */
function labSim(patch: (s: ScenarioDef) => void): Simulation {
  const sim = makeSim(
    (s) => {
      s.economy.startCash = 500;
      s.economy.deliveryHours = 0;
      s.orbit.betaDeg = 80;
      for (const c of s.economy.contracts.pool) {
        c.labHours = 500;
        c.deadlineHours = 1000;
      }
      patch(s);
    },
    (d) => (d.find((x) => x.id === 'radiator')!.thermal.rejectKw = 40),
  );
  const port = sim.snapshot().freePorts.find((p) => sim.buildProblem('research-lab', p.moduleId, p.portId) === null)!;
  sim.command({ type: 'addModule', defId: 'research-lab', to: port.moduleId, port: port.portId });
  sim.command({ type: 'acceptContract', uid: sim.snapshot().economy.offers[0]!.uid });
  return sim;
}

describe('work pace', () => {
  it('runs from the floor when miserable, through full speed when settled, to a little quicker when content', () => {
    expect(workPace(0, needs)).toBeCloseTo(floor);
    expect(workPace(steadyAt, needs)).toBeCloseTo(1);
    expect(workPace(1, needs)).toBeCloseTo(best);
    let last = 0;
    for (let m = 0; m <= 1.0001; m += 0.05) {
      const p = workPace(m, needs);
      expect(p).toBeGreaterThan(last);
      last = p;
    }
  });

  it('a glum engineer services a module more slowly, and the repair clock says so', () => {
    const steady = serviceMinutes(makeSim(settled(steadyAt)));
    expect(Math.abs(steady - 2 * HOUR)).toBeLessThanOrEqual(1); // the job starts on the tick after it is queued

    const glum = makeSim(settled(0.4));
    glum.command({ type: 'repair', moduleId: 'radiator-1' });
    glum.tick();
    const pace = glum.snapshot().crew.members.find((m) => m.role === 'engineer')!.pace;
    expect(pace).toBeCloseTo(workPace(0.4, needs), 2);
    const left = glum.snapshot().modules.find((m) => m.id === 'radiator-1')!.repair!.hoursLeft;
    expect(left).toBeCloseTo((2 - pace / 60) / pace, 2);

    const slow = serviceMinutes(makeSim(settled(0.4)));
    expect(slow / steady).toBeCloseTo(1 / workPace(0.4, needs), 1);
  });

  it('a content crew gets more lab work done in a day', () => {
    const progress = (morale: number) => {
      const sim = labSim(settled(morale));
      sim.run(24 * HOUR);
      return sim.snapshot().economy.active[0]!.progressHours;
    };
    const steady = progress(steadyAt);
    const content = progress(0.95);
    const glum = progress(0.4);
    expect(content).toBeGreaterThan(steady * 1.05);
    expect(glum).toBeLessThan(steady * 0.9);
  });

  it('the crew sheet says how fast the crew is working', () => {
    expect(paceText(makeSim(settled(steadyAt)).snapshot())).toMatch(/full speed: 100% pace/);
    expect(paceText(makeSim(settled(0.95)).snapshot())).toMatch(/quicker.*\d+% pace/);
    expect(paceText(makeSim(settled(0.4)).snapshot())).toMatch(/slower.*\d+% pace/);
  });

  it('rejects a pace curve that makes no sense', () => {
    const withPace = (pace: unknown) => () =>
      parseScenario({ ...scenarioJson, crew: { ...scenarioJson.crew, needs: { ...scenarioJson.crew.needs, morale: { ...scenarioJson.crew.needs.morale, pace } } } });
    expect(withPace(undefined)).toThrow(/pace/);
    expect(withPace({ floor: 1.2, steadyAt: 0.8, best: 1.1 })).toThrow(/floor/);
    expect(withPace({ floor: 0.6, steadyAt: 0.8, best: 0.9 })).toThrow(/best/);
    expect(withPace({ floor: 0.6, steadyAt: 1, best: 1.1 })).toThrow(/steadyAt/);
  });
});
