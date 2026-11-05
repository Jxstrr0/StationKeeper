import { describe, expect, it } from 'vitest';
import scenarioJson from '../src/data/scenarios/longlight-one.json';
import { parseScenario } from '../src/sim/data';
import type { SimEvents } from '../src/sim/events';
import { Simulation, SAVE_VERSION, type SimSave } from '../src/sim/simulation';
import { complaints, createGuestState, fareFactor, postReviews, reputationTarget, stars, stepGuests, type GuestInputs } from '../src/sim/systems/guests';
import type { ScenarioDef } from '../src/sim/types';
import { reviewQuote } from '../src/ui/eventFeed';
import { reviewsText } from '../src/ui/financePanel';
import { warningTitle } from '../src/ui/warningText';
import { baseScenario, defs, makeSim } from './helpers';

const cfg = baseScenario.guests;
const HOUR = 60;
const calm: GuestInputs = { places: 4, served: 4, hot: false, badAir: false };

/** A station whose guests start at `rep` and whose crew stay well, so nothing else moves. */
const startAt = (rep: number) => (s: ScenarioDef) => {
  s.guests.start = rep;
  s.crew.needs.illness.perDay = 0;
};

describe('guest reputation', () => {
  it('heads for the base when all is well, and down for each thing guests put up with', () => {
    expect(reputationTarget(calm, cfg)).toBeCloseTo(cfg.base);
    expect(reputationTarget({ ...calm, hot: true }, cfg)).toBeCloseTo(cfg.base - cfg.penalties.hot);
    expect(reputationTarget({ ...calm, badAir: true }, cfg)).toBeCloseTo(cfg.base - cfg.penalties.badAir);
    // A dark habitat counts by the share of guest places it holds.
    expect(reputationTarget({ ...calm, places: 8, served: 4 }, cfg)).toBeCloseTo(cfg.base - cfg.penalties.dark / 2);
    expect(reputationTarget({ places: 4, served: 0, hot: true, badAir: true }, cfg)).toBe(0);
    expect(complaints({ places: 4, served: 0, hot: true, badAir: true })).toEqual(['hot', 'badAir', 'dark']);
    expect(complaints({ places: 0, served: 0, hot: true, badAir: true })).toEqual([]);
  });

  it('sets fares between the worst and best rate, and stars from one to five', () => {
    expect(fareFactor(0, cfg)).toBeCloseTo(cfg.fare.worst);
    expect(fareFactor(1, cfg)).toBeCloseTo(cfg.fare.best);
    expect(fareFactor(0.5, cfg)).toBeCloseTo((cfg.fare.worst + cfg.fare.best) / 2);
    expect([0, 0.1, 0.3, 0.5, 0.7, 0.9, 1].map(stars)).toEqual([1, 1, 2, 3, 4, 5, 5]);
  });

  it('drifts rather than jumps, and the poor flag has a gap so it does not flicker', () => {
    const g = createGuestState({ ...cfg, start: 0.5 });
    stepGuests(g, cfg, { ...calm, served: 0 }, 1 / 60);
    expect(g.reputation).toBeLessThan(0.5);
    expect(g.reputation).toBeGreaterThan(0.499);

    const poor = { ...cfg, poor: { above: 0.4, below: 0.3 } };
    const h = createGuestState({ ...poor, start: 0.35 });
    expect(h.poor).toBe(false);
    h.reputation = 0.29;
    stepGuests(h, poor, { ...calm, served: 0 }, 0);
    expect(h.poor).toBe(true);
    h.reputation = 0.35; // between the bands: stays poor
    stepGuests(h, poor, calm, 0);
    expect(h.poor).toBe(true);
    h.reputation = 0.41;
    stepGuests(h, poor, calm, 0);
    expect(h.poor).toBe(false);
  });

  it('posts reviews naming the complaint that lasted longest, then starts the tally again', () => {
    const g = createGuestState(cfg);
    const posted: SimEvents['guestReviews'][] = [];
    const bus = { emit: (_: 'guestReviews', e: SimEvents['guestReviews']) => posted.push(e) } as unknown as Parameters<typeof postReviews>[1];
    for (let i = 0; i < 80; i++) stepGuests(g, cfg, calm, 1 / 60);
    for (let i = 0; i < 20; i++) stepGuests(g, cfg, { ...calm, hot: true }, 1 / 60);
    postReviews(g, bus);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.complaint).toBe('hot');
    expect(posted[0]!.stars).toBe(stars(posted[0]!.reputation));
    expect(g.quarter.minutes).toBe(0);

    // A complaint that applied for under a tenth of the quarter isn't worth mentioning.
    for (let i = 0; i < 95; i++) stepGuests(g, cfg, calm, 1 / 60);
    for (let i = 0; i < 5; i++) stepGuests(g, cfg, { ...calm, badAir: true }, 1 / 60);
    postReviews(g, bus);
    expect(posted[1]!.complaint).toBeNull();

    // Nothing to say about a quarter with no guests.
    postReviews(g, bus);
    expect(posted).toHaveLength(2);
  });

  it('stays put on a station with no guest places', () => {
    const g = createGuestState(cfg);
    stepGuests(g, cfg, { places: 0, served: 0, hot: true, badAir: true }, 10);
    expect(g.reputation).toBe(cfg.start);
    expect(g.quarter.minutes).toBe(0);
  });
});

