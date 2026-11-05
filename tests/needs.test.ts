import { describe, expect, it } from 'vitest';
import type { SimEvents } from '../src/sim/events';
import { Simulation, type SimSave } from '../src/sim/simulation';
import { moraleTarget, pickShift, type CrewMember } from '../src/sim/systems/crew';
import type { ScenarioDef } from '../src/sim/types';
import { baseScenario, defs, makeSim, runUntil } from './helpers';

const needs = baseScenario.crew.needs;
const HOUR = 60;

const person = (id: string, over: Partial<CrewMember> = {}): CrewMember => ({
  id,
  name: id,
  role: 'scientist',
  arrivesAt: 0,
  fatigue: 0,
  morale: 0.8,
  onShift: false,
  exhausted: false,
  sickUntil: null,
  lowSince: null,
  ...over,
});
const ids = (s: Set<CrewMember>) => [...s].map((m) => m.id).sort();

/** A station with a lab running a long contract all day: permanent sunlight, and a radiator big enough for it. */
function labSim(patch: (s: ScenarioDef) => void = () => {}): Simulation {
  const sim = makeSim((s) => {
    s.economy.startCash = 500;
    s.economy.deliveryHours = 0;
    s.orbit.betaDeg = 80;
    s.crew.needs.illness.perDay = 0;
    for (const c of s.economy.contracts.pool) {
      c.labHours = 500;
      c.deadlineHours = 1000;
    }
    patch(s);
  }, (d) => {
    const radiator = d.find((x) => x.id === 'radiator')!;
    radiator.thermal.rejectKw = 40;
  });
  const port = sim.snapshot().freePorts.find((p) => sim.buildProblem('research-lab', p.moduleId, p.portId) === null)!;
  sim.command({ type: 'addModule', defId: 'research-lab', to: port.moduleId, port: port.portId });
  sim.command({ type: 'acceptContract', uid: sim.snapshot().economy.offers[0]!.uid });
  return sim;
}

/** Edit a sim's state through its save, the way a test can reach inside. */
function edit(sim: Simulation, change: (s: SimSave) => void, failures = false): Simulation {
  const s = JSON.parse(JSON.stringify(sim.save())) as SimSave;
  change(s);
  return Simulation.fromSave(defs, sim.scenario, s, { failures });
}

describe('shifts', () => {
  it('a rested worker carries on, and a tired one hands over to someone rested', () => {
    const going = person('a', { onShift: true, fatigue: 0.4 });
    const fresh = person('b', { fatigue: 0.1 });
    expect(ids(pickShift([going, fresh], 1, needs))).toEqual(['a']);
    const flagging = person('a', { onShift: true, fatigue: 0.75 });
    expect(ids(pickShift([flagging, fresh], 1, needs))).toEqual(['b']);
  });

  it('a tired worker carries on when nobody is rested enough to take over', () => {
    const flagging = person('a', { onShift: true, fatigue: 0.75 });
    const halfRested = person('b', { fatigue: 0.5 });
    expect(ids(pickShift([flagging, halfRested], 1, needs))).toEqual(['a']);
    expect(ids(pickShift([flagging, halfRested], 2, needs))).toEqual(['a', 'b']);
    expect(ids(pickShift([flagging, halfRested], 0, needs))).toEqual([]);
  });

  it('two scientists share one lab around the clock without wearing out', () => {
    const sim = labSim();
    const exhausted: SimEvents['crewExhausted'][] = [];
    sim.events.on('crewExhausted', (e) => exhausted.push(e));
    let unstaffed = 0;
    for (let i = 0; i < 2 * 1440; i++) {
      sim.tick();
      const s = sim.snapshot();
      expect(['powered', 'throttled']).toContain(s.modules.find((m) => m.kind === 'lab')!.status);
      if (!s.crew.members.some((m) => m.role === 'scientist' && m.status === 'onShift')) unstaffed++;
    }
    expect(exhausted).toEqual([]);
    expect(unstaffed).toBe(0);
    // Both took turns.
    expect(sim.snapshot().crew.members.filter((m) => m.role === 'scientist').every((m) => m.fatigue > 0 || m.status === 'resting')).toBe(true);
  });

  it('one scientist on a lab works until exhausted, then the lab slows until they have rested', () => {
    const sim = labSim();
    const second = sim.snapshot().crew.members.filter((m) => m.role === 'scientist')[1]!;
    sim.command({ type: 'dismissCrew', crewId: second.id });
    const exhausted: SimEvents['crewExhausted'][] = [];
    sim.events.on('crewExhausted', (e) => exhausted.push(e));
    runUntil(sim, () => exhausted.length > 0, 20 * HOUR);
    const hours = sim.elapsedMinutes / HOUR;
    expect(hours).toBeCloseTo(1 / needs.fatiguePerWorkHour, 0);
    sim.tick();
    const s = sim.snapshot();
    expect(s.crew.fitScientists).toBe(0);
    expect(s.crew.members.find((m) => m.role === 'scientist')!.status).toBe('exhausted');
    expect(s.warnings.find((w) => w.kind === 'labUnstaffed')?.causes).toContain('crewExhausted');
    runUntil(sim, () => sim.snapshot().crew.fitScientists === 1, 12 * HOUR);
    expect(sim.elapsedMinutes / HOUR - hours).toBeCloseTo((1 - needs.restedBelow) / needs.restPerHour, 0);
  });

  it('an exhausted engineer is not a repair team until rested', () => {
    let sim = makeSim();
    sim.command({ type: 'repair', moduleId: 'radiator-1' });
    sim = edit(sim, (s) => {
      const eng = s.crew.members.find((m) => m.role === 'engineer')!;
      eng.fatigue = 1;
      eng.exhausted = true;
    });
    let s = sim.snapshot();
    expect(s.crew.fitEngineers).toBe(0);
    expect(s.modules.find((m) => m.id === 'radiator-1')!.repair).toMatchObject({ active: false });
    expect(s.warnings.find((w) => w.kind === 'noEngineers')).toMatchObject({ value: 1, causes: ['crewExhausted'] });
    runUntil(sim, () => sim.snapshot().crew.fitEngineers === 1, 10 * HOUR);
    sim.tick();
    s = sim.snapshot();
    expect(s.modules.find((m) => m.id === 'radiator-1')!.repair).toMatchObject({ active: true });
    expect(s.crew.members.find((m) => m.role === 'engineer')!.status).toBe('onShift');
  });
});

