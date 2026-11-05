// Words for a scenario's goal: what the board wants, and how far along the station is.
import type { GoalDef, GoalSnapshot } from '../sim/types';
import { money } from './format';

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
