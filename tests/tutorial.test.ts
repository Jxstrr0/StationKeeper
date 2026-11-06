import { describe, expect, it } from 'vitest';
import { Tutorial, TUTORIAL_STEPS, type CoachState } from '../src/tutorial';

const idle: CoachState = { speed: 1, moduleOpen: false, financeOpen: false, buildOpen: false, crewOpen: false, ordered: false };

describe('the first-posting guide', () => {
  it('waits on each step until the player does the thing', () => {
    const t = new Tutorial();
    expect(t.update(idle)).toBe(false);
    expect(t.step?.id).toBe('speed');
    expect(t.update({ ...idle, speed: 5 })).toBe(true);
    expect(t.step?.id).toBe('module');
    // Doing a later step early doesn't skip ahead: only the current step counts.
    t.update({ ...idle, speed: 5, crewOpen: true });
    expect(t.step?.id).toBe('module');
    t.update({ ...idle, moduleOpen: true });
    t.update({ ...idle, financeOpen: true });
    t.update({ ...idle, ordered: true });
    t.update({ ...idle, crewOpen: true });
    expect(t.step?.id).toBe('warnings');
    expect(t.update({ ...idle, speed: 20, crewOpen: true })).toBe(false); // the last step waits for Got it
    t.next();
    expect(t.finished).toBe(true);
    expect(t.step).toBeNull();
  });

  it('can be stepped through with Next alone', () => {
    const t = new Tutorial();
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) t.next();
    expect(t.finished).toBe(true);
    t.next();
    expect(t.index).toBe(TUTORIAL_STEPS.length);
  });

  it('ends on a step with no action, so the player reads the last word', () => {
    expect(TUTORIAL_STEPS.at(-1)!.done).toBeUndefined();
    expect(new Set(TUTORIAL_STEPS.map((s) => s.id)).size).toBe(TUTORIAL_STEPS.length);
  });
});
