import { describe, expect, it } from 'vitest';
import type { ModuleDef, StationWarning } from '../src/sim/types';
import { groupWarnings } from '../src/ui/warningsPanel';
import { makeSim, runUntil } from './helpers';

const w = (key: string, severity: StationWarning['severity'], causes: string[] = []): StationWarning => ({ key, kind: 'co2', severity, causes });

describe('warnings feed grouping', () => {
  it('puts every problem under its root cause, nearest effects first, alarms on top', () => {
    const groups = groupWarnings([
      w('failed:radiator-1', 'alarm'),
      w('loopHot', 'warn', ['failed:radiator-1', 'sunlitRadiators']),
      w('sunlitRadiators', 'info'),
      w('trip:essential', 'alarm', ['loopHot']),
      w('co2', 'warn', ['trip:essential']),
      w('worn:array-1', 'warn'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['failed:radiator-1|sunlitRadiators', 'worn:array-1']);
    expect(groups[0]!.roots.map((r) => r.key)).toEqual(['failed:radiator-1', 'sunlitRadiators']);
    expect(groups[0]!.effects.map((e) => e.key)).toEqual(['loopHot', 'trip:essential', 'co2']);
    expect(groups[0]!.severity).toBe('alarm');
    expect(groups[1]).toMatchObject({ effects: [], severity: 'warn' });
  });

  it('leaves info-only roots out unless they cause something', () => {
    expect(groupWarnings([w('eclipse', 'info'), w('servicing:battery-1', 'info')])).toEqual([]);
  });

  it('groups a real cascade from a failed radiator into one group', () => {
    const sim = makeSim(
      undefined,
      (list: ModuleDef[]) => {
        for (const d of list) if (d.reliability) d.reliability = { ...d.reliability, failPerDay: d.id === 'radiator' ? 1e6 : 1e-12 };
      },
      { failures: true },
    );
    runUntil(sim, () => sim.snapshot().warnings.some((x) => x.key === 'co2'), 600);
    const groups = groupWarnings(sim.snapshot().warnings).filter((x) => x.roots.some((r) => r.key === 'failed:radiator-1'));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.effects.map((e) => e.key)).toEqual(expect.arrayContaining(['loopHot', 'trip:essential', 'co2']));
  });
});
