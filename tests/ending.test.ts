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
});