describe('illness', () => {
  const sickly = (s: ScenarioDef) => (s.crew.needs.illness.perDay = 200);

  it('someone ill is off duty for a while, then recovers', () => {
    const sim = makeSim(sickly);
    const ill: SimEvents['crewFellIll'][] = [];
    const well: SimEvents['crewRecovered'][] = [];
    sim.events.on('crewFellIll', (e) => ill.push(e));
    sim.events.on('crewRecovered', (e) => well.push(e));
    runUntil(sim, () => ill.length > 0, 60);
    const who = sim.snapshot().crew.members.find((m) => m.id === ill[0]!.crewId)!;
    expect(who).toMatchObject({ status: 'sick', sickHoursLeft: needs.illness.hours });
    expect(sim.snapshot().warnings.some((w) => w.kind === 'crewSick')).toBe(true);
    runUntil(sim, () => well.some((w) => w.crewId === who.id), needs.illness.hours * HOUR + 1);
  });

  it('rolls on its own dice: the station dice are untouched by who falls ill', () => {
    const healthy = makeSim((s) => (s.crew.needs.illness.perDay = 0));
    const sickly2 = makeSim(sickly);
    healthy.run(600);
    sickly2.run(600);
    expect(sickly2.rng.getState()).toBe(healthy.rng.getState());
    expect(sickly2.snapshot().crew.members.some((m) => m.status === 'sick')).toBe(true);
  });

  it('is deterministic, and survives a save', () => {
    const a = makeSim((s) => (s.crew.needs.illness.perDay = 5));
    const b = makeSim((s) => (s.crew.needs.illness.perDay = 5));
    a.run(1440);
    b.run(700);
    const loaded = Simulation.fromSave(defs, b.scenario, JSON.parse(JSON.stringify(b.save())) as SimSave, { failures: false });
    loaded.run(740);
    expect(loaded.snapshot().crew).toEqual(a.snapshot().crew);
  });
});

describe('morale', () => {
  it('heads lower for bad air, heat, exhaustion and illness', () => {
    const ok = { badAir: false, hot: false, comfort: 0 };
    const p = needs.morale.penalties;
    expect(moraleTarget(person('a'), ok, needs)).toBeCloseTo(needs.morale.base);
    expect(moraleTarget(person('a'), { badAir: true, hot: true, comfort: 0 }, needs)).toBeCloseTo(needs.morale.base - p.badAir - p.hot);
    expect(moraleTarget(person('a', { fatigue: 0.8 }), ok, needs)).toBeCloseTo(needs.morale.base - p.tired);
    expect(moraleTarget(person('a', { fatigue: 1, exhausted: true, sickUntil: 99 }), ok, needs)).toBeCloseTo(needs.morale.base - p.exhausted - p.sick);
    expect(moraleTarget(person('a', { exhausted: true, sickUntil: 9 }), { badAir: true, hot: true, comfort: 0 }, needs)).toBe(0);
  });

  it('someone miserable long enough resigns, and the station breathes for one fewer', () => {
    const sim = makeSim((s) => {
      s.crew.needs.illness.perDay = 0;
      s.crew.needs.morale.base = 0.1;
    });
    const left: SimEvents['crewLeft'][] = [];
    sim.events.on('crewLeft', (e) => left.push(e));
    runUntil(sim, () => sim.snapshot().crew.members.some((m) => m.resignsInHours !== null), 2 * 1440);
    const s = sim.snapshot();
    const moraleWarning = s.warnings.find((w) => w.kind === 'moraleLow')!;
    expect(moraleWarning).toMatchObject({ severity: 'alarm', hours: needs.morale.resignHours });
    expect(left).toEqual([]);
    runUntil(sim, () => left.length > 0, needs.morale.resignHours * HOUR + 1);
    expect(left[0]).toMatchObject({ reason: 'resigned', wasAboard: true });
    expect(sim.snapshot().lifeSupport.crew).toBe(sim.snapshot().crew.aboard);
    expect(sim.snapshot().crew.aboard).toBeLessThan(baseScenario.crew.roster.length);
  });

  it('recovers when things improve, and the warning clears', () => {
    let sim = makeSim((s) => (s.crew.needs.illness.perDay = 0));
    sim = edit(sim, (s) => {
      for (const m of s.crew.members) m.morale = 0.3;
    });
    expect(sim.snapshot().warnings.some((w) => w.kind === 'moraleLow')).toBe(true);
    runUntil(sim, () => !sim.snapshot().warnings.some((w) => w.kind === 'moraleLow'), 12 * HOUR);
    expect(sim.snapshot().crew.members.every((m) => m.resignsInHours === null)).toBe(true);
  });
});
