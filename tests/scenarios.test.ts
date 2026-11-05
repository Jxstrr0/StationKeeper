import { describe, expect, it } from 'vitest';
import { scenarioById } from '../src/scenarios';
import { Simulation } from '../src/sim/simulation';
import { defs, makeSim } from './helpers';

describe('scenario catalogues', () => {
  it('only sells what the catalogue lists', () => {
    const sim = makeSim((s) => {
      s.catalogue = ['radiator'];
      s.economy.startCash = 500;
    });
    expect(sim.forSale('radiator')).toBe(true);
    expect(sim.forSale('research-lab')).toBe(false);
    expect(sim.forSale('core')).toBe(false); // no price, never for sale
    const port = sim.snapshot().freePorts[0]!;
    expect(sim.buildProblem('research-lab', port.moduleId, port.portId)).toMatch(/not for sale to this station/);
    expect(sim.command({ type: 'addModule', defId: 'research-lab', to: port.moduleId, port: port.portId })).toMatchObject({ ok: false });
  });

  it('without a catalogue, everything with a price is for sale', () => {
    const sim = makeSim();
    expect(defs.filter((d) => sim.forSale(d.id)).map((d) => d.id)).toEqual(defs.filter((d) => d.price !== undefined).map((d) => d.id));
  });

  it('refuses a catalogue naming a module that does not exist or has no price', () => {
    expect(() => makeSim((s) => (s.catalogue = ['warp-drive']))).toThrow(/unknown module "warp-drive"/);
    expect(() => makeSim((s) => (s.catalogue = ['core']))).toThrow(/no price/);
  });
});

describe('Halyard Sunward', () => {
  const halyard = scenarioById('halyard')!;

  it('never leaves the sun', () => {
    const sim = new Simulation(defs, halyard, halyard.layout, { failures: false });
    expect(sim.orbit.eclipseHalfAngle).toBe(0);
    let darkest = 1;
    for (let i = 0; i < Math.ceil(sim.orbit.periodMinutes); i++) {
      sim.tick();
      darkest = Math.min(darkest, sim.snapshot().orbit.sunlight);
    }
    expect(darkest).toBeGreaterThan(0.9);
  });

  it('is a hotel: no labs for sale, no contracts on offer, no scientists', () => {
    const sim = new Simulation(defs, halyard, halyard.layout, { failures: false });
    expect(sim.forSale('research-lab')).toBe(false);
    expect(sim.forSale('habitat')).toBe(true);
    sim.run(2 * 1440);
    expect(sim.snapshot().economy.offers).toEqual([]);
    expect(sim.snapshot().crew.members.every((m) => m.role === 'engineer')).toBe(true);
  });

  it('runs too hot for one radiator in constant sunlight', () => {
    const sim = new Simulation(defs, halyard, halyard.layout, { failures: false });
    sim.run(6 * 60);
    const habitat = sim.snapshot().modules.find((m) => m.kind === 'habitat')!;
    expect(['throttled', 'overheated']).toContain(habitat.status);
  });
});
