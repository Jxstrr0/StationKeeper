import { describe, expect, it } from 'vitest';
import type { SimEvents } from '../src/sim/events';
import { Simulation, type SimSave } from '../src/sim/simulation';
import type { ScenarioDef } from '../src/sim/types';
import { defs, makeSim, runUntil } from './helpers';

const DAY = 1440;

/** No guests paying, so money only goes out. */
const broke = (cash: number, limit = 1000) => (s: ScenarioDef) => {
  s.economy.startCash = cash;
  s.economy.guestPerDay = 0;
  s.endings.overdraftLimit = limit;
};

function watch(sim: Simulation) {
  const over: SimEvents['gameOver'][] = [];
  const goals: SimEvents['goalReached'][] = [];
  sim.events.on('gameOver', (e) => over.push(e));
  sim.events.on('goalReached', (e) => goals.push(e));
  return { over, goals };
}

describe('endings', () => {
  it('the bank takes the station the moment cash passes the overdraft limit', () => {
    const sim = makeSim(broke(-19.5, 20));
    const { over } = watch(sim);
    runUntil(sim, () => sim.ended, DAY / 2);
    expect(over).toEqual([{ outcome: 'bankrupt', minutes: sim.elapsedMinutes }]);
    expect(sim.snapshot().economy.cash).toBeLessThan(-20);
    expect(sim.snapshot().ending).toMatchObject({ outcome: 'bankrupt', endedAtMinutes: sim.elapsedMinutes });
  });

  it('two quarters in a row closed overdrawn ends the game too, and a quarter in the black resets the count', () => {
    const sim = makeSim(broke(-1));
    sim.run(DAY);
    expect(sim.snapshot().ending.overdrawnCloses).toBe(1);
    expect(sim.ended).toBe(false);
    // The warning says this is the last quarter before the bank steps in.
    expect(sim.snapshot().warnings.find((w) => w.kind === 'overdrawn')).toMatchObject({ final: true, limit: 1000 });
    sim.run(DAY);
    expect(sim.snapshot().ending.outcome).toBe('bankrupt');
    expect(sim.snapshot().ending.endedAtMinutes).toBe(2 * DAY);

    const lucky = makeSim(broke(-1));
    lucky.run(DAY);
    const s = lucky.save();
    s.economy.cash = 50; // a windfall before the second close
    const saved = Simulation.fromSave(defs, lucky.scenario, s, { failures: false });
    saved.run(DAY);
    expect(saved.snapshot().ending.overdrawnCloses).toBe(0);
    expect(saved.ended).toBe(false);
  });

  it('a station that has ended stops: no ticks, no commands', () => {
    const sim = makeSim(broke(-19.5, 20));
    runUntil(sim, () => sim.ended, DAY / 2);
    const at = sim.elapsedMinutes;
    sim.run(100);
    expect(sim.elapsedMinutes).toBe(at);
    expect(sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false })).toMatchObject({ ok: false });
  });

  it('the crew are evacuated when their condition falls too low', () => {
    const sim = makeSim();
    const { over } = watch(sim);
    sim.command({ type: 'setModuleEnabled', moduleId: 'life-support-1', enabled: false });
    runUntil(sim, () => sim.ended, 10 * DAY);
    expect(over.map((e) => e.outcome)).toEqual(['evacuated']);
    expect(sim.snapshot().lifeSupport.health).toBeLessThan(sim.scenario.endings.evacuateBelow);
  });

  it('paying off the loan reaches the goal once, and play carries on', () => {
    const sim = makeSim((s) => (s.economy.startCash = 100));
    const { goals, over } = watch(sim);
    sim.run(30);
    expect(sim.command({ type: 'repayLoan', amount: 1000 }).ok).toBe(true);
    expect(goals).toEqual([{ minutes: 30 }]);
    expect(sim.snapshot().ending.goalAtMinutes).toBe(30);
    sim.run(DAY);
    expect(goals).toHaveLength(1);
    expect(over).toHaveLength(0);
    expect(sim.elapsedMinutes).toBe(30 + DAY);
  });

  it('an ended game saves and loads as ended', () => {
    const sim = makeSim(broke(-19.5, 20));
    runUntil(sim, () => sim.ended, DAY / 2);
    const loaded = Simulation.fromSave(defs, sim.scenario, JSON.parse(JSON.stringify(sim.save())) as SimSave);
    expect(loaded.ended).toBe(true);
    expect(loaded.snapshot().ending).toEqual(sim.snapshot().ending);
  });

  it('a cash goal is reached when cash gets there', () => {
    const sim = makeSim((s) => {
      s.goal = { kind: 'cash', amount: 41 };
      s.economy.guestPerDay = 40;
    });
    const { goals } = watch(sim);
    expect(sim.snapshot().ending.goal).toMatchObject({ kind: 'cash', target: 41, deadlineAtMinutes: null });
    runUntil(sim, () => goals.length > 0, DAY);
    expect(sim.snapshot().economy.cash).toBeGreaterThanOrEqual(41);
    expect(sim.snapshot().ending.goal.progress).toBe(1);
  });

  it('a contracts goal counts deliveries over the whole game, across quarters', () => {
    const sim = makeSim((s) => {
      s.goal = { kind: 'contracts', count: 2 };
      s.economy.deliveryHours = 0;
      s.economy.startCash = 500;
      for (const c of s.economy.contracts.pool) {
        c.labHours = 1;
        c.deadlineHours = 12;
        delete c.stable;
      }
    });
    const { goals } = watch(sim);
    const port = sim.snapshot().freePorts.find((p) => sim.buildProblem('research-lab', p.moduleId, p.portId) === null)!;
    expect(sim.command({ type: 'addModule', defId: 'research-lab', to: port.moduleId, port: port.portId }).ok).toBe(true);
    runUntil(
      sim,
      () => {
        const e = sim.snapshot().economy;
        if (e.active.length === 0 && e.offers[0]) sim.command({ type: 'acceptContract', uid: e.offers[0].uid });
        return goals.length > 0;
      },
      3 * DAY,
    );
    expect(sim.snapshot().ending.goal).toMatchObject({ kind: 'contracts', current: 2, target: 2, progress: 1 });
  });

  it('a reviews goal is reached when a quarter closes with reviews that good, and not before', () => {
    const turnaround = (s: ScenarioDef) => {
      s.goal = { kind: 'reviews', stars: 4, days: 3 };
      s.guests.start = 0.1;
      s.guests.perHour = 2; // reputation follows the station within the hour
      s.crew.needs.illness.perDay = 0;
    };
    const sim = makeSim(turnaround);
    const { goals } = watch(sim);
    // Before any reviews are posted, the station stands where its reputation starts.
    expect(sim.snapshot().ending.goal).toMatchObject({ kind: 'reviews', current: 1, target: 4, progress: 0 });
    sim.run(DAY - 1);
    expect(sim.snapshot().guests.stars).toBeGreaterThanOrEqual(4); // already four stars' worth, but nobody has posted
    expect(goals).toEqual([]);
    sim.run(1);
    expect(goals).toEqual([{ minutes: DAY }]);
    expect(sim.snapshot().ending.goal).toMatchObject({ current: 4, progress: 1 });

    // A habitat left dark all quarter earns two stars: a third of the way from one to four.
    const dark = makeSim(turnaround);
    dark.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false });
    dark.run(DAY);
    expect(dark.snapshot().ending.goal).toMatchObject({ current: 2, progress: 1 / 3 });
    expect(dark.snapshot().ending.goalAtMinutes).toBeNull();
  });

  it('the board replaces you if the goal is not met by its deadline', () => {
    const sim = makeSim((s) => (s.goal = { kind: 'cash', amount: 1000, days: 0.5 }));
    const { over } = watch(sim);
    expect(sim.snapshot().ending.goal.deadlineAtMinutes).toBe(DAY / 2);
    sim.run(DAY);
    expect(over).toEqual([{ outcome: 'replaced', minutes: DAY / 2 }]);
  });

  it('a goal met in time keeps the board happy past the deadline', () => {
    const sim = makeSim((s) => {
      s.goal = { kind: 'repayLoan', days: 0.5 };
      s.economy.startCash = 100;
    });
    sim.command({ type: 'repayLoan', amount: 1000 });
    sim.run(DAY);
    expect(sim.ended).toBe(false);
    expect(sim.snapshot().ending.goalAtMinutes).toBe(0);
  });
});
