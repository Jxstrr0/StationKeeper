import { describe, expect, it } from 'vitest';
import { parseScenario } from '../src/sim/data';
import { Simulation } from '../src/sim/simulation';
import scenarioJson from '../src/data/scenarios/longlight-one.json';
import { defs, makeSim } from './helpers';
import { goalLine } from '../src/ui/goalText';

describe('company groundwork', () => {
  it('a transfer moves cash and books it as other stations', () => {
    const sim = makeSim();
    const before = sim.snapshot().economy.cash;
    expect(sim.command({ type: 'transfer', amount: 2.5 })).toEqual({ ok: true });
    expect(sim.command({ type: 'transfer', amount: -1 })).toEqual({ ok: true });
    expect(sim.command({ type: 'transfer', amount: Number.NaN }).ok).toBe(false);
    const e = sim.snapshot().economy;
    expect(e.cash).toBeCloseTo(before + 1.5, 9);
    expect(e.ledger.fleet).toBeCloseTo(1.5, 9);
  });

  it('a station with no goal never reaches one and never has a deadline', () => {
    const scenario = parseScenario({ ...(structuredClone(scenarioJson) as object), goal: { kind: 'none' } });
    expect(scenario.goal).toEqual({ kind: 'none' });
    expect(goalLine(scenario.goal)).toMatch(/as you see fit/);
    const sim = new Simulation(defs, scenario);
    sim.command({ type: 'repayLoan', amount: 1000 });
    sim.run(600);
    expect(sim.snapshot().ending).toMatchObject({ goalAtMinutes: null, goal: { kind: 'none', progress: 0, deadlineAtMinutes: null } });
  });

  it('a save from before the fleet line loads with it at zero', () => {
    const sim = makeSim();
    sim.run(30);
    const save = sim.save();
    const old = structuredClone(save) as unknown as { economy: { ledger: Record<string, number>; lifetime: Record<string, number> } };
    delete old.economy.ledger.fleet;
    delete old.economy.lifetime.fleet;
    const loaded = Simulation.fromSave(defs, sim.scenario, old as unknown as typeof save);
    expect(loaded.snapshot().economy.ledger.fleet).toBe(0);
    loaded.command({ type: 'transfer', amount: 1 });
    expect(loaded.snapshot().economy.ledger.fleet).toBe(1);
  });
});
