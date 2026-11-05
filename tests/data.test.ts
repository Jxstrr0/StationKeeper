import { describe, expect, it } from 'vitest';
import { parseModuleDefs, parseScenario } from '../src/sim/data';
import modulesJson from '../src/data/modules.json';
import scenarioJson from '../src/data/scenarios/longlight-one.json';
import { SCENARIOS } from '../src/scenarios';
import { Simulation } from '../src/sim/simulation';
import { baseScenario, defs } from './helpers';

describe('data files', () => {
  it('parse and cover every module used by the scenario', () => {
    const ids = new Set(defs.map((d) => d.id));
    for (const e of baseScenario.layout) expect(ids.has(e.module)).toBe(true);
  });

  it('have unit port directions', () => {
    for (const d of defs) for (const p of d.ports) expect(Math.hypot(...p.direction)).toBeCloseTo(1);
  });

  it('reject bad tiers', () => {
    expect(() =>
      parseModuleDefs({
        modules: [{ id: 'x', name: 'X', kind: 'core', description: '', power: { drawKw: 1, tier: 'vip' }, ports: [], greybox: { shape: 'core', light: [0, 0, 0] } }],
      }),
    ).toThrow(/unknown tier/);
  });

  it('reject inverted temperature bands and bad throttle factors', () => {
    const bad = structuredClone(scenarioJson) as { thermal: { throttle: { above: number; below: number }; throttleFactor: number } };
    bad.thermal.throttle = { above: 20, below: 25 };
    expect(() => parseScenario(bad)).toThrow(/below/);
    const bad2 = structuredClone(scenarioJson) as { thermal: { throttleFactor: number } };
    bad2.thermal.throttleFactor = 0;
    expect(() => parseScenario(bad2)).toThrow(/throttleFactor/);
  });

  it('reject a water recovery fraction above 1', () => {
    const raw = structuredClone(modulesJson) as { modules: { id: string; lifeSupport?: { waterRecovery: number } }[] };
    raw.modules.find((m) => m.id === 'life-support')!.lifeSupport!.waterRecovery = 1.5;
    expect(() => parseModuleDefs(raw)).toThrow(/waterRecovery/);
  });

  it('reject bad reliability data', () => {
    const raw = structuredClone(modulesJson) as { modules: { id: string; reliability?: { wearDays: number } }[] };
    raw.modules.find((m) => m.id === 'radiator')!.reliability!.wearDays = 0;
    expect(() => parseModuleDefs(raw)).toThrow(/wearDays/);

    type Rel = { reliability: { repairTeams: number; initialWear: Record<string, number> } };
    const teams = structuredClone(scenarioJson) as Rel;
    teams.reliability.repairTeams = 0.5;
    expect(() => parseScenario(teams)).toThrow(/repairTeams/);
    const ghost = structuredClone(scenarioJson) as Rel;
    ghost.reliability.initialWear['ghost-1'] = 0.5;
    expect(() => parseScenario(ghost)).toThrow(/ghost-1/);
    const worn = structuredClone(scenarioJson) as Rel;
    worn.reliability.initialWear['radiator-1'] = 1.2;
    expect(() => parseScenario(worn)).toThrow(/radiator-1/);
  });

  it('reject bad economy data', () => {
    type Econ = { economy: { contracts: { pool: { id: string; labHours: number; deadlineHours: number }[] }; loan: { ratePerQuarter: number } } };
    const short = structuredClone(scenarioJson) as Econ;
    short.economy.contracts.pool[0]!.deadlineHours = short.economy.contracts.pool[0]!.labHours - 1;
    expect(() => parseScenario(short)).toThrow(/shorter than the lab time/);
    const twice = structuredClone(scenarioJson) as Econ;
    twice.economy.contracts.pool.push({ ...twice.economy.contracts.pool[0]! });
    expect(() => parseScenario(twice)).toThrow(/duplicate contract/);
    const rate = structuredClone(scenarioJson) as Econ;
    rate.economy.loan.ratePerQuarter = 2;
    expect(() => parseScenario(rate)).toThrow(/ratePerQuarter/);
    const price = structuredClone(modulesJson) as { modules: { id: string; price?: number }[] };
    price.modules.find((m) => m.id === 'radiator')!.price = -3;
    expect(() => parseModuleDefs(price)).toThrow(/price/);
  });

  it('every shipped scenario parses, has a unique id, and starts a sim', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(2);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) {
      const sim = new Simulation(defs, s);
      sim.run(60);
      expect(sim.snapshot().ending.goal.kind).toBe(s.goal.kind);
    }
  });

  it('rejects goals it does not understand', () => {
    type Goal = { goal: Record<string, unknown> };
    const bad = (goal: Record<string, unknown>) => {
      const s = structuredClone(scenarioJson) as unknown as Goal;
      s.goal = goal;
      return () => parseScenario(s);
    };
    expect(bad({ kind: 'world-peace' })).toThrow(/goal.kind/);
    expect(bad({ kind: 'cash', amount: 0 })).toThrow(/goal.amount/);
    expect(bad({ kind: 'contracts', count: 2.5 })).toThrow(/goal.count/);
    expect(bad({ kind: 'repayLoan', days: -1 })).toThrow(/goal.days/);
    expect(parseScenario({ ...(structuredClone(scenarioJson) as object), goal: { kind: 'cash', amount: 90, days: 4 } }).goal).toEqual({
      kind: 'cash',
      amount: 90,
      days: 4,
    });
  });
});
