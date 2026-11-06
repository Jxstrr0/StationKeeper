import { describe, expect, it } from 'vitest';
import {
  activeStation,
  buyListing,
  companyNetPerDay,
  companyValue,
  enterStation,
  FOUND_OPTIONS,
  foundStation,
  leaveStation,
  newCompany,
  removeStation,
  stepCompany,
  type CompanyState,
} from '../src/company/company';
import { checkMilestones } from '../src/company/milestones';
import { parseCompany } from '../src/company/store';
import { SCENARIOS } from '../src/scenarios';
import { Simulation } from '../src/sim/simulation';
import { indexDefs } from '../src/sim/station';
import { defs } from './helpers';

const DAY = 1440;
const byId = indexDefs(defs);
const first = SCENARIOS[0]!;

/** Run the live station hands-on for `minutes`, keeping the company clock in step, and book the deputies' money. */
function play(c: CompanyState, sim: Simulation, minutes: number) {
  for (let done = 0; done < minutes; done += 60) {
    sim.run(60);
    const r = stepCompany(c, 60, SCENARIOS, byId);
    sim.command({ type: 'transfer', amount: r.cash });
  }
}

function live(c: CompanyState): Simulation {
  const { scenario, save } = enterStation(c, c.activeId);
  return save ? Simulation.fromSave(defs, scenario, save) : new Simulation(defs, scenario);
}

