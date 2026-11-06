// The first posting's guide: a handful of steps, each moving on when the player has done the thing (or taps Next).
// Shown once per browser, on a fresh start of the first scenario; skipping or finishing it puts it away for good.

export const TUTORIAL_KEY = 'stationkeeper.tutorial';

/** What the guide can see of the game, read every frame. */
export interface CoachState {
  speed: number;
  /** A module's sheet is open. */
  moduleOpen: boolean;
  financeOpen: boolean;
  buildOpen: boolean;
  crewOpen: boolean;
  /** Modules ordered and on their way, or docked since the start. */
  ordered: boolean;
}

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** A CSS selector for the control the step is about; it pulses while the step is up. */
  target?: string;
  /** Done by doing; steps without one wait for Next. */
  done?: (s: CoachState) => boolean;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'speed',
    title: 'The clock',
    text: 'The clock starts at 1×, the slowest. Try 5× or 20× from the speed buttons at the top; the pause button stops it.',
    target: '.speed[aria-label="Speed 5×"], .speed[aria-label="Speed 20×"]',
    done: (s) => s.speed > 1,
  },
  {
    id: 'module',
    title: 'The modules',
    text: 'Tap a module on the station. Its sheet shows what it does, how worn it is, and a Repair button for when it breaks.',
    done: (s) => s.moduleOpen,
  },
  {
    id: 'finance',
    title: 'The money',
    text: 'The cash button opens Finance: the loan, the goal, and where the money goes. Interest runs at 3% a day, so pay the loan off when you can spare it.',
    target: '.fin-fab',
    done: (s) => s.financeOpen,
  },
  {
    id: 'build',
    title: 'Building',
    text: 'Build adds modules: pick one, then a free port. It arrives on the next launch. More solar, a galley or a cupola all earn their keep.',
    target: '.build-fab',
    done: (s) => s.buildOpen || s.ordered,
  },
  {
    id: 'crew',
    title: 'The crew',
    text: 'Tap the crew count in the top bar. Engineers fix breakdowns, and tired or unhappy crew work slowly.',
    target: '.crew-cell',
    done: (s) => s.crewOpen,
  },
  {
    id: 'warnings',
    title: 'When things go wrong',
    text: 'Worn parts break, and a warning button appears on the right when they do. Send an engineer before the air goes stale. The rest is in How to play, in the menu.',
  },
];

export type TutorialRecord = 'done' | 'skipped';

export function loadTutorial(): TutorialRecord | null {
  try {
    const v = localStorage.getItem(TUTORIAL_KEY);
    return v === 'done' || v === 'skipped' ? v : null;
  } catch {
    return null;
  }
}

export function saveTutorial(v: TutorialRecord | null): void {
  try {
    if (v === null) localStorage.removeItem(TUTORIAL_KEY);
    else localStorage.setItem(TUTORIAL_KEY, v);
  } catch {
    // No storage: the guide may show again next time, which is harmless.
  }
}

/** Steps through the guide. Pure apart from the steps it's given, so it tests without a page. */
export class Tutorial {
  index = 0;
  constructor(readonly steps: readonly TutorialStep[] = TUTORIAL_STEPS) {}

  get step(): TutorialStep | null {
    return this.steps[this.index] ?? null;
  }

  get finished(): boolean {
    return this.index >= this.steps.length;
  }

  /** Move past every step already done. Returns whether the step changed. */
  update(s: CoachState): boolean {
    const before = this.index;
    while (!this.finished && this.step!.done?.(s)) this.index++;
    return this.index !== before;
  }

  next(): void {
    if (!this.finished) this.index++;
  }
}
