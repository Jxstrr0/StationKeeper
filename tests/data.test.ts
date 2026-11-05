import { describe, expect, it } from 'vitest';
import { parseModuleDefs, parseScenario } from '../src/sim/data';
import modulesJson from '../src/data/modules.json';
import scenarioJson from '../src/data/scenario.json';
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
});
