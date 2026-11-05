// Words for a scenario's goal: what the board wants, and how far along the station is.
import type { ScenarioRecord } from '../records';
import type { GoalDef, GoalSnapshot } from '../sim/types';
import { minutes, money } from './format';

const days = (d: number) => `${d} ${d === 1 ? 'day' : 'days'}`;

/** "Deliver 6 research contracts within 6 days." */
export function goalLine(g: GoalDef): string {
  const what =
    g.kind === 'repayLoan' ? 'Pay off the loan' : g.kind === 'cash' ? `Build up ${money(g.amount)} in cash` : `Deliver ${g.count} research contracts`;
  return g.days === undefined ? `${what}.` : `${what} within ${days(g.days)}.`;
}

/** "3 of 6 delivered", "$18.0M left to repay". */
export function goalProgress(g: GoalSnapshot): string {
  switch (g.kind) {
    case 'repayLoan':
      return g.current > 0 ? `${money(g.current)} left to repay` : 'Paid off';
    case 'cash':
      return `${money(Math.max(0, g.current))} of ${money(g.target)}`;
    case 'contracts':
      return `${g.current} of ${g.target} delivered`;
  }
}

/** Time left before the board's deadline, or null if there isn't one. */
export function deadlineText(g: GoalSnapshot, nowMinutes: number): string | null {
  if (g.deadlineAtMinutes === null) return null;
  const left = Math.max(0, g.deadlineAtMinutes - nowMinutes);
  const d = Math.floor(left / 1440);
  const h = Math.floor((left % 1440) / 60);
  if (d > 0) return `${d} d ${h} h left`;
  return h > 0 ? `${h} h ${Math.floor(left % 60)} min left` : `${Math.floor(left)} min left`;
}

/** "3 d 4 h", or "14 h 20 min" under a day. */
export function durationText(m: number): string {
  if (m < 1440) return minutes(m);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return h > 0 ? `${d} d ${h} h` : `${d} d`;
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const stations = (n: number) => `${n} ${n === 1 ? 'station' : 'stations'} lost`;

/** "Won twice, fastest in 3 d 4 h · 1 station lost", or null for a scenario never finished either way. */
export function recordLine(r: ScenarioRecord): string | null {
  if (r.wins === 0 && r.losses === 0) return null;
  const won = r.wins > 0 && r.bestMinutes !== null ? `Won ${times(r.wins)}, fastest in ${durationText(r.bestMinutes)}` : 'Not won yet';
  return r.losses > 0 ? `${won} · ${stations(r.losses)}` : won;
}
