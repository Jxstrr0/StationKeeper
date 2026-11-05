// The crew: who is aboard, who is on the way up, what they do, and how they're holding up.
// Engineers are the repair teams, one each. Scientists run the labs; a lab without one works slowly.
// Everyone aboard breathes, drinks, and is paid by the day.
//
// Each person also has needs. Work tires them and time off rests them: a tired worker hands over to a rested
// colleague if there is one, and someone who works to the end of their strength is exhausted and off duty until
// rested. Morale drifts towards a level set by how they're living (bad air, a hot station, exhaustion, illness),
// and someone miserable for long enough resigns. Morale also sets how fast they work: a glum crew repairs and
// runs labs slowly, a content one a little quicker. People fall ill now and then, more often when tired or breathing
// bad air, and are off duty until they recover. Illness is rolled on the crew's own seeded rng, so the station's
// failure rolls are unchanged by it.
import type { EventBus, SimEvents } from '../events';
import type { Rng } from '../rng';
import type { Station } from '../station';
import type { ComfortSpec, CrewConfig, CrewMemberSnapshot, CrewNeedsConfig, CrewRole, CrewSnapshot, CrewStatus } from '../types';

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  /** Minute they arrive aboard; at or before now means aboard. */
  arrivesAt: number;
  /** 0 fresh, 1 spent. */
  fatigue: number;
  /** 0 miserable, 1 content. */
  morale: number;
  onShift: boolean;
  /** Worked to full fatigue; off duty until rested. */
  exhausted: boolean;
  /** Minute they're well again, while ill. */
  sickUntil: number | null;
  /** Minute morale fell below the resignation line, while it stays there. */
  lowSince: number | null;
}

export interface CrewState {
  members: CrewMember[];
  /** How many hires so far, for picking names and ids. */
  hires: number;
  /** Minute the last bonus was paid, if one has been. */
  bonusAt: number | null;
}

function newMember(id: string, name: string, role: CrewRole, arrivesAt: number, needs: CrewNeedsConfig): CrewMember {
  return { id, name, role, arrivesAt, fatigue: 0, morale: needs.morale.start, onShift: false, exhausted: false, sickUntil: null, lowSince: null };
}

export function createCrewState(cfg: CrewConfig): CrewState {
  return { members: cfg.roster.map((r, i) => newMember(`crew-${i + 1}`, r.name, r.role, 0, cfg.needs)), hires: 0, bonusAt: null };
}

export function aboard(state: CrewState, now: number): CrewMember[] {
  return state.members.filter((m) => m.arrivesAt <= now);
}

export function countAboard(state: CrewState, now: number, role?: CrewRole): number {
  return aboard(state, now).filter((m) => role === undefined || m.role === role).length;
}

/** How fast someone works at this morale: 1 is full speed. Linear from `floor` at 0 to 1 at `steadyAt`, then to `best` at 1. */
export function workPace(morale: number, needs: CrewNeedsConfig): number {
  const { floor, steadyAt, best } = needs.morale.pace;
  if (morale <= steadyAt) return floor + (1 - floor) * (morale / steadyAt);
  return 1 + (best - 1) * ((morale - steadyAt) / (1 - steadyAt));
}

/** The work paces of those of `role` fit to work, fastest first: the order they're given the work in. */
export function fitPaces(state: CrewState, now: number, role: CrewRole, needs: CrewNeedsConfig): number[] {
  return state.members
    .filter((m) => m.role === role && isFit(m, now))
    .map((m) => workPace(m.morale, needs))
    .sort((a, b) => b - a);
}

/** Aboard, not ill, and not exhausted. */
export function isFit(m: CrewMember, now: number): boolean {
  return m.arrivesAt <= now && m.sickUntil === null && !m.exhausted;
}

/** How many of `role` are fit to work. Fit engineers are the repair teams; fit scientists run the labs. */
export function countFit(state: CrewState, now: number, role: CrewRole): number {
  return state.members.filter((m) => m.role === role && isFit(m, now)).length;
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
  const member = newMember(`crew-${cfg.roster.length + n + 1}`, name, role, now + Math.round(cfg.arrivalHours * 60), cfg.needs);
  state.members.push(member);
  events?.emit('crewHired', { crewId: member.id, name, role, hours: cfg.arrivalHours });
  return member;
}

