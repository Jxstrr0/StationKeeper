import { describe, expect, it } from 'vitest';
import type { CrewMemberSnapshot, StationWarning } from '../src/sim/types';
import { crewDuties, memberReadings, memberStatusText } from '../src/ui/crewPanel';
import { warningTitle } from '../src/ui/warningText';
import { makeSim } from './helpers';

const member = (over: Partial<CrewMemberSnapshot> = {}): CrewMemberSnapshot => ({
  id: 'crew-1',
  name: 'Ines Varga',
  role: 'engineer',
  arrivesInHours: null,
  status: 'resting',
  fatigue: 0.4,
  morale: 0.72,
  tired: false,
  sickHoursLeft: null,
  resignsInHours: null,
  moraleLow: false,
  pace: 1,
  ...over,
});
const warning = (over: Partial<StationWarning>): StationWarning => ({ key: 'k', kind: 'crewSick', severity: 'info', causes: [], ...over });

describe('crew text', () => {
  it('says what each person is doing', () => {
    expect(memberStatusText(member())).toBe('Off shift');
    expect(memberStatusText(member({ status: 'onShift' }))).toBe('On shift');
    expect(memberStatusText(member({ status: 'onShift', tired: true }))).toBe('On shift, tiring');
    expect(memberStatusText(member({ status: 'exhausted' }))).toBe('Exhausted, resting');
    expect(memberStatusText(member({ status: 'sick', sickHoursLeft: 9.5 }))).toBe('Ill, back in 9 h 30 min');
    expect(memberStatusText(member({ status: 'inFlight', arrivesInHours: 3 }))).toBe('Arrives in 3 h');
  });

  it('gives fatigue and morale, and a resignation countdown', () => {
    expect(memberReadings(member())).toBe('Fatigue 40% · Morale 72%');
    expect(memberReadings(member({ morale: 0.2, resignsInHours: 5 }))).toBe('Fatigue 40% · Morale 20% · resigns in 5 h');
    expect(memberReadings(member({ morale: 0.3, pace: 0.79, resignsInHours: 5 }))).toBe('Fatigue 40% · Morale 30% · pace 79% · resigns in 5 h');
    expect(memberReadings(member({ pace: 0.996 }))).toBe('Fatigue 40% · Morale 72%');
  });

  it('counts only engineers fit to work as repair teams', async () => {
    const { Simulation } = await import('../src/sim/simulation');
    const { defs } = await import('./helpers');
    const sim = makeSim();
    const save = JSON.parse(JSON.stringify(sim.save())) as ReturnType<typeof sim.save>;
    save.crew.members.find((m) => m.role === 'engineer')!.sickUntil = 600;
    const ill = Simulation.fromSave(defs, sim.scenario, save, { failures: false });
    expect(crewDuties(ill.snapshot())).toBe('1 engineer, none fit to work · 2 scientists, no labs yet');
  });

  it('names who is off duty or unhappy in the warnings', () => {
    const none = () => undefined;
    expect(warningTitle(warning({ kind: 'crewSick', value: 1, label: 'Ines Varga' }), none)).toBe('Ines Varga is ill and off duty');
    expect(warningTitle(warning({ kind: 'crewExhausted', value: 2, label: 'Ines Varga' }), none)).toBe('2 crew exhausted and off duty');
    expect(warningTitle(warning({ kind: 'moraleLow', value: 0.35, label: 'Tomas Okafor' }), none)).toBe("Tomas Okafor's morale is low at 35%, and their work is slowing");
    expect(warningTitle(warning({ kind: 'moraleLow', value: 0.2, label: 'Tomas Okafor', hours: 4 }), none)).toBe('Tomas Okafor at 20% morale: resigns in 4 h');
    expect(warningTitle(warning({ kind: 'noEngineers', value: 1 }), none)).toBe('No engineer fit to work: repairs wait');
    expect(warningTitle(warning({ kind: 'noEngineers', value: 0 }), none)).toBe("No engineers aboard: repairs can't start");
  });
});
