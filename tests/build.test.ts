import { describe, expect, it } from 'vitest';
import { forecast } from '../src/sim/forecast';
import type { ScenarioDef } from '../src/sim/types';
import { makeSim } from './helpers';

/** These tests are about installing modules: no delivery wait, and cash to spare. */
const instant = (s: ScenarioDef) => {
  s.economy.deliveryHours = 0;
  s.economy.startCash = 500;
};

describe('building modules', () => {
  it('lists free ports and removes them once used', () => {
    const sim = makeSim(instant);
    const free = sim.snapshot().freePorts;
    expect(free).toContainEqual({ moduleId: 'core-1', portId: 'zenith' });
    expect(free).not.toContainEqual({ moduleId: 'core-1', portId: 'fore' });
    const r = sim.command({ type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'zenith' });
    expect(r).toEqual({ ok: true, moduleId: 'battery-pack-1' });
    expect(sim.snapshot().freePorts).not.toContainEqual({ moduleId: 'core-1', portId: 'zenith' });
  });

  it('attaches by the new module’s first port and shows up in the snapshot', () => {
    const sim = makeSim(instant);
    sim.command({ type: 'addModule', defId: 'habitat', to: 'habitat-1', port: 'fore' });
    const m = sim.snapshot().modules.find((x) => x.id === 'habitat-2')!;
    expect(m.attach).toEqual({ to: 'habitat-1', port: 'fore', via: 'aft' });
    expect(m.status).toBe('powered');
  });

  it('refuses used ports, unknown ports, and unknown modules', () => {
    const sim = makeSim(instant);
    expect(sim.command({ type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'fore' })).toMatchObject({ ok: false, reason: /in use/ });
    expect(sim.command({ type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'nope' })).toMatchObject({ ok: false, reason: /no port/ });
    expect(sim.command({ type: 'addModule', defId: 'warp-drive', to: 'core-1', port: 'zenith' })).toMatchObject({ ok: false, reason: /Unknown/ });
    expect(sim.command({ type: 'addModule', defId: 'battery-pack', to: 'ghost-1', port: 'zenith' })).toMatchObject({ ok: false, reason: /not on the station/ });
    expect(sim.snapshot().modules).toHaveLength(6);
  });

  it('a new battery adds storage, arriving half charged', () => {
    const sim = makeSim(instant);
    const before = sim.snapshot().power;
    sim.command({ type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'zenith' });
    const after = sim.snapshot().power;
    expect(after.capacityKwh).toBeCloseTo(before.capacityKwh + 9);
    expect(after.storedKwh).toBeCloseTo(before.storedKwh + 4.5);
  });

  it('a new radiator adds rejection; a new habitat adds guests, volume, and load', () => {
    const sim = makeSim(instant);
    const cap = sim.snapshot().thermal.capacityKw;
    sim.command({ type: 'addModule', defId: 'radiator', to: 'core-1', port: 'zenith' });
    expect(sim.snapshot().thermal.capacityKw).toBeGreaterThan(cap);

    const ls = sim.snapshot().lifeSupport;
    const load = sim.snapshot().power.demandKw;
    sim.command({ type: 'addModule', defId: 'habitat', to: 'habitat-1', port: 'fore' });
    const after = sim.snapshot();
    expect(after.lifeSupport.guests).toBe(ls.guests + 4);
    expect(after.lifeSupport.volumeM3).toBe(ls.volumeM3 + 90);
    expect(after.power.demandKw).toBeCloseTo(load + 6);
  });

  it('a fork runs exactly like the original and does not touch it', () => {
    const sim = makeSim(instant);
    sim.run(137);
    const fork = sim.fork();
    const before = sim.snapshot();
    fork.run(300);
    expect(sim.snapshot()).toEqual(before);
    sim.run(300);
    expect(fork.snapshot()).toEqual(sim.snapshot());
  });

  it('forecast: a second battery stops the end-of-eclipse shed', () => {
    const sim = makeSim(instant);
    const orbit = Math.ceil(sim.orbit.periodMinutes) * 2;
    const base = forecast(sim, orbit)!;
    const withBattery = forecast(sim, orbit, { type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'zenith' })!;
    expect(base.shedMinutes).toBeGreaterThan(0);
    expect(withBattery.shedMinutes).toBe(0);
    expect(withBattery.minCharge).toBeGreaterThan(base.minCharge);
  });

  it('forecast: a second radiator stops the sunset throttle', () => {
    const sim = makeSim(instant);
    const orbit = Math.ceil(sim.orbit.periodMinutes) * 2;
    const base = forecast(sim, orbit)!;
    const withRadiator = forecast(sim, orbit, { type: 'addModule', defId: 'radiator', to: 'core-1', port: 'zenith' })!;
    expect(base.throttledMinutes).toBeGreaterThan(0);
    expect(withRadiator.throttledMinutes).toBe(0);
    expect(withRadiator.maxLoopC).toBeLessThan(base.maxLoopC);
  });

  it('forecast returns null for a refused change and leaves the real sim alone', () => {
    const sim = makeSim(instant);
    const before = sim.snapshot();
    expect(forecast(sim, 10, { type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'fore' })).toBeNull();
    forecast(sim, 50, { type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'zenith' });
    expect(sim.snapshot()).toEqual(before);
  });
});
