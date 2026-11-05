// The quarterly report: shown when the books close, with the game paused until the player carries on.
import type { QuarterReport } from '../sim/types';
import { el, setClass } from './dom';
import { ledgerRows } from './financePanel';
import { money } from './format';

/** A one-line verdict on the quarter, in the house tone. */
export function verdict(r: QuarterReport): string {
  if (r.cash < 0) return 'The bank has started using your first name. That is not a good sign.';
  if (r.net >= 5) return 'A strong quarter. The board is cautiously optimistic, which for them is practically dancing.';
  if (r.net >= 0) return 'In the black, just. The board would like more of this, and more of it.';
  if (r.net > -5) return 'A small loss. Nothing a few contracts and fewer breakdowns would not fix.';
  return 'A heavy loss. The board has scheduled a meeting about the meeting.';
}

export class ReportSheet {
  readonly root = el('section', 'report-sheet');
  private readonly body = el('div', 'report-body');
  private onContinue: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    const go = el('button', 'warn-act primary report-continue', ['Continue']);
    go.type = 'button';
    go.addEventListener('click', () => this.close());
    this.root.append(this.body, go);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  show(r: QuarterReport, onContinue: () => void): void {
    this.onContinue = onContinue;
    const row = (label: string, value: string, cls = '') => el('div', `report-row ${cls}`, [el('span', '', [label]), el('b', '', [value])]);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    this.body.replaceChildren(
      el('p', 'report-kicker', [`Quarter ${r.quarter} report`]),
      el('h2', 'report-net', [money(r.net)]),
      el('p', 'report-verdict', [verdict(r)]),
      el(
        'div',
        'report-rows',
        ledgerRows(r.ledger).map((x) => row(x.label, money(x.amount), x.amount >= 0 ? 'in' : 'out')),
      ),
      el('div', 'report-rows', [
        row('Cash', money(r.cash), r.cash < 0 ? 'out' : ''),
        row('Loan', money(r.loan)),
        row('Contracts', `${r.contractsDone} delivered · ${r.contractsFailed} failed`),
        row('Guest habitat open', pct(r.guestUptime)),
        row('Breakdowns', String(r.failures)),
      ]),
    );
    setClass(this.root, 'open', true);
    this.root.setAttribute('aria-hidden', 'false');
  }

  close(): void {
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
    const done = this.onContinue;
    this.onContinue = null;
    done?.();
  }
}
