import { describe, expect, it } from 'vitest';
import type { SimEvents } from '../src/sim/events';
import { Simulation, type SimSave } from '../src/sim/simulation';
import { labCapacity } from '../src/sim/systems/crew';
import type { ScenarioDef } from '../src/sim/types';
import { baseScenario, defs, flatPace, makeSim, runUntil } from './helpers';

const crewCfg = baseScenario.crew;
const arrival = Math.round(crewCfg.arrivalHours * 60);
const rich = (s: ScenarioDef) => {
  s.economy.startCash = 500;
  s.economy.deliveryHours = 0;
};

describe('crew', () => {
  it('starts with the scenario roster aboard, breathing and on the payroll', () => {
    const s = makeSim().snapshot();
    expect(s.crew.aboard).toBe(crewCfg.roster.length);
    expect(s.lifeSupport.crew).toBe(crewCfg.roster.length);
    expect(s.crew.engineers).toBe(1);
    expect(s.crew.scientists).toBe(2);
    expect(s.crew.bunks).toBe(4);
    expect(s.crew.wagesPerDay).toBeCloseTo(crewCfg.roster.length * crewCfg.wagePerDay);
  });

  it('a hire pays the signing fee now and arrives after the flight, then breathes and is paid', () => {
    const sim = makeSim();
    const arrived: SimEvents['crewArrived'][] = [];
    sim.events.on('crewArrived', (e) => arrived.push(e));
    const cash = sim.snapshot().economy.cash;
    const r = sim.command({ type: 'hireCrew', role: 'engineer' });
    expect(r).toMatchObject({ ok: true });
    let s = sim.snapshot();
    expect(s.economy.cash).toBeCloseTo(cash - crewCfg.signingFee);
    expect(s.crew.aboard).toBe(3);
    expect(s.crew.bunksTaken).toBe(4);
    expect(s.crew.members.at(-1)).toMatchObject({ name: crewCfg.names[0], role: 'engineer', arrivesInHours: crewCfg.arrivalHours });
    sim.run(arrival);
    s = sim.snapshot();
    expect(arrived.map((a) => a.name)).toEqual([crewCfg.names[0]]);
    expect(s.crew.aboard).toBe(4);
    expect(s.crew.engineers).toBe(2);
    expect(s.lifeSupport.crew).toBe(4);
    expect(s.crew.wagesPerDay).toBeCloseTo(4 * crewCfg.wagePerDay);
  });

  it('needs a free bunk: crew quarters make room', () => {
    const sim = makeSim(rich);
    expect(sim.command({ type: 'hireCrew', role: 'scientist' }).ok).toBe(true);
    expect(sim.command({ type: 'hireCrew', role: 'scientist' })).toMatchObject({ ok: false, reason: expect.stringMatching(/bunk/) });
    const port = sim.snapshot().freePorts.find((p) => sim.buildProblem('crew-quarters', p.moduleId, p.portId) === null)!;
    expect(sim.command({ type: 'addModule', defId: 'crew-quarters', to: port.moduleId, port: port.portId }).ok).toBe(true);
    expect(sim.snapshot().crew.bunks).toBe(8);
    expect(sim.command({ type: 'hireCrew', role: 'scientist' }).ok).toBe(true);
  });

  it('one repair team per engineer: none aboard, and the queue stands still', () => {
    const sim = makeSim();
    sim.command({ type: 'repair', moduleId: 'radiator-1' });
    sim.command({ type: 'repair', moduleId: 'array-1' });
    let s = sim.snapshot();
    expect(s.modules.find((m) => m.id === 'array-1')!.repair).toMatchObject({ active: false, queuePosition: 1 });
    sim.command({ type: 'hireCrew', role: 'engineer' });
    sim.run(arrival);
    s = sim.snapshot();
    // Two engineers aboard: both jobs at once (the first may have finished during the flight).
    expect(s.modules.filter((m) => m.repair).every((m) => m.repair!.active)).toBe(true);

    const idle = makeSim();
    for (const m of idle.snapshot().crew.members.filter((m) => m.role === 'engineer')) idle.command({ type: 'dismissCrew', crewId: m.id });
    idle.command({ type: 'repair', moduleId: 'radiator-1' });
    const left = idle.snapshot().modules.find((m) => m.id === 'radiator-1')!.repair!.hoursLeft;
    idle.run(600);
    const after = idle.snapshot();
    expect(after.modules.find((m) => m.id === 'radiator-1')!.repair!.hoursLeft).toBe(left);
    expect(after.warnings.some((w) => w.kind === 'noEngineers')).toBe(true);
  });

  it('labs go to the fastest first, and a lab with no scientist works at the unstaffed share', () => {
    expect(labCapacity([1, 1], [1, 1], 0.5)).toBe(2);
    expect(labCapacity([1, 1], [1], 0.5)).toBe(1.5);
    expect(labCapacity([0.6, 1], [1], 0.5)).toBeCloseTo(1.3);
    expect(labCapacity([1], [], 0.5)).toBe(0.5);
    // The fastest scientist gets the fastest lab.
    expect(labCapacity([0.6, 1], [0.8, 1.1], 0.5)).toBeCloseTo(1.1 + 0.48);
  });

  it('send both scientists home and the lab runs at half pace', () => {
    const progress = (sendHome: boolean) => {
      const sim = makeSim((s) => {
        rich(s);
        flatPace(s);
        s.thermal.throttle = { above: 99, below: 98 };
        s.thermal.trip.commercial = { above: 100, below: 99 };
        for (const c of s.economy.contracts.pool) {
          c.labHours = 100;
          c.deadlineHours = 200;
        }
      });
      const port = sim.snapshot().freePorts.find((p) => sim.buildProblem('research-lab', p.moduleId, p.portId) === null)!;
      sim.command({ type: 'addModule', defId: 'research-lab', to: port.moduleId, port: port.portId });
      sim.command({ type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'zenith' });
      if (sendHome) for (const m of sim.snapshot().crew.members.filter((m) => m.role === 'scientist')) sim.command({ type: 'dismissCrew', crewId: m.id });
      sim.command({ type: 'acceptContract', uid: sim.snapshot().economy.offers[0]!.uid });
      const signed = sim.snapshot();
      sim.run(30);
      return { ...sim.snapshot(), signed };
    };
    const staffed = progress(false);
    const unstaffed = progress(true);
    expect(staffed.economy.active[0]!.progressHours).toBeGreaterThan(0.1);
    expect(unstaffed.economy.active[0]!.progressHours).toBeCloseTo(staffed.economy.active[0]!.progressHours / 2, 3);
    expect(unstaffed.signed.modules.find((m) => m.kind === 'lab')!.status).toBe('powered');
    expect(unstaffed.signed.warnings.some((w) => w.kind === 'labUnstaffed')).toBe(true);
    expect(staffed.signed.warnings.some((w) => w.kind === 'labUnstaffed')).toBe(false);
  });

  it('sending someone home frees their bunk and stops their pay, and cancelling a flight works too', () => {
    const sim = makeSim();
    const hired = sim.command({ type: 'hireCrew', role: 'scientist' });
    const id = hired.ok ? hired.crewId! : '';
    expect(sim.command({ type: 'dismissCrew', crewId: id }).ok).toBe(true);
    sim.run(arrival);
    expect(sim.snapshot().crew.aboard).toBe(3);
    const first = sim.snapshot().crew.members[0]!;
    sim.command({ type: 'dismissCrew', crewId: first.id });
    const s = sim.snapshot();
    expect(s.crew.aboard).toBe(2);
    expect(s.lifeSupport.crew).toBe(2);
    expect(s.crew.wagesPerDay).toBeCloseTo(2 * crewCfg.wagePerDay);
    expect(sim.command({ type: 'dismissCrew', crewId: first.id }).ok).toBe(false);
  });

  it('the roster and anyone in flight survive a save', () => {
    const sim = makeSim();
    sim.command({ type: 'hireCrew', role: 'engineer' });
    sim.run(60);
    const loaded = Simulation.fromSave(defs, sim.scenario, JSON.parse(JSON.stringify(sim.save())) as SimSave, { failures: false });
    expect(loaded.snapshot().crew).toEqual(sim.snapshot().crew);
    runUntil(loaded, () => loaded.snapshot().crew.aboard === 4, arrival);
    expect(loaded.snapshot().lifeSupport.crew).toBe(4);
  });
});
