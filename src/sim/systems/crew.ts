// The crew: who is aboard, who is on the way up, and what they do.
// Engineers are the repair teams, one each. Scientists run the labs; a lab without one works slowly.
// Everyone aboard breathes, drinks, and is paid by the day.
import type { EventBus, SimEvents } from '../events';
import type { Station } from '../station';
import type { CrewConfig, CrewRole, CrewSnapshot } from '../types';

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  /** Minute they arrive aboard; at or before now means aboard. */
  arrivesAt: number;
}

export interface CrewState {
  members: CrewMember[];
  /** How many hires so far, for picking names and ids. */
  hires: number;
}

export function createCrewState(cfg: CrewConfig): CrewState {
  return { members: cfg.roster.map((r, i) => ({ id: `crew-${i + 1}`, name: r.name, role: r.role, arrivesAt: 0 })), hires: 0 };
}

export function aboard(state: CrewState, now: number): CrewMember[] {
  return state.members.filter((m) => m.arrivesAt <= now);
}

export function countAboard(state: CrewState, now: number, role?: CrewRole): number {
  return aboard(state, now).filter((m) => role === undefined || m.role === role).length;
}

export function bunks(station: Station): number {
  return station.modules.reduce((n, m) => n + (m.def.cabin?.bunks ?? 0), 0);
}

export function wagesPerDay(state: CrewState, cfg: CrewConfig, now: number): number {
  return countAboard(state, now) * cfg.wagePerDay;
}

/** Why `role` can't be hired now, or null if it can. */
export function hireProblem(state: CrewState, station: Station, cfg: CrewConfig, cash: number): string | null {
  if (state.members.length >= bunks(station)) return 'Every bunk is taken: build crew quarters first';
  if (cash < cfg.signingFee) return 'Not enough cash to sign anyone';
  return null;
}

/** Sign someone up. They fly up and arrive after the arrival time. Returns the new member. Check `hireProblem` first. */
export function hire(state: CrewState, cfg: CrewConfig, role: CrewRole, now: number, events?: EventBus<SimEvents>): CrewMember {
  const n = state.hires++;
  const base = cfg.names[n % cfg.names.length] ?? 'New hire';
  const round = Math.floor(n / Math.max(1, cfg.names.length));
  const name = round === 0 ? base : `${base} ${round + 1}`;
  const member: CrewMember = { id: `crew-${cfg.roster.length + n + 1}`, name, role, arrivesAt: now + Math.round(cfg.arrivalHours * 60) };
  state.members.push(member);
  events?.emit('crewHired', { crewId: member.id, name, role, hours: cfg.arrivalHours });
  return member;
}

/** Send someone home (or cancel their flight up). Returns false if there is no such member. */
export function dismiss(state: CrewState, id: string, now: number, events?: EventBus<SimEvents>): boolean {
  const m = state.members.find((x) => x.id === id);
  if (!m) return false;
  state.members = state.members.filter((x) => x !== m);
  events?.emit('crewLeft', { crewId: m.id, name: m.name, role: m.role, wasAboard: m.arrivesAt <= now });
  return true;
}

/** Emit arrivals for anyone whose flight lands this minute. */
export function stepCrew(state: CrewState, now: number, events?: EventBus<SimEvents>): boolean {
  let arrived = false;
  for (const m of state.members) {
    if (m.arrivesAt === now && now > 0) {
      arrived = true;
      events?.emit('crewArrived', { crewId: m.id, name: m.name, role: m.role });
    }
  }
  return arrived;
}

/**
 * How fast the labs work, as lab-equivalents: each running lab gives its speed (1, or the throttle share),
 * and the fastest labs get the scientists first. A lab nobody staffs works at the unstaffed share.
 */
export function labCapacity(labSpeeds: readonly number[], scientists: number, unstaffedFactor: number): number {
  const sorted = [...labSpeeds].sort((a, b) => b - a);
  return sorted.reduce((sum, speed, i) => sum + speed * (i < scientists ? 1 : unstaffedFactor), 0);
}

export function crewSnapshot(state: CrewState, station: Station, cfg: CrewConfig, now: number): CrewSnapshot {
  const order = [...state.members].sort((a, b) => Number(a.arrivesAt > now) - Number(b.arrivesAt > now));
  return {
    members: order.map((m) => ({ id: m.id, name: m.name, role: m.role, arrivesInHours: m.arrivesAt > now ? (m.arrivesAt - now) / 60 : null })),
    aboard: countAboard(state, now),
    bunks: bunks(station),
    bunksTaken: state.members.length,
    engineers: countAboard(state, now, 'engineer'),
    scientists: countAboard(state, now, 'scientist'),
    labs: station.modules.filter((m) => m.def.kind === 'lab').length,
    wagesPerDay: wagesPerDay(state, cfg, now),
    signingFee: cfg.signingFee,
    wagePerDay: cfg.wagePerDay,
    arrivalHours: cfg.arrivalHours,
  };
}