describe('guest reviews on the station', () => {
  it('a habitat left dark sinks the reviews, raises a warning that points at it, and the quarter reviews say why', () => {
    const sim = makeSim(startAt(0.35));
    const posted: SimEvents['guestReviews'][] = [];
    sim.events.on('guestReviews', (e) => posted.push(e));
    sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false });
    sim.run(24 * HOUR);

    const s = sim.snapshot();
    expect(s.guests.complaints).toContain('dark');
    expect(s.guests.target).toBeCloseTo(cfg.base - cfg.penalties.dark);
    expect(s.guests.reputation).toBeLessThan(cfg.poor.below);
    expect(s.guests.poor).toBe(true);
    expect(s.economy.fareFactor).toBeLessThan(1);

    const w = s.warnings.find((x) => x.kind === 'reviewsPoor')!;
    expect(w.causes).toContain('guestsIdle:habitat-1');
    expect(warningTitle(w, () => undefined)).toMatch(/^Guest reviews down to ★+☆+: fares at \d+% of the going rate$/);

    expect(posted).toHaveLength(1);
    expect(posted[0]!.complaint).toBe('dark');
    expect(posted[0]!.stars).toBeLessThanOrEqual(2);
  });

  it('good reviews put fares up, and poor ones bring them down', () => {
    const income = (rep: number) => {
      const sim = makeSim((s) => {
        startAt(rep)(s);
        s.guests.perHour = 0; // hold reputation still
      });
      sim.run(12 * HOUR);
      return sim.snapshot().economy.ledger.guests;
    };
    const mid = income(0.5);
    expect(income(1) / mid).toBeCloseTo(fareFactor(1, cfg) / fareFactor(0.5, cfg), 6);
    expect(income(0) / mid).toBeCloseTo(fareFactor(0, cfg) / fareFactor(0.5, cfg), 6);
  });

  it('a saved game keeps the guests’ opinion', () => {
    const sim = makeSim(startAt(0.35));
    sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false });
    sim.run(6 * HOUR);
    const save = JSON.parse(JSON.stringify(sim.save())) as SimSave;
    expect(save.version).toBe(SAVE_VERSION);
    const loaded = Simulation.fromSave(defs, sim.scenario, save, { failures: false });
    expect(loaded.snapshot().guests).toEqual(sim.snapshot().guests);
    sim.run(6 * HOUR);
    loaded.run(6 * HOUR);
    expect(loaded.snapshot().guests.reputation).toBeCloseTo(sim.snapshot().guests.reputation, 12);
  });

  it('the finance sheet and the feed put it in words', () => {
    const s = makeSim().snapshot();
    expect(reviewsText(s.guests)).toBe(`★★★☆☆ · fares ${Math.round(s.guests.fareFactor * 100)}%`);
    expect(reviewsText({ ...s.guests, complaints: ['dark'] })).toMatch(/guests say a habitat is dark$/);
    expect(reviewsText({ ...s.guests, complaints: ['hot', 'badAir', 'dark'] })).toMatch(/guests say it is too warm, the air is stale and a habitat is dark$/);
    expect(reviewQuote(5, null)).not.toBe(reviewQuote(2, null));
    expect(reviewQuote(2, 'badAir')).toMatch(/Breathtaking/);
  });

  it('rejects guest settings that make no sense', () => {
    const withGuests = (guests: unknown) => () => parseScenario({ ...scenarioJson, guests });
    expect(withGuests(undefined)).toThrow(/guests/);
    expect(withGuests({ ...scenarioJson.guests, fare: { worst: 1.3, best: 1.1 } })).toThrow(/worst/);
  });
});
