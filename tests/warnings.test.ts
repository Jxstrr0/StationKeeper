import { describe, expect, it } from 'vitest';
import type { Simulation } from '../src/sim/simulation';
import type { ModuleDef } from '../src/sim/types';
import { effectsOf, rootCauses } from '../src/sim/warnings';
import { makeSim, runUntil } from './helpers';

const breaks = (defId: string) => (list: ModuleDef[]) => {
  for (const d of list) if (d.reliability) d.reliability = { ...d.reliability, failPerDay: d.id === defId ? 1e6 : 1e-12 };
};
const warning = (sim: Simulation, key: string) => sim.snapshot().warnings.find((w) => w.key === key);

describe('warnings and cause tracing', () => {
  it('a calm station only flags the worn rack', () => {
    const sim = makeSim();
    const ws = sim.snapshot().warnings;
    expect(ws.map((w) => w.key)).toEqual(['worn:life-support-1']);
    expect(ws[0]).toMatchObject({ kind: 'moduleWorn', severity: 'warn', moduleId: 'life-support-1', causes: [] });
    sim.command({ type: 'repair', moduleId: 'life-support-1' });
    expect(warning(sim, 'worn:life-support-1')).toBeUndefined();
    expect(warning(sim, 'servicing:life-support-1')).toMatchObject({ severity: 'info' });
  });

  it('traces a CO₂ alarm back through the tripped rack and the hot loop to the failed radiator', () => {
    const sim = makeSim(undefined, breaks('radiator'), { failures: true });
    runUntil(sim, () => warning(sim, 'co2') !== undefined, 600);
    const s = sim.snapshot();
    expect(warning(sim, 'failed:radiator-1')).toMatchObject({ kind: 'moduleFailed', severity: 'alarm', causes: [] });
    expect(warning(sim, 'loopHot')?.causes).toContain('failed:radiator-1');
    expect(warning(sim, 'trip:essential')?.causes).toEqual(['loopHot']);
    expect(warning(sim, 'co2')?.causes).toEqual(['trip:essential']);
    expect(rootCauses(s.warnings, 'co2')).toContain('failed:radiator-1');
    expect(effectsOf(s.warnings, 'failed:radiator-1')).toEqual(expect.arrayContaining(['loopHot', 'trip:essential', 'co2']));
  });

  it('blames load shedding on the eclipse and a failed battery', () => {
    const sim = makeSim(undefined, breaks('battery-pack'), { failures: true });
    runUntil(sim, () => warning(sim, 'shed:commercial') !== undefined, 400);
    const shed = warning(sim, 'shed:commercial')!;
    expect(shed.causes).toEqual(expect.arrayContaining(['failed:battery-1']));
    if (!sim.snapshot().orbit.sunlit) expect(shed.causes).toContain('eclipse');
  });

  it('a rack switched off is the root cause of bad air', () => {
    const sim = makeSim();
    sim.command({ type: 'setModuleEnabled', moduleId: 'life-support-1', enabled: false });
    runUntil(sim, () => warning(sim, 'co2') !== undefined, 600);
    expect(warning(sim, 'co2')?.causes).toEqual(['off:life-support-1']);
    expect(rootCauses(sim.snapshot().warnings, 'co2')).toEqual(['off:life-support-1']);
  });

  it('only links to warnings that exist, and a root cause is its own root', () => {
    const sim = makeSim(undefined, breaks('radiator'), { failures: true });
    for (let i = 0; i < 400; i++) {
      sim.tick();
      const ws = sim.snapshot().warnings;
      const keys = new Set(ws.map((w) => w.key));
      for (const w of ws) for (const c of w.causes) expect(keys.has(c)).toBe(true);
    }
    expect(rootCauses(sim.snapshot().warnings, 'failed:radiator-1')).toEqual(['failed:radiator-1']);
  });
});