describe('company', () => {
  it('starts with the first posting, its cash and its loan, and no goal', () => {
    const c = newCompany(first, byId, 7);
    expect(c.stations).toHaveLength(1);
    const s = activeStation(c);
    expect(s.scenario.goal).toEqual({ kind: 'none' });
    expect(c.cash).toBe(first.economy.startCash);
    expect(s.summary.loan).toBe(first.economy.loan.principal);
    const sim = live(c);
    expect(sim.snapshot().economy).toMatchObject({ cash: first.economy.startCash, loan: first.economy.loan.principal });
  });

  it('lists derelicts for sale, which can be bought with enough cash and expire if not', () => {
    const c = newCompany(first, byId, 7);
    stepCompany(c, 60, SCENARIOS, byId);
    expect(c.listings).toHaveLength(2);
    const l = c.listings[0]!;
    expect(l.price).toBeGreaterThan(0);
    expect(l.price).toBeLessThan(l.value);
    expect(buyListing(c, l.id, l.price - 1, SCENARIOS, byId)).toMatchObject({ ok: false });
    const bought = buyListing(c, l.id, l.price, SCENARIOS, byId);
    expect(bought).toMatchObject({ ok: true, cost: l.price });
    expect(c.stations).toHaveLength(2);
    expect(c.listings.find((x) => x.id === l.id)).toBeUndefined();
    if (!bought.ok) return;
    expect(bought.station.scenario.goal.kind).toBe('none');
    expect(bought.station.scenario.economy.loan.principal).toBe(0);
    // Derelicts look it.
    expect(bought.station.summary.wear).toBeGreaterThan(0.3);
    // The other listing lapses after a few days.
    const other = c.listings[0]!.id;
    stepCompany(c, 4 * DAY, SCENARIOS, byId);
    expect(c.listings.find((x) => x.id === other)).toBeUndefined();
  });

  it('founds a new station in a chosen orbit, new and unworn', () => {
    const c = newCompany(first, byId, 7);
    const o = FOUND_OPTIONS[2]!;
    expect(foundStation(c, o.id, o.price - 1, first, byId).ok).toBe(false);
    const r = foundStation(c, o.id, o.price, first, byId);
    expect(r).toMatchObject({ ok: true, cost: o.price });
    if (!r.ok) return;
    expect(r.station.scenario.orbit.betaDeg).toBe(o.orbit.betaDeg);
    expect(r.station.summary.wear).toBe(0);
    expect(r.station.name).not.toBe(first.name);
  });

  it('switching keeps each station as it was, moves the cash, and shows company time on the clock', () => {
    const c = newCompany(first, byId, 7);
    let sim = live(c);
    play(c, sim, DAY / 2);
    const r = foundStation(c, 'equatorial', 1000, first, byId);
    if (!r.ok) throw new Error('found');
    sim.command({ type: 'transfer', amount: -r.cost });
    const cashThere = sim.snapshot().economy.cash;
    const loanThere = sim.snapshot().economy.loan;
    leaveStation(c, sim.save(), sim.snapshot(), byId);
    expect(c.cash).toBe(cashThere);

    // To the new station: same cash, and its clock reads the company's date.
    sim = live(Object.assign(c, { activeId: r.station.id }));
    expect(sim.snapshot().economy.cash).toBe(cashThere);
    expect(sim.snapshot().timeMs).toBe(Date.parse(c.startDate) + c.minutes * 60_000);
    play(c, sim, DAY);
    leaveStation(c, sim.save(), sim.snapshot(), byId);

    // And back: the first station's loan is as it was, the cash is whatever the company has now, the date is today.
    c.activeId = 'co-1';
    sim = live(c);
    expect(sim.snapshot().economy.loan).toBe(loanThere);
    expect(sim.snapshot().economy.cash).toBe(c.cash);
    expect(sim.snapshot().timeMs).toBe(Date.parse(c.startDate) + c.minutes * 60_000);
  });

  it('a station left to the deputy wears, earns a share of its income, and has the odd incident', () => {
    const c = newCompany(first, byId, 3);
    const sim = live(c);
    play(c, sim, DAY);
    const before = sim.save();
    leaveStation(c, before, sim.snapshot(), byId);
    const s = activeStation(c);
    s.summary.netPerDay = 4;
    // Pretend another station is live, so this one is off-screen.
    const r = foundStation(c, 'equatorial', 1000, first, byId);
    if (!r.ok) throw new Error('found');
    c.activeId = r.station.id;
    const step = stepCompany(c, 2 * DAY, SCENARIOS, byId);
    const incidents = s.incidents;
    const costs = step.news.length;
    expect(costs).toBe(incidents);
    // Income at the deputy's share, less any incident bills.
    if (incidents === 0) expect(step.cash).toBeCloseTo(4 * 0.75 * 2, 9);
    else expect(step.cash).toBeLessThan(4 * 0.75 * 2);
    // Back again: two days of wear waiting.
    const back = enterStation(c, 'co-1');
    const id = Object.keys(before.reliability.modules).find((k) => before.reliability.modules[k]!.wear > 0)!;
    expect(back.save!.reliability.modules[id]!.wear).toBeGreaterThan(before.reliability.modules[id]!.wear + 0.05);
    expect(s.incidents).toBe(0);
    expect(s.incomeFactor).toBe(1);
  });

  it('values the company and its income, and marks milestones once', () => {
    const c = newCompany(first, byId, 7);
    const sim = live(c);
    const snapLive = { ...activeStation(c).summary, netPerDay: 2, loan: 0 };
    expect(companyValue(c, 50, snapLive)).toBeCloseTo(50 + snapLive.value, 9);
    expect(companyNetPerDay(c, snapLive)).toBe(2);
    const got = checkMilestones(c, { cash: 120, live: snapLive });
    expect(got.map((m) => m.id)).toEqual(expect.arrayContaining(['debt-free', 'cash-100']));
    expect(checkMilestones(c, { cash: 120, live: snapLive })).toEqual([]);
    expect(sim.ended).toBe(false);
  });

  it('a lost station leaves the company, and losing the last one says so', () => {
    const c = newCompany(first, byId, 7);
    const r = foundStation(c, 'equatorial', 1000, first, byId);
    if (!r.ok) throw new Error('found');
    expect(removeStation(c, 'co-1', 'evacuated')).toBe(true);
    expect(c.activeId).toBe(r.station.id);
    expect(removeStation(c, r.station.id, 'bankrupt')).toBe(false);
    expect(c.lost.map((l) => l.outcome)).toEqual(['evacuated', 'bankrupt']);
  });

  it('saves and loads as JSON, and refuses what is not a company', () => {
    const c = newCompany(first, byId, 7);
    const sim = live(c);
    play(c, sim, 120);
    leaveStation(c, sim.save(), sim.snapshot(), byId);
    const back = parseCompany(JSON.stringify(c));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.company.stations[0]!.scenario).toEqual(c.stations[0]!.scenario);
    const again = enterStation(back.company, 'co-1');
    expect(Simulation.fromSave(defs, again.scenario, again.save!).elapsedMinutes).toBe(120);
    expect(parseCompany('{}').ok).toBe(false);
    expect(parseCompany(JSON.stringify({ ...c, version: 99 })).ok).toBe(false);
    expect(parseCompany(JSON.stringify({ ...c, activeId: 'nope' })).ok).toBe(false);
  });
});

describe('company view', () => {
  it('lists stations, listings and launches with what the player can afford', async () => {
    const { companyView } = await import('../src/company/view');
    const c = newCompany(first, byId, 7);
    stepCompany(c, 60, SCENARIOS, byId);
    const live = activeStation(c).summary;
    const v = companyView(c, 60, live);
    expect(v.stations).toEqual([expect.objectContaining({ id: 'co-1', here: true, note: expect.stringContaining('You are here') })]);
    expect(v.listings).toHaveLength(2);
    expect(v.listings.every((l) => l.affordable === l.price <= 60)).toBe(true);
    expect(v.found.map((f) => f.affordable)).toEqual(FOUND_OPTIONS.map((o) => o.price <= 60));
    expect(v.milestones.every((m) => !m.done)).toBe(true);
    expect(v.day).toBe(1);
  });
});
