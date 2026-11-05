import { describe, expect, it } from 'vitest';
import { solveNetwork, type NetworkInput } from '../src/sim/network';

const thresholds = {
  commercial: { shedBelow: 0.25, restoreAbove: 0.4 },
  essential: { shedBelow: 0.1, restoreAbove: 0.2 },
  critical: { shedBelow: 0, restoreAbove: 0 },
};

function input(over: Partial<NetworkInput> = {}): NetworkInput {
  return {
    supply: 0,
    store: { stored: 5, capacity: 10, maxIn: 8, maxOut: 20 },
    loads: [
      { id: 'core', demand: 5, tier: 'critical' },
      { id: 'gimbal', demand: 0.5, tier: 'essential' },
      { id: 'hab', demand: 6, tier: 'commercial' },
    ],
    shedTiers: { critical: false, essential: false, commercial: false },
    thresholds,
    dtHours: 1 / 60,
    ...over,
  };
}

describe('network solver', () => {
  it('serves everything when there is enough', () => {
    const r = solveNetwork(input());
    expect([...r.served].sort()).toEqual(['core', 'gimbal', 'hab']);
    expect(r.flowOut).toBeCloseTo(11.5);
    expect(r.stored).toBeCloseTo(5 - 11.5 / 60);
  });

  it('charges from surplus up to the charge limit and curtails the rest', () => {
    const r = solveNetwork(input({ supply: 30 }));
    expect(r.flowIn).toBe(8);
    expect(r.curtailed).toBeCloseTo(30 - 11.5 - 8);
  });

  it('sheds commercial below its threshold, then essential below its own', () => {
    const lowish = solveNetwork(input({ store: { stored: 2, capacity: 10, maxIn: 8, maxOut: 20 } }));
    expect(lowish.shed.has('hab')).toBe(true);
    expect(lowish.shed.has('gimbal')).toBe(false);

    const low = solveNetwork(input({ store: { stored: 0.5, capacity: 10, maxIn: 8, maxOut: 20 } }));
    expect(low.shed.has('hab')).toBe(true);
    expect(low.shed.has('gimbal')).toBe(true);
    expect(low.served.has('core')).toBe(true);
  });

  it('uses hysteresis: a shed tier stays shed until the restore threshold', () => {
    const shed = { critical: false, essential: false, commercial: true };
    const between = solveNetwork(input({ shedTiers: shed, store: { stored: 3, capacity: 10, maxIn: 8, maxOut: 20 } }));
    expect(between.shedTiers.commercial).toBe(true);
    const above = solveNetwork(input({ shedTiers: shed, store: { stored: 4.5, capacity: 10, maxIn: 8, maxOut: 20 } }));
    expect(above.shedTiers.commercial).toBe(false);
  });

  it('sheds commercial before essential when the discharge limit is hit', () => {
    const r = solveNetwork(input({ store: { stored: 8, capacity: 10, maxIn: 8, maxOut: 6 } }));
    expect(r.shed.has('hab')).toBe(true);
    expect(r.served.has('gimbal')).toBe(true);
    expect(r.served.has('core')).toBe(true);
  });

  it('never sheds critical while any energy remains', () => {
    const r = solveNetwork(input({ store: { stored: 0.01, capacity: 10, maxIn: 8, maxOut: 20 } }));
    expect(r.served.has('core')).toBe(true);
    expect(r.stored).toBe(0);
  });

  it('sheds critical only when the store is empty and supply is short', () => {
    const empty = { stored: 0, capacity: 10, maxIn: 8, maxOut: 20 };
    expect(solveNetwork(input({ store: empty })).shed.has('core')).toBe(true);
    expect(solveNetwork(input({ store: empty, supply: 6 })).served.has('core')).toBe(true);
  });
});
