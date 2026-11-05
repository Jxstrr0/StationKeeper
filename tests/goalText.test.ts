import { describe, expect, it } from 'vitest';
import type { GoalSnapshot } from '../src/sim/types';
import { deadlineText, goalLine, goalProgress } from '../src/ui/goalText';

const snap = (g: Partial<GoalSnapshot>): GoalSnapshot => ({ kind: 'contracts', current: 0, target: 6, progress: 0, deadlineAtMinutes: null, ...g });

describe('goal text', () => {
  it('says what the board wants, with the deadline when there is one', () => {
    expect(goalLine({ kind: 'repayLoan' })).toBe('Pay off the loan.');
    expect(goalLine({ kind: 'cash', amount: 120, days: 1 })).toBe('Build up $120M in cash within 1 day.');
    expect(goalLine({ kind: 'contracts', count: 6, days: 6 })).toBe('Deliver 6 research contracts within 6 days.');
  });

  it('says how far along the station is', () => {
    expect(goalProgress(snap({ current: 3 }))).toBe('3 of 6 delivered');
    expect(goalProgress(snap({ kind: 'repayLoan', current: 18, target: 0 }))).toBe('$18.0M left to repay');
    expect(goalProgress(snap({ kind: 'repayLoan', current: 0, target: 0 }))).toBe('Paid off');
    expect(goalProgress(snap({ kind: 'cash', current: -4, target: 90 }))).toBe('$0 of $90.0M');
  });

  it('counts down to the deadline', () => {
    expect(deadlineText(snap({}), 0)).toBeNull();
    expect(deadlineText(snap({ deadlineAtMinutes: 6 * 1440 }), 0)).toBe('6 d 0 h left');
    expect(deadlineText(snap({ deadlineAtMinutes: 1440 }), 1440 - 135)).toBe('2 h 15 min left');
    expect(deadlineText(snap({ deadlineAtMinutes: 100 }), 200)).toBe('0 min left');
  });
});

describe('crew text', () => {
  it('sums up who does what', async () => {
    const { crewDuties } = await import('../src/ui/crewPanel');
    const { makeSim } = await import('./helpers');
    expect(crewDuties(makeSim().snapshot())).toBe('1 engineer, 1 repair team · 2 scientists, no labs yet');
  });
});
