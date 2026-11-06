// The guide's card: one step at a time, with Next and Skip. The control a step is about pulses while it's up.
import type { TutorialStep } from '../tutorial';
import { el, setText } from './dom';

export interface CoachHandlers {
  onNext(): void;
  onSkip(): void;
}

export class Coach {
  readonly root = el('div', 'coach hidden');
  private readonly count = el('span', 'coach-count');
  private readonly title = el('strong', 'coach-title');
  private readonly text = el('p', 'coach-text');
  private readonly next = el('button', 'coach-next', ['Next']);
  private readonly skip = el('button', 'coach-skip', ['Skip the guide']);
  private target: string | undefined;

  constructor(
    parent: HTMLElement,
    private readonly host: HTMLElement,
    handlers: CoachHandlers,
  ) {
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Getting started');
    this.next.type = 'button';
    this.skip.type = 'button';
    this.next.addEventListener('click', () => handlers.onNext());
    this.skip.addEventListener('click', () => handlers.onSkip());
    this.root.append(el('div', 'coach-head', [this.count, this.title]), this.text, el('div', 'coach-acts', [this.skip, this.next]));
    parent.append(this.root);
  }

  show(step: TutorialStep, index: number, total: number): void {
    setText(this.count, `${index + 1} of ${total}`);
    setText(this.title, step.title);
    setText(this.text, step.text);
    setText(this.next, index + 1 === total ? 'Got it' : step.done ? 'Skip this step' : 'Next');
    this.setTarget(step.target);
    this.root.classList.remove('hidden');
    this.host.classList.add('coaching');
  }

  hide(): void {
    this.setTarget(undefined);
    this.root.classList.add('hidden');
    this.host.classList.remove('coaching');
  }

  /** Re-applies the pulse, for controls that are rebuilt or appear later. */
  refresh(): void {
    if (this.target) for (const n of this.host.querySelectorAll(this.target)) n.classList.add('coach-target');
  }

  private setTarget(sel: string | undefined): void {
    for (const n of this.host.querySelectorAll('.coach-target')) n.classList.remove('coach-target');
    this.target = sel;
    this.refresh();
  }
}
