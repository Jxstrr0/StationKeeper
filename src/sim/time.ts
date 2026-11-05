// Fixed-tick clock. One tick is one in-game minute. Speed sets ticks per real second.

export const SPEEDS = [0, 1, 5, 20] as const;
export type Speed = (typeof SPEEDS)[number];

/** Upper bound on ticks per frame, so a long frame (tab switch, slow phone) never freezes the game. */
const MAX_TICKS_PER_ADVANCE = 240;

export class Clock {
  private accumulator = 0;
  private lastNonZero: Speed = 1;
  speed: Speed = 1;

  setSpeed(speed: Speed): void {
    this.speed = speed;
    if (speed !== 0) this.lastNonZero = speed;
  }

  togglePause(): void {
    this.setSpeed(this.speed === 0 ? this.lastNonZero : 0);
  }

  /**
   * Advance by real elapsed seconds and return how many sim ticks to run.
   * Leftover time stays in the accumulator.
   */
  advance(realSeconds: number): number {
    if (this.speed === 0 || realSeconds <= 0) return 0;
    this.accumulator += realSeconds * this.speed;
    let ticks = Math.floor(this.accumulator);
    this.accumulator -= ticks;
    if (ticks > MAX_TICKS_PER_ADVANCE) {
      ticks = MAX_TICKS_PER_ADVANCE;
      this.accumulator = 0;
    }
    return ticks;
  }

  /** Fraction of the way to the next tick, 0..1, for smooth visuals between ticks. */
  get alpha(): number {
    return this.accumulator;
  }
}

export const MINUTE_MS = 60_000;
