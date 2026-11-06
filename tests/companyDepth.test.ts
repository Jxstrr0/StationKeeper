import { describe, expect, it } from 'vitest';
import { acceptBoard, boardMeasure, stepBoard } from '../src/company/board';
import {
  activeStation,
  borrow,
  buyListing,
  companyNetPerDay,
  companyValue,
  creditLeft,
  CREDIT_STEP,
  DEPUTIES,
  foundStation,
  newCompany,
  repayCredit,
  salePrice,
  sellStation,
  setDeputy,
  stepCompany,
  type CompanyState,
} from '../src/company/company';
import { parseCompany } from '../src/company/store';
import { companyView } from '../src/company/view';
import { SCENARIOS } from '../src/scenarios';
import { indexDefs } from '../src/sim/station';
import { defs } from './helpers';

const DAY = 1440;
const byId = indexDefs(defs);
const first = SCENARIOS[0]!;

function withSecond(): { c: CompanyState; id: string } {
  const c = newCompany(first, byId, 5);
  const r = foundStation(c, 'equatorial', 1000, first, byId);
  if (!r.ok) throw new Error('found');
  r.station.summary.netPerDay = 4;
  r.station.summary.wear = 0;
  return { c, id: r.station.id };
}

describe('company depth', () => {
  it('a seasoned deputy keeps more of the income, for wages', () => {
    const { c, id } = withSecond();
    const s = c.stations.find((x) => x.id === id)!;
    const standard = stepCompany(structuredClone(c), DAY, [], byId).cash;
    setDeputy(c, id, 'seasoned');
    expect(s.deputy).toBe('seasoned');
    const seasoned = stepCompany(structuredClone(c), DAY, [], byId).cash;
    // With wear 0 incidents are rare either way; compare the expected earnings, which the dice can only lower.
    expect(4 * DEPUTIES.seasoned.share - DEPUTIES.seasoned.wagesPerDay).toBeGreaterThan(4 * DEPUTIES.standard.share);
    expect(seasoned).toBeLessThanOrEqual(4 * DEPUTIES.seasoned.share - DEPUTIES.seasoned.wagesPerDay + 1e-9);
    expect(standard).toBeLessThanOrEqual(4 * DEPUTIES.standard.share + 1e-9);
    expect(companyNetPerDay(c, activeStation(c).summary)).toBeCloseTo(activeStation(c).summary.netPerDay + 4 * DEPUTIES.seasoned.share - DEPUTIES.seasoned.wagesPerDay, 9);
  });

  it('sells a station the player is not at, for its worth less its loan', () => {
    const { c, id } = withSecond();
    expect(sellStation(c, 'co-1')).toMatchObject({ ok: false });
    const price = salePrice(c.stations.find((x) => x.id === id)!);
    expect(price).toBeGreaterThan(0);
    expect(sellStation(c, id)).toMatchObject({ ok: true, price });
    expect(c.stations).toHaveLength(1);
    expect(c.lost.at(-1)).toMatchObject({ outcome: 'sold' });
  });

  it('nothing bought can be sold straight back for a profit', () => {
    const c = newCompany(first, byId, 9);
    for (const o of ['equatorial', 'inclined', 'dawn-dusk']) {
      const r = foundStation(c, o, 1000, first, byId);
      if (!r.ok) throw new Error('found');
      expect(salePrice(r.station)).toBeLessThan(r.cost);
    }
    for (let i = 0; i < 4; i++) {
      stepCompany(c, 3 * DAY, SCENARIOS, byId);
      const l = c.listings[0];
      if (!l) continue;
      const r = buyListing(c, l.id, 1000, SCENARIOS, byId);
      if (!r.ok) throw new Error('buy');
      expect(salePrice(r.station)).toBeLessThan(r.cost);
    }
  });

  it('borrows against the company in steps, charges interest, and is repaid from cash', () => {
    const c = newCompany(first, byId, 5);
    const live = activeStation(c).summary;
    const room = creditLeft(c, 40, live);
    expect(room % CREDIT_STEP).toBe(0);
    expect(room).toBeGreaterThan(0);
    const worth = companyValue(c, 40, live);
    expect(borrow(c, 40, live)).toBe(CREDIT_STEP);
    expect(c.debt).toBe(CREDIT_STEP);
    // Borrowed cash in hand and the debt cancel out in the company's worth.
    expect(companyValue(c, 40 + CREDIT_STEP, live)).toBeCloseTo(worth, 9);
    // Interest comes out of the hourly step.
    const step = stepCompany(structuredClone(c), DAY, [], byId);
    expect(step.cash).toBeCloseTo(-CREDIT_STEP * 0.03, 9);
    // Borrow until refused.
    let n = 0;
    while (borrow(c, 40 + CREDIT_STEP * (n + 1), live) > 0 && n < 50) n++;
    expect(n).toBeLessThan(50);
    expect(creditLeft(c, 40 + c.debt, live)).toBeLessThan(CREDIT_STEP);
    // Repaying takes no more than the cash in hand, nor more than is owed.
    const owed = c.debt;
    expect(repayCredit(c, 1000, 5)).toBe(5);
    expect(repayCredit(c, 1000, 1000)).toBe(owed - 5);
    expect(c.debt).toBe(0);
    expect(repayCredit(c, 10, 1000)).toBe(0);
  });

  it('the board offers a task, which pays when met in time and lapses quietly when not', () => {
    const c = newCompany(first, byId, 5);
    const live = activeStation(c).summary;
    c.minutes = DAY;
    const r = stepBoard(c, { cash: 40, live });
    expect(c.board.offer).not.toBeNull();
    expect(r.news).toHaveLength(1);
    expect(acceptBoard(c)).toBe(true);
    const task = c.board.active!;
    // Meet it: give the measure what it asks for.
    const view = { cash: task.kind === 'cash' ? task.target : 40, live: { ...live, stars: task.kind === 'stars' ? task.target : live.stars, netPerDay: task.kind === 'income' ? task.target + 1 : live.netPerDay } };
    if (task.kind === 'stations') foundStation(c, 'equatorial', 1000, first, byId);
    expect(boardMeasure(task, c, view)).toBeGreaterThanOrEqual(task.target);
    const paid = stepBoard(c, view);
    expect(paid.cash).toBe(task.reward);
    expect(c.board).toMatchObject({ active: null, done: 1 });

    // A second one, missed.
    c.minutes = c.board.nextAt;
    stepBoard(c, { cash: 0, live: { ...live, netPerDay: 0, stars: null } });
    acceptBoard(c);
    c.minutes = c.board.active!.until;
    const missed = stepBoard(c, { cash: -100, live: { ...live, netPerDay: -50, stars: null } });
    expect(missed.cash).toBe(0);
    expect(c.board).toMatchObject({ active: null, missed: 1 });
  });

  it('old companies load with no debt and an empty board, and the view shows the new parts', () => {
    const c = newCompany(first, byId, 5) as Partial<CompanyState>;
    delete c.debt;
    delete c.board;
    const back = parseCompany(JSON.stringify(c));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.company.debt).toBe(0);
    expect(back.company.board.offer).toBeNull();
    const v = companyView(back.company, 40, activeStation(back.company).summary);
    expect(v.board.kind).toBe('none');
    expect(v.credit.left).toBeGreaterThan(0);
    expect(v.stations[0]).toMatchObject({ canSell: false });
  });
});


describe('credit and the board', () => {
  it('borrowed cash does not meet a cash task or the $100M milestone', async () => {
    const { checkMilestones } = await import('../src/company/milestones');
    const c = newCompany(first, byId, 5);
    const live = activeStation(c).summary;
    c.debt = 80;
    const task = { kind: 'cash' as const, target: 90, reward: 10, days: 4, until: DAY * 9 };
    expect(boardMeasure(task, c, { cash: 120, live })).toBe(40);
    expect(checkMilestones(c, { cash: 120, live }).map((m) => m.id)).not.toContain('cash-100');
  });
});
