import { describe, expect, it } from 'vitest';
import { parseModuleDefs } from '../src/sim/data';
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
});
