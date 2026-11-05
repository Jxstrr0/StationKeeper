import { describe, expect, it } from 'vitest';
import modulesJson from '../src/data/modules.json';
import { parseModuleDefs } from '../src/sim/data';
import { Simulation } from '../src/sim/simulation';
import { amenityLift, reputationTarget, stars } from '../src/sim/systems/guests';
import type { ScenarioDef } from '../src/sim/types';
import { moduleHighlights } from '../src/ui/buildPanel';
import { baseScenario, defs, makeSim } from './helpers';

const cfg = baseScenario.guests;
const DAY = 1440;
const lounge = defs.find((d) => d.id === 'lounge')!;

/** Reputation that follows the station within the hour, plenty of cash, no illness. */
const quick = (s: ScenarioDef) => {
  s.guests.perHour = 2;
  s.economy.startCash = 200;
  s.economy.deliveryHours = 0;
  s.crew.needs.illness.perDay = 0;
};

function withLounge(patch: (s: ScenarioDef) => void = () => {}): Simulation {
  const sim = makeSim(
    (s) => {
      quick(s);
      patch(s);
    },
    // Power and cooling to spare, so nothing but the lounge moves the guests.
    (d) => {
      const solar = d.find((x) => x.id === 'solar-array')!;
      solar.power.generationKw = 200;
      const battery = d.find((x) => x.id === 'battery-pack')!;
      battery.power.storageKwh = 500;
      battery.power.maxDischargeKw = 100;
      d.find((x) => x.id === 'radiator')!.thermal.rejectKw = 60;
    },
  );
  const port = sim.snapshot().freePorts.find((p) => sim.buildProblem('lounge', p.moduleId, p.portId) === null)!;
  expect(sim.command({ type: 'addModule', defId: 'lounge', to: port.moduleId, port: port.portId }).ok).toBe(true);
  return sim;
}

describe('the guest lounge', () => {
  it('lifts where reputation settles; a second of the same kind adds nothing', () => {
    const calm = { places: 4, served: 4, hot: false, badAir: false, lift: 0 };
    const one = amenityLift([{ name: 'Guest Lounge', reputation: 0.15 }], 0.5);
    expect(one).toBeCloseTo(0.15);
    expect(amenityLift([{ name: 'Guest Lounge', reputation: 0.15 }, { name: 'Guest Lounge', reputation: 0.15 }], 0.5)).toBeCloseTo(0.15);
    expect(amenityLift([{ name: 'A', reputation: 0.1 }, { name: 'B', reputation: 0.2 }], 0.5)).toBeCloseTo(0.25);
    expect(reputationTarget({ ...calm, lift: one }, cfg)).toBeCloseTo(cfg.base + 0.15);
    expect(reputationTarget({ ...calm, lift: 1 }, cfg)).toBe(1);
    // Four stars at best without it, five with it.
    expect(stars(cfg.base)).toBe(4);
    expect(stars(cfg.base + one)).toBe(5);
  });

  it('on the station, earns five-star reviews while it runs, and stops when it is switched off', () => {
    const sim = withLounge();
    sim.run(DAY);
    const s = sim.snapshot();
    expect(s.guests.target).toBeCloseTo(cfg.base + lounge.amenity!.reputation);
    expect(s.economy.lastReport!.reviews!.stars).toBe(5);

    sim.command({ type: 'setModuleEnabled', moduleId: s.modules.find((m) => m.kind === 'lounge')!.id, enabled: false });
    sim.run(DAY);
    expect(sim.snapshot().guests.target).toBeCloseTo(cfg.base);
    expect(sim.snapshot().economy.lastReport!.reviews!.stars).toBe(4);
  });

  it('does nothing for the crew', () => {
    expect(lounge.comfort).toBeUndefined();
    const sim = withLounge();
    sim.run(60);
    expect(sim.snapshot().crew.comforts).toEqual([]);
  });

  it('a five-star goal needs a lounge aboard or for sale', () => {
    const five = (catalogue?: string[]) => () =>
      makeSim((s) => {
        s.goal = { kind: 'reviews', stars: 5 };
        if (catalogue) s.catalogue = catalogue;
      });
    expect(five()).not.toThrow();
    expect(five(['radiator'])).toThrow(/at most 4 stars/);
    expect(five(['radiator', 'lounge'])).not.toThrow();
  });

  it('says what it does in the build tray, and rejects a lift that is not one', () => {
    expect(moduleHighlights(lounge)).toContain('Guest reviews +0.6★, guests only');
    const bad = structuredClone(modulesJson) as { modules: { id: string; amenity?: { reputation: number } }[] };
    bad.modules.find((m) => m.id === 'lounge')!.amenity!.reputation = 0;
    expect(() => parseModuleDefs(bad)).toThrow(/amenity.reputation/);
  });
});
