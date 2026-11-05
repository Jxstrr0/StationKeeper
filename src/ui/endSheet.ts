// The end of a game: lost (the bank takes the station, or the crew are evacuated) or the goal reached.
// A loss holds the game for good; reaching the goal lets the player keep going.
import type { GoalKind, Outcome } from '../sim/types';
import { el, setClass } from './dom';
import { money } from './format';

export type EndKind = Outcome | 'goal';

export interface EndStats {
  days: number;
  cash: number;
  loan: number;
  modules: number;
  /** Every quarter's books added up, $ millions. */
  lifetimeNet: number;
}

interface Copy {
  kicker: string;
  title: string;
  text: string;
}

const LOSS: Record<Outcome, Copy> = {
  bankrupt: {
    kicker: 'Game over',
    title: 'The bank has taken the station',
    text: 'A recovery team docked, changed the hatch codes, and thanked you for your service. You may keep the mug.',
  },
  evacuated: {
    kicker: 'Game over',
    title: 'The crew have been evacuated',
    text: 'They rode the return capsule home and are fine, if short of breath. The station is mothballed, and they have some notes.',
  },
  replaced: {
    kicker: 'Game over',
    title: 'The board has replaced you',
    text: 'The deadline came and went. Your successor starts on Monday and has already asked where the good mugs are.',
  },
};

/** The goal sheet's words, by goal. `target` is the cash amount or contract count. */
function goalCopy(kind: GoalKind, target: number): Copy {
  switch (kind) {
    case 'repayLoan':
      return {
        kicker: 'Goal reached',
        title: 'The loan is paid off',
        text: 'The station is yours outright. The bank sent a card. Keep going and see what else it can earn.',
      };
    case 'cash':
      return {
        kicker: 'Goal reached',
        title: `${money(target)} in the bank`,
        text: 'The board has the number it wanted, and has already started wanting a bigger one. Keep going and give it one.',
      };
    case 'contracts':
      return {
        kicker: 'Goal reached',
        title: `${target} contracts delivered`,
        text: 'The labs have earned their keep and the sponsors are calling back. Keep going and see what else the station can do.',
      };
  }
}

export function endCopy(kind: EndKind, goal: { kind: GoalKind; target: number }): Copy {
  return kind === 'goal' ? goalCopy(goal.kind, goal.target) : LOSS[kind];
}

export class EndSheet {
  readonly root = el('div', 'report-scrim end-scrim');
  private readonly card = el('section', 'report-sheet end-sheet');
  private readonly body = el('div', 'report-body');
  private readonly actions = el('div', 'end-actions');
  private kind: EndKind | null = null;

  constructor(
    parent: HTMLElement,
    private readonly handlers: { onKeepGoing(): void; onNewGame(): void },
  ) {
    this.card.append(this.body, this.actions);
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.root.append(this.card);
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.kind !== null;
  }

  /** What's showing: a loss can't be closed, only replaced by a new game. */
  get showing(): EndKind | null {
    return this.kind;
  }

  show(kind: EndKind, goal: { kind: GoalKind; target: number }, stats: EndStats): void {
    this.kind = kind;
    const c = endCopy(kind, goal);
    const row = (label: string, value: string, cls = '') => el('div', `report-row ${cls}`, [el('span', '', [label]), el('b', '', [value])]);
    const days = stats.days < 1 ? 'Less than a day' : `${Math.floor(stats.days)} ${Math.floor(stats.days) === 1 ? 'day' : 'days'}`;
    this.body.replaceChildren(
      el('p', 'report-kicker', [c.kicker]),
      el('h2', 'end-title', [c.title]),
      el('p', 'report-verdict', [c.text]),
      el('div', 'report-rows', [
        row('Time in orbit', days),
        row('Modules', String(stats.modules)),
        row('Cash', money(stats.cash), stats.cash < 0 ? 'out' : ''),
        row('Loan', stats.loan > 0 ? money(stats.loan) : 'Paid off'),
        row('Result, all quarters', money(stats.lifetimeNet), stats.lifetimeNet >= 0 ? 'in' : 'out'),
      ]),
    );
    const button = (label: string, cls: string, act: () => void) => {
      const b = el('button', `warn-act report-continue ${cls}`, [label]);
      b.type = 'button';
      b.addEventListener('click', act);
      return b;
    };
    const fresh = button('Start a new station', kind === 'goal' ? '' : 'primary', () => this.handlers.onNewGame());
    if (kind === 'goal') {
      const keep = button('Keep going', 'primary', () => this.keepGoing());
      this.actions.replaceChildren(keep, fresh);
      keep.focus({ preventScroll: true });
    } else {
      this.actions.replaceChildren(fresh);
      fresh.focus({ preventScroll: true });
    }
    setClass(this.root, 'open', true);
    this.root.setAttribute('aria-hidden', 'false');
  }

  /** Close the goal sheet and carry on. Does nothing on a loss. */
  keepGoing(): void {
    if (this.kind !== 'goal') return;
    this.kind = null;
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
    this.handlers.onKeepGoing();
  }
}
