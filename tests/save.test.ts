import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, Simulation, type SimSave } from '../src/sim/simulation';
import { baseScenario, defs, makeSim } from './helpers';

/** Through JSON and back, the way localStorage will treat it. */
const roundTrip = (save: SimSave): SimSave => JSON.parse(JSON.stringify(save)) as SimSave;

/** A sim with some history: failures on, a module on order, a contract running, a job on the crew's list. */
function playedSim(): Simulation {
  const sim = new Simulation(defs, structuredClone(baseScenario));
  sim.run(600);
  const port = sim.snapshot().freePorts.find((p) => sim.buildProblem('research-lab', p.moduleId, p.portId) === null);
  expect(port).toBeDefined();
  expect(sim.command({ type: 'addModule', defId: 'research-lab', to: port!.moduleId, port: port!.portId }).ok).toBe(true);
  sim.run(300);
  sim.command({ type: 'repair', moduleId: 'core-1' });
  sim.run(400);
  const offer = sim.snapshot().economy.offers[0];
  if (offer) sim.command({ type: 'acceptContract', uid: offer.uid });
  sim.run(97);
  return sim;
}

describe('save and load', () => {
  it('a loaded save carries on exactly like the original, dice and all', () => {
    const sim = playedSim();
    const loaded = Simulation.fromSave(defs, baseScenario, roundTrip(sim.save()));
    expect(loaded.snapshot()).toEqual(sim.snapshot());
    sim.run(3000);
    loaded.run(3000);
    expect(loaded.snapshot()).toEqual(sim.snapshot());
  });

  it('keeps orders in transit: they still dock on time after loading', () => {
    const sim = makeSim((s) => (s.economy.startCash = 500));
    sim.run(30);
    expect(sim.command({ type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'zenith' }).ok).toBe(true);
    const loaded = Simulation.fromSave(defs, baseScenario, roundTrip(sim.save()), { failures: false });
    expect(loaded.snapshot().economy.deliveries).toHaveLength(1);
    loaded.run(baseScenario.economy.deliveryHours * 60);
    expect(loaded.snapshot().modules.some((m) => m.id === 'battery-pack-1')).toBe(true);
  });

  it('a save is a copy: ticking on does not change it', () => {
    const sim = playedSim();
    const save = sim.save();
    const before = JSON.stringify(save);
    sim.run(200);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('refuses saves from another version, another scenario, or with missing modules', () => {
    const save = roundTrip(makeSim().save());
    expect(() => Simulation.fromSave(defs, baseScenario, { ...save, version: (SAVE_VERSION + 1) as typeof SAVE_VERSION })).toThrow(/version/);
    expect(() => Simulation.fromSave(defs, baseScenario, { ...save, scenarioId: 'somewhere-else' })).toThrow(/scenario/);
    const noThermal = roundTrip(save);
    delete noThermal.thermal.modules['core-1'];
    expect(() => Simulation.fromSave(defs, baseScenario, noThermal)).toThrow(/thermal/);
    const unknown = roundTrip(save);
    unknown.layout.push({ id: 'mystery-1', module: 'mystery', attach: { to: 'core-1', port: 'zenith', via: 'aft' } });
    expect(() => Simulation.fromSave(defs, baseScenario, unknown)).toThrow();
  });
});
