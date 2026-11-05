import { describe, expect, it } from 'vitest';
import scenarioJson from '../src/data/scenarios/longlight-one.json';
import { parseScenario } from '../src/sim/data';
import { Simulation, type SimSave } from '../src/sim/simulation';
import { bookedGuests, occupancy } from '../src/sim/systems/guests';
import type { ScenarioDef } from '../src/sim/types';
import { reviewsText } from '../src/ui/financePanel';
import { baseScenario, defs, makeSim } from './helpers';

const cfg = baseScenario.guests;
const { emptyAt, fullAt } = cfg.bookings;
const HOUR = 60;
const QUARTER = baseScenario.economy.quarterDays * 24 * HOUR;

/** Reputation that moves fast, so a quarter's reviews follow what the station did in it. No illness. */
const quick = (s: ScenarioDef) => {
  s.guests.perHour = 2;
  s.crew.needs.illness.perDay = 0;
};

/** A station whose habitat sat dark for its first quarter. */
function darkQuarter(): Simulation {
  const sim = makeSim(quick);
  sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false });
  sim.run(QUARTER);
  return sim;
}

describe('guest bookings', () => {
  it('fill from nothing at `emptyAt` to every place at `fullAt`, in whole guests', () => {
    expect(occupancy(emptyAt, cfg)).toBe(0);
    expect(occupancy(0, cfg)).toBe(0);
    expect(occupancy(fullAt, cfg)).toBe(1);
    expect(occupancy(1, cfg)).toBe(1);
    expect(occupancy((emptyAt + fullAt) / 2, cfg)).toBeCloseTo(0.5);
    expect([0, 0.1, 0.13, 0.5, 0.9, 1].map((o) => bookedGuests(4, o))).toEqual([0, 0, 1, 2, 4, 4]);
  });

  it('start full at a three-star station', () => {
    const g = makeSim().snapshot().guests;
    expect(g.places).toBe(4);
    expect(g.booked).toBe(4);
    expect(reviewsText(g)).not.toMatch(/booked/);
  });

  it('a quarter of poor reviews books fewer guests for the next: fewer pay, fewer breathe', () => {
    const sim = darkQuarter();
    const s = sim.snapshot();
    const reviews = s.economy.lastReport!.reviews!;
    const booked = bookedGuests(4, occupancy(reviews.reputation, cfg));
    expect(booked).toBeGreaterThan(0);
    expect(booked).toBeLessThan(4);
    expect(reviews.occupancy).toBeCloseTo(occupancy(reviews.reputation, cfg));
    expect(s.economy.lastReport!.bookings).toEqual({ booked, places: 4 });
    expect(s.guests.booked).toBe(booked);
    expect(s.lifeSupport.guests).toBe(booked);
    expect(reviewsText(s.guests)).toContain(`${booked} of 4 places booked`);

    // Switched back on, the habitat earns only for the guests who came.
    sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: true });
    sim.run(30);
    const e = sim.snapshot().economy;
    expect(e.guestIncomePerDay['habitat-1']).toBeCloseTo(booked * baseScenario.economy.guestPerDay * e.fareFactor, 9);
  });

  it('a good quarter after fills the places again', () => {
    const sim = darkQuarter();
    expect(sim.snapshot().guests.booked).toBeLessThan(4);
    sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: true });
    sim.run(QUARTER);
    const s = sim.snapshot();
    expect(s.guests.booked).toBe(4);
    expect(s.lifeSupport.guests).toBe(4);
    expect(s.economy.lastReport!.bookings).toEqual({ booked: 4, places: 4 });
  });

  it('a saved game keeps its bookings', () => {
    const sim = darkQuarter();
    const loaded = Simulation.fromSave(defs, sim.scenario, JSON.parse(JSON.stringify(sim.save())) as SimSave, { failures: false });
    expect(loaded.snapshot().guests.booked).toBe(sim.snapshot().guests.booked);
    expect(loaded.snapshot().lifeSupport.guests).toBe(sim.snapshot().lifeSupport.guests);
  });

  it('rejects bookings that make no sense', () => {
    const withBookings = (bookings: unknown) => () => parseScenario({ ...scenarioJson, guests: { ...scenarioJson.guests, bookings } });
    expect(withBookings(undefined)).toThrow(/bookings/);
    expect(withBookings({ emptyAt: 0.4, fullAt: 0.4 })).toThrow(/emptyAt/);
  });
});