/** Send someone home (or cancel their flight up). Returns false if there is no such member. */
export function dismiss(state: CrewState, id: string, now: number, events?: EventBus<SimEvents>): boolean {
  const m = state.members.find((x) => x.id === id);
  if (!m) return false;
  state.members = state.members.filter((x) => x !== m);
  events?.emit('crewLeft', { crewId: m.id, name: m.name, role: m.role, wasAboard: m.arrivesAt <= now, reason: 'dismissed' });
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

/** What the station is asking of the crew this minute, and what they're living with. */
export interface NeedsInputs {
  /** How many of each role have work: repair jobs under way, and labs running a contract. */
  demand: Record<CrewRole, number>;
  /** CO₂ high, oxygen or water low. */
  badAir: boolean;
  /** The coolant loop is running hot. */
  hot: boolean;
  /** What running comforts add to where morale settles. */
  comfort: number;
}

/**
 * What running comforts add to everyone's morale: the best lift on offer, shared out if there are more people
 * aboard than seats.
 */
export function comfortLift(running: readonly ComfortSpec[], aboardCount: number): { lift: number; seats: number } {
  const seats = running.reduce((n, c) => n + c.seats, 0);
  const best = running.reduce((m, c) => Math.max(m, c.morale), 0);
  return { lift: aboardCount > 0 ? best * Math.min(1, seats / aboardCount) : best, seats };
}

/** Why a bonus can't be paid now, or null if it can. */
export function bonusProblem(state: CrewState, cfg: CrewConfig, cash: number, now: number): string | null {
  const people = countAboard(state, now);
  if (people === 0) return 'Nobody aboard to pay';
  const ready = bonusReadyInHours(state, cfg, now);
  if (ready !== null) return `Another bonus so soon would set a precedent: wait ${Math.ceil(ready)} h`;
  if (cash < people * cfg.bonus.perPerson) return 'Not enough cash for a bonus';
  return null;
}

export function bonusReadyInHours(state: CrewState, cfg: CrewConfig, now: number): number | null {
  if (state.bonusAt === null) return null;
  const left = state.bonusAt + cfg.bonus.cooldownHours * 60 - now;
  return left > 0 ? left / 60 : null;
}

/** Pay everyone aboard a bonus and lift their morale. Returns the cost. Check `bonusProblem` first. */
export function payBonus(state: CrewState, cfg: CrewConfig, now: number, events?: EventBus<SimEvents>): number {
  const here = aboard(state, now);
  for (const m of here) {
    m.morale = Math.min(1, m.morale + cfg.bonus.morale);
    if (m.morale >= cfg.needs.morale.resignBelow) m.lowSince = null;
  }
  state.bonusAt = now;
  const cost = here.length * cfg.bonus.perPerson;
  events?.emit('crewBonusPaid', { cost, people: here.length });
  return cost;
}

/**
 * Who works the shifts this minute, out of those fit to. Rested people already on shift carry on. A tired one
 * hands over to someone rested, if there is anyone; otherwise they carry on until exhausted.
 */
export function pickShift(fit: readonly CrewMember[], demand: number, needs: CrewNeedsConfig): Set<CrewMember> {
  const byFatigue = (a: CrewMember, b: CrewMember) => a.fatigue - b.fatigue || (a.id < b.id ? -1 : 1);
  const tired = (m: CrewMember) => m.fatigue >= needs.tiredAbove;
  const going = fit.filter((m) => m.onShift && !tired(m)).sort(byFatigue);
  const fresh = fit.filter((m) => !m.onShift && m.fatigue < needs.restedBelow).sort(byFatigue);
  const flagging = fit.filter((m) => m.onShift && tired(m)).sort(byFatigue);
  const rest = fit.filter((m) => !m.onShift && m.fatigue >= needs.restedBelow).sort(byFatigue);
  return new Set([...going, ...fresh, ...flagging, ...rest].slice(0, Math.max(0, demand)));
}

/** Where someone's morale is heading, given how they're living right now. */
export function moraleTarget(m: CrewMember, inputs: Pick<NeedsInputs, 'badAir' | 'hot' | 'comfort'>, needs: CrewNeedsConfig): number {
  const p = needs.morale.penalties;
  let t = needs.morale.base + inputs.comfort;
  if (m.exhausted) t -= p.exhausted;
  else if (m.fatigue >= needs.tiredAbove) t -= p.tired;
  if (m.sickUntil !== null) t -= p.sick;
  if (inputs.badAir) t -= p.badAir;
  if (inputs.hot) t -= p.hot;
  return Math.min(1, Math.max(0, t));
}

/**
 * One tick of needs for everyone aboard: shifts, fatigue, illness, morale, and resignations.
 * Returns true if anyone left, so the caller can rebuild what depends on who is aboard.
 */
export function stepNeeds(
  state: CrewState,
  needs: CrewNeedsConfig,
  inputs: NeedsInputs,
  opts: { now: number; dtHours: number; rng: Rng; events?: EventBus<SimEvents> },
): boolean {
  const { now, dtHours, rng, events } = opts;
  const here = aboard(state, now);
  const working = new Set<CrewMember>();
  for (const role of ['engineer', 'scientist'] as const) {
    const fit = here.filter((m) => m.role === role && isFit(m, now));
    for (const m of pickShift(fit, inputs.demand[role], needs)) working.add(m);
  }

  const leaving: CrewMember[] = [];
  for (const m of here) {
    const who = { crewId: m.id, name: m.name, role: m.role };
    m.onShift = working.has(m);
    m.fatigue = Math.min(1, Math.max(0, m.fatigue + (m.onShift ? needs.fatiguePerWorkHour : -needs.restPerHour) * dtHours));
    if (m.onShift && m.fatigue >= 1) {
      m.exhausted = true;
      m.onShift = false;
      events?.emit('crewExhausted', who);
    } else if (m.exhausted && m.fatigue < needs.restedBelow) {
      m.exhausted = false;
    }

    if (m.sickUntil !== null && now >= m.sickUntil) {
      m.sickUntil = null;
      events?.emit('crewRecovered', who);
    } else if (m.sickUntil === null) {
      const ill = needs.illness;
      const chance = ill.perDay * (dtHours / 24) * (m.fatigue >= needs.tiredAbove ? ill.tiredFactor : 1) * (inputs.badAir ? ill.badAirFactor : 1);
      if (rng.next() < chance) {
        m.sickUntil = now + Math.round(ill.hours * 60);
        m.onShift = false;
        events?.emit('crewFellIll', { ...who, hours: ill.hours });
      }
    }

    const target = moraleTarget(m, inputs, needs);
    m.morale += (target - m.morale) * Math.min(1, needs.morale.perHour * dtHours);
    if (m.morale < needs.morale.resignBelow) {
      m.lowSince ??= now;
      if (now - m.lowSince >= needs.morale.resignHours * 60) leaving.push(m);
    } else {
      m.lowSince = null;
    }
  }
  for (const m of leaving) {
    state.members = state.members.filter((x) => x !== m);
    events?.emit('crewLeft', { crewId: m.id, name: m.name, role: m.role, wasAboard: true, reason: 'resigned' });
  }
  return leaving.length > 0;
}

/**
 * How fast each running lab works, fastest first: its speed (1, or the throttle share) times the pace of the
 * scientist running it. The fastest labs get the fastest scientists; a lab nobody staffs works at the unstaffed share.
 */
export function labRates(labSpeeds: readonly number[], scientistPaces: readonly number[], unstaffedFactor: number): number[] {
  const labs = [...labSpeeds].sort((a, b) => b - a);
  const paces = [...scientistPaces].sort((a, b) => b - a);
  return labs.map((speed, i) => speed * (paces[i] ?? unstaffedFactor)).sort((a, b) => b - a);
}

/** All the labs together, as lab-equivalents. */
export function labCapacity(labSpeeds: readonly number[], scientistPaces: readonly number[], unstaffedFactor: number): number {
  return labRates(labSpeeds, scientistPaces, unstaffedFactor).reduce((sum, r) => sum + r, 0);
}

function status(m: CrewMember, now: number): CrewStatus {
  if (m.arrivesAt > now) return 'inFlight';
  if (m.sickUntil !== null) return 'sick';
  if (m.exhausted) return 'exhausted';
  return m.onShift ? 'onShift' : 'resting';
}

function memberSnapshot(m: CrewMember, needs: CrewNeedsConfig, now: number): CrewMemberSnapshot {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    arrivesInHours: m.arrivesAt > now ? (m.arrivesAt - now) / 60 : null,
    status: status(m, now),
    fatigue: m.fatigue,
    morale: m.morale,
    tired: m.fatigue >= needs.tiredAbove,
    sickHoursLeft: m.sickUntil === null ? null : Math.max(0, m.sickUntil - now) / 60,
    resignsInHours: m.lowSince === null ? null : Math.max(0, m.lowSince + needs.morale.resignHours * 60 - now) / 60,
    moraleLow: m.arrivesAt <= now && m.morale < needs.morale.low.below,
    pace: workPace(m.morale, needs),
  };
}

export function crewSnapshot(state: CrewState, station: Station, cfg: CrewConfig, now: number, comfort: { lift: number; seats: number }): CrewSnapshot {
  const order = [...state.members].sort((a, b) => Number(a.arrivesAt > now) - Number(b.arrivesAt > now));
  return {
    members: order.map((m) => memberSnapshot(m, cfg.needs, now)),
    aboard: countAboard(state, now),
    bunks: bunks(station),
    bunksTaken: state.members.length,
    engineers: countAboard(state, now, 'engineer'),
    scientists: countAboard(state, now, 'scientist'),
    fitEngineers: countFit(state, now, 'engineer'),
    fitScientists: countFit(state, now, 'scientist'),
    labs: station.modules.filter((m) => m.def.kind === 'lab').length,
    wagesPerDay: wagesPerDay(state, cfg, now),
    signingFee: cfg.signingFee,
    wagePerDay: cfg.wagePerDay,
    arrivalHours: cfg.arrivalHours,
    comfortLift: comfort.lift,
    comfortSeats: comfort.seats,
    bonusCost: countAboard(state, now) * cfg.bonus.perPerson,
    bonusMorale: cfg.bonus.morale,
    bonusReadyInHours: bonusReadyInHours(state, cfg, now),
  };
}
