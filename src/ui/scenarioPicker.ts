// Choosing a scenario for a new station: each one's name, pitch, and goal, and a Start button.
import type { ScenarioDef } from '../sim/types';
import { el, setClass } from './dom';
import { money } from './format';
import { goalLine } from './goalText';

export class ScenarioPicker {
  readonly root = el('div', 'report-scrim picker-scrim');
  private readonly card = el('section', 'report-sheet picker-sheet');
  private open = false;

  constructor(
    parent: HTMLElement,
    scenarios: readonly ScenarioDef[],
    private readonly onPick: (id: string) => void,
  ) {
    const cancel = el('button', 'warn-act report-continue', ['Cancel']);
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
    const list = el(
      'div',
      'picker-list',
      scenarios.map((s) => {
        const start = el('button', 'warn-act primary picker-start', ['Start']);
        start.type = 'button';
        start.setAttribute('aria-label', `Start ${s.name}`);
        start.addEventListener('click', () => this.onPick(s.id));
        const loan = s.economy.loan.principal > 0 ? `, ${money(s.economy.loan.principal)} loan` : '';
        return el('article', 'picker-card', [
          el('h3', 'picker-name', [s.name]),
          el('p', 'picker-blurb', [s.blurb]),
          el('p', 'picker-goal', [goalLine(s.goal)]),
          el('div', 'picker-foot', [el('span', 'picker-terms', [`${money(s.economy.startCash)} cash${loan}`]), start]),
        ]);
      }),
    );
    this.card.append(el('p', 'report-kicker', ['New station']), el('h2', 'end-title', ['Choose a posting']), list, cancel);
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.root.append(this.card);
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    setClass(this.root, 'open', true);
    this.root.setAttribute('aria-hidden', 'false');
  }

  close(): void {
    this.open = false;
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
  }
}
