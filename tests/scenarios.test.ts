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

describe('Saltglass Rest', () => {
  const saltglass = scenarioById('saltglass')!;
  const DAY = 1440;
  /** Buy each module in turn as soon as there is a port for it. */
  const buy = (sim: Simulation, defIds: string[]) => {
    for (const defId of defIds) {
      const port = sim.snapshot().freePorts.find((p) => sim.buildProblem(defId, p.moduleId, p.portId) === null)!;
      expect(sim.command({ type: 'addModule', defId, to: port.moduleId, port: port.portId }).ok).toBe(true);
    }
  };

  it('opens at one star, with two habitats and most of the places unbooked', () => {
    const s = new Simulation(defs, saltglass, saltglass.layout, { failures: false }).snapshot();
    expect(s.guests.stars).toBe(1);
    expect(s.guests.places).toBe(8);
    expect(s.guests.booked).toBeLessThan(4);
    expect(s.ending.goal).toMatchObject({ kind: 'reviews', current: 1, target: 4 });
  });

  it('left as it is, it never earns four stars, and the owners replace you', () => {
    const sim = new Simulation(defs, saltglass, saltglass.layout, { failures: false });
    const posted: number[] = [];
    sim.events.on('guestReviews', (r) => posted.push(r.stars));
    sim.run(9 * DAY);
    expect(posted.length).toBeGreaterThanOrEqual(7);
    expect(Math.max(...posted)).toBeLessThan(4);
    expect(sim.snapshot().ending.outcome).toBe('replaced');
  });

  it('with cooling, storage and generation added, it earns four stars well inside the week', () => {
    const sim = new Simulation(defs, saltglass, saltglass.layout, { failures: false });
    buy(sim, ['radiator', 'battery-pack', 'solar-array']);
    sim.run(6 * DAY);
    const goalAt = sim.snapshot().ending.goalAtMinutes;
    expect(goalAt).not.toBeNull();
    expect(goalAt!).toBeLessThan(saltglass.goal.days! * DAY);
  });
});

describe('Velvet Reach', () => {
  const velvet = scenarioById('velvet-reach')!;
  const DAY = 1440;
  const buy = (sim: Simulation, defIds: string[]) => {
    for (const defId of defIds) {
      const port = sim.snapshot().freePorts.find((p) => sim.buildProblem(defId, p.moduleId, p.portId) === null)!;
      expect(sim.command({ type: 'addModule', defId, to: port.moduleId, port: port.portId }).ok).toBe(true);
    }
  };
  const posted = (sim: Simulation) => {
    const out: number[] = [];
    sim.events.on('guestReviews', (r) => out.push(r.stars));
    return out;
  };

  it('opens as a working three-star hotel that wants five', () => {
    const s = new Simulation(defs, velvet, velvet.layout, { failures: false }).snapshot();
    expect(s.guests.stars).toBe(3);
    expect(s.guests.booked).toBe(s.guests.places);
    expect(s.ending.goal).toMatchObject({ kind: 'reviews', current: 3, target: 5 });
  });

  it('left as it is, it never earns five stars, and the owners replace you', () => {
    const sim = new Simulation(defs, velvet, velvet.layout, { failures: false });
    const stars = posted(sim);
    sim.run(velvet.goal.days! * DAY);
    expect(Math.max(...stars)).toBeLessThan(5);
    expect(sim.snapshot().ending.outcome).toBe('replaced');
  });

  it('a lounge alone is not enough: the battery cannot carry it through eclipse', () => {
    const sim = new Simulation(defs, velvet, velvet.layout, { failures: false });
    const stars = posted(sim);
    buy(sim, ['lounge']);
    sim.run(velvet.goal.days! * DAY);
    expect(Math.max(...stars)).toBeLessThan(5);
  });

  it('with a lounge, a radiator and a battery, it earns five stars inside the deadline', () => {
    const sim = new Simulation(defs, velvet, velvet.layout, { failures: false });
    buy(sim, ['lounge', 'radiator']);
    // Every port is taken until the lounge docks and brings one of its own.
    sim.run(velvet.economy.deliveryHours * 60);
    buy(sim, ['battery-pack']);
    sim.run(velvet.goal.days! * DAY);
    const goalAt = sim.snapshot().ending.goalAtMinutes;
    expect(goalAt).not.toBeNull();
    expect(goalAt!).toBeLessThan(velvet.goal.days! * DAY);
  });
});
