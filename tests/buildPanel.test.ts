import { describe, expect, it } from 'vitest';
import type { Forecast } from '../src/sim/forecast';
import { moduleHighlights, previewRows } from '../src/ui/buildPanel';
import { defs } from './helpers';

const base: Forecast = {
  minutes: 186,
  minCharge: 0.17,
  maxLoopC: 24.1,
  highestCo2MmHg: 2,
  shedMinutes: 34,
  throttledMinutes: 21,
  trippedMinutes: 0,
  peakGenerationKw: 22,
  waterChangeKg: -1.4,
  people: 7,
  failureChance: 0.2,
  netIncome: 1,
};

describe('build panel helpers', () => {
  it('marks improvements good and regressions bad, and drops rows that do not change', () => {
    const rows = previewRows(base, { ...base, minCharge: 0.3, shedMinutes: 0, throttledMinutes: 59, maxLoopC: 25 });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel['Lowest battery']).toMatchObject({ before: '17%', after: '30%', tone: 'good' });
    expect(byLabel['Load shed']).toMatchObject({ tone: 'good' });
    expect(byLabel['Throttled']).toMatchObject({ tone: 'bad' });
    expect(byLabel['Hottest loop']).toMatchObject({ tone: 'bad' });
    expect(byLabel['Overheated']).toBeUndefined();
    expect(byLabel['People aboard']).toBeUndefined();
  });

  it('always shows battery and loop rows, even when unchanged', () => {
    expect(previewRows(base, base).map((r) => r.label)).toEqual(['Lowest battery', 'Hottest loop']);
    expect(previewRows(base, { ...base, netIncome: 3 }).find((r) => r.label.startsWith('Income'))).toMatchObject({ tone: 'good' });
  });

  it('sums up each module in a few lines', () => {
    const lines = (id: string) => moduleHighlights(defs.find((d) => d.id === id)!).join(' | ');
    expect(lines('solar-array')).toMatch(/\+22\.0 kW in sunlight/);
    expect(lines('battery-pack')).toMatch(/\+9\.0 kWh storage/);
    expect(lines('radiator')).toMatch(/heat rejection/);
    expect(lines('habitat')).toMatch(/4 guests/);
    expect(lines('life-support')).toMatch(/O₂ 7\.2 kg\/day/);
  });
});
