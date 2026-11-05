// What guests think of the place. The station has one reputation, 0 (dreadful) to 1 (glowing), that drifts towards
// where the guests' stay is putting it: a hot station, stale air, or a habitat gone dark all pull it down. It sets
// what new guests will pay: fares scale between `fare.worst` and `fare.best` with it. At each quarter's close the
// guests post reviews, scored from the quarter's average and naming what bothered them most, and the reviews set how
// many places are booked for the quarter ahead.
//
// Reputation is the station's, not the guests': it moves with how the station is run even while few are aboard, so
// a station with empty places can still win its guests back. Guest amenities, such as a lounge, lift where it settles
// while they run, which is the only way past four stars.
import type { EventBus, SimEvents } from '../events';
import type { GuestComplaint, GuestConfig, GuestReview } from '../types';

export interface GuestState {
  reputation: number;
  /** Reviews are poor: on below `poor.below`, off again above `poor.above`. */
  poor: boolean;
  /** Share of guest places booked this quarter, 0..1, set at each quarter's close. */
  occupancy: number;
  /** This quarter so far: reputation summed per minute, minutes counted, and minutes each complaint applied. */
  quarter: { sum: number; minutes: number; complaints: Record<GuestComplaint, number> };
}

const noComplaints = (): Record<GuestComplaint, number> => ({ hot: 0, badAir: 0, dark: 0 });

export function createGuestState(cfg: GuestConfig): GuestState {
  return {
    reputation: cfg.start,
    poor: cfg.start < cfg.poor.below,
    occupancy: occupancy(cfg.start, cfg),
    quarter: { sum: 0, minutes: 0, complaints: noComplaints() },
  };
}

/** Share of guest places that get booked at this reputation. */
export function occupancy(reputation: number, cfg: GuestConfig): number {
  const { emptyAt, fullAt } = cfg.bookings;
  return Math.min(1, Math.max(0, (reputation - emptyAt) / (fullAt - emptyAt)));
}

/** Guests aboard a module with `places` guest places, at this occupancy. Whole guests only. */
export function bookedGuests(places: number, occupancy: number): number {
  return Math.round(places * occupancy);
}

/** What the guests are living with this minute. */
export interface GuestInputs {
  /** Guest places on the station, and how many of them are in a habitat that is running. */
  places: number;
  served: number;
  hot: boolean;
  badAir: boolean;
  /** What running guest amenities add to where reputation settles (see `amenityLift`). */
  lift: number;
}

/** What is bothering guests right now. */
export function complaints(inputs: GuestInputs): GuestComplaint[] {
  if (inputs.places === 0) return [];
  const out: GuestComplaint[] = [];
  if (inputs.hot) out.push('hot');
  if (inputs.badAir) out.push('badAir');
  if (inputs.served < inputs.places) out.push('dark');
  return out;
}

/** Where reputation is heading. A habitat gone dark counts by the share of guest places it holds. */
export function reputationTarget(inputs: GuestInputs, cfg: GuestConfig): number {
  if (inputs.places === 0) return cfg.base;
  const p = cfg.penalties;
  let t = cfg.base + inputs.lift;
  if (inputs.hot) t -= p.hot;
  if (inputs.badAir) t -= p.badAir;
  t -= p.dark * (1 - inputs.served / inputs.places);
  return Math.min(1, Math.max(0, t));
}

/**
 * What running amenities add to where reputation settles: each kind's `reputation`, biggest first, each further kind
 * counting for `stack` of the one before. A second lounge of the same kind adds nothing: guests can only sit in one.
 */
export function amenityLift(running: readonly { name: string; reputation: number }[], stack: number): number {
  const best = new Map<string, number>();
  for (const r of running) best.set(r.name, Math.max(best.get(r.name) ?? 0, r.reputation));
  return [...best.values()].sort((a, b) => b - a).reduce((sum, v, i) => sum + v * stack ** i, 0);
}

/** What fares are multiplied by at this reputation. */
export function fareFactor(reputation: number, cfg: GuestConfig): number {
  return cfg.fare.worst + (cfg.fare.best - cfg.fare.worst) * reputation;
}

/** Stars out of five for a reputation. */
export function stars(reputation: number): number {
  return Math.min(5, Math.max(1, 1 + Math.round(reputation * 4)));
}

/** One tick: reputation drifts, and the quarter's tally grows. A station with no guest places stays as it is. */
export function stepGuests(state: GuestState, cfg: GuestConfig, inputs: GuestInputs, dtHours: number): void {
  if (inputs.places === 0) return;
  const target = reputationTarget(inputs, cfg);
  state.reputation += (target - state.reputation) * Math.min(1, cfg.perHour * dtHours);
  if (state.reputation < cfg.poor.below) state.poor = true;
  else if (state.reputation > cfg.poor.above) state.poor = false;
  const q = state.quarter;
  q.sum += state.reputation;
  q.minutes += 1;
  for (const c of complaints(inputs)) q.complaints[c] += 1;
}

/**
 * The quarter has closed: guests post their reviews, the reviews set the bookings for the quarter ahead, and the tally
 * starts again. Nothing is posted, and bookings stand, with no guests.
 */
export function postReviews(state: GuestState, cfg: GuestConfig, events?: EventBus<SimEvents>): GuestReview | null {
  const q = state.quarter;
  let review: GuestReview | null = null;
  if (q.minutes > 0) {
    const average = q.sum / q.minutes;
    // The complaint that applied longest, if it applied for at least a tenth of the quarter.
    const worst = (Object.entries(q.complaints) as [GuestComplaint, number][]).sort((a, b) => b[1] - a[1])[0]!;
    state.occupancy = occupancy(average, cfg);
    review = { stars: stars(average), reputation: average, complaint: worst[1] >= q.minutes * 0.1 ? worst[0] : null, occupancy: state.occupancy };
    events?.emit('guestReviews', review);
  }
  state.quarter = { sum: 0, minutes: 0, complaints: noComplaints() };
  return review;
}
