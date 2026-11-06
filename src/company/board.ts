// The board: now and then it asks something of the whole company, with a bonus if it's done in time. One offer or
// one task at a time; turning an offer down, or letting it lapse, costs nothing. Missing an accepted task costs only face.
import { Rng } from '../sim/rng';
import { companyNetPerDay, type BoardTask, type CompanyNews, type CompanyState } from './company';
import type { MilestoneView } from './milestones';

const DAY = 1440;
const OFFER_LIFE = DAY;
const GAP_AFTER = 1.5 * DAY;

/** Where the company stands on a task's measure. */
export function boardMeasure(task: BoardTask, c: CompanyState, v: MilestoneView): number {
  switch (task.kind) {
    case 'cash':
      // Borrowed money doesn't count: the board can read a balance sheet.
      return v.cash - c.debt;
    case 'stations':
      return c.stations.length;
    case 'stars':
      return Math.max(0, ...c.stations.map((s) => (s.id === c.activeId ? v.live : s.summary).stars ?? 0));
    case 'income':
      return companyNetPerDay(c, v.live);
  }
}

export function boardTitle(t: BoardTask): string {
  switch (t.kind) {
    case 'cash':
      return `Have $${t.target}M in the bank, not counting credit`;
    case 'stations':
      return `Own ${t.target} stations`;
    case 'stars':
      return `Earn ${t.target}-star reviews at any station`;
    case 'income':
      return `Bring in $${t.target}M a day across the company`;
  }
}

function makeOffer(c: CompanyState, v: MilestoneView, rng: Rng): BoardTask {
  const done = c.board.done;
  const kinds: BoardTask['kind'][] = ['cash', 'stations', 'income'];
  const best = boardMeasure({ kind: 'stars', target: 0, reward: 0, days: 0, until: 0 }, c, v);
  if (best > 0 && best < 5) kinds.push('stars');
  const kind = kinds[rng.int(0, kinds.length - 1)]!;
  const until = c.minutes + OFFER_LIFE;
  switch (kind) {
    case 'cash':
      return { kind, target: Math.ceil((Math.max(0, v.cash - c.debt) + 40 + 20 * done) / 10) * 10, reward: 12 + 4 * done, days: 4, until };
    case 'stations':
      return { kind, target: c.stations.length + 1, reward: 15 + 3 * done, days: 6, until };
    case 'stars':
      return { kind, target: Math.max(4, best + 1), reward: 18 + 3 * done, days: 5, until };
    case 'income':
      return { kind, target: Math.max(3, Math.ceil(companyNetPerDay(c, v.live) * 1.4 + 1)), reward: 14 + 4 * done, days: 4, until };
  }
}

/** Accept the board's offer: it becomes the task, due in its days. */
export function acceptBoard(c: CompanyState): boolean {
  const o = c.board.offer;
  if (!o || c.board.active) return false;
  c.board.active = { ...o, until: c.minutes + o.days * DAY };
  c.board.offer = null;
  return true;
}

/** An hour of the board: check the task, lapse the offer, post a new one when it's time. Returns any bonus paid. */
export function stepBoard(c: CompanyState, v: MilestoneView): { cash: number; news: CompanyNews[] } {
  const b = c.board;
  const news: CompanyNews[] = [];
  let cash = 0;
  if (b.active) {
    if (boardMeasure(b.active, c, v) >= b.active.target) {
      cash += b.active.reward;
      news.push({ text: `The board is pleased: ${boardTitle(b.active).toLowerCase()} — done. A $${b.active.reward}M bonus is in the account.`, kind: 'ok' });
      b.done++;
      b.active = null;
      b.nextAt = c.minutes + GAP_AFTER;
    } else if (c.minutes >= b.active.until) {
      news.push({ text: `The board's deadline passed: ${boardTitle(b.active).toLowerCase()}. No bonus, and a terse email.`, kind: 'warn' });
      b.missed++;
      b.active = null;
      b.nextAt = c.minutes + GAP_AFTER;
    }
  }
  if (b.offer && c.minutes >= b.offer.until) {
    b.offer = null;
    b.nextAt = c.minutes + GAP_AFTER;
  }
  if (!b.offer && !b.active && c.minutes >= b.nextAt) {
    const rng = new Rng((c.rng ^ 0x9e3779b9) >>> 0);
    b.offer = makeOffer(c, v, rng);
    c.rng = (c.rng + rng.int(1, 1000)) >>> 0;
    news.push({ text: `The board has a request: ${boardTitle(b.offer).toLowerCase()} within ${b.offer.days} days, for a $${b.offer.reward}M bonus. It's in Company.`, kind: 'ok' });
  }
  return { cash, news };
}
