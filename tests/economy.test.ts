import { describe, expect, it } from 'vitest';
import { forecast } from '../src/sim/forecast';
import type { SimEvents } from '../src/sim/events';
import type { Simulation } from '../src/sim/simulation';
import type { ModuleDef, ScenarioDef } from '../src/sim/types';
import { baseScenario, defs, makeSim, runUntil } from './helpers';

const econ = baseScenario.economy;
const cash = (sim: Simulation) => sim.snapshot().economy.cash;
const mod = (sim: Simulation, id: string) => sim.snapshot().modules.find((m) => m.id === id)!;
const contract = (id: string) => econ.contracts.pool.find((c) => c.id === id)!;

/** Instant deliveries and spare cash, for tests about something other than paying and waiting. */
const instant = (s: ScenarioDef) => {
  s.economy.deliveryHours = 0;
  s.economy.startCash = 500;
};

/** A sim with a Research Lab docked aft of the life support rack, and only the given contract on offer. */
function withLab(contractId: string, patch: (s: ScenarioDef) => void = () => {}): Simulation {
  const sim = makeSim((s) => {
    instant(s);
    s.economy.contracts.pool = s.economy.contracts.pool.filter((c) => c.id === contractId);
    s.economy.contracts.startingOffers = 1;
    patch(s);
  });
  expect(sim.command({ type: 'addModule', defId: 'research-lab', to: 'life-support-1', port: 'aft' }).ok).toBe(true);
  return sim;
}

const collect = <K extends keyof SimEvents>(sim: Simulation, type: K) => {
  const got: SimEvents[K][] = [];
  sim.events.on(type, (e) => got.push(e));
  return got;
};

describe('money', () => {
  it('starts with the scenario cash, the loan, and contracts on offer', () => {
    const e = makeSim().snapshot().economy;
    expect(e).toMatchObject({ cash: econ.startCash, loan: econ.loan.principal, quarter: 1, labs: 0, active: [], deliveries: [] });
    expect(e.offers).toHaveLength(econ.contracts.startingOffers);
  });

  it('guests pay by the minute while their habitat runs; crew and the loan cost by the minute', () => {
    const sim = makeSim();
    let guestMinutes = 0;
    for (let i = 0; i < 180; i++) {
      sim.tick();
      if (['powered', 'throttled'].includes(mod(sim, 'habitat-1').status)) guestMinutes++;
    }
    const l = sim.snapshot().economy.ledger;
    expect(l.guests).toBeCloseTo((guestMinutes * 4 * econ.guestPerDay) / 1440, 9);
    expect(l.operations).toBeCloseTo((-180 * econ.operationsPerDay) / 1440, 9);
    expect(l.interest).toBeCloseTo((-180 * econ.loan.principal * econ.loan.ratePerQuarter) / (1440 * econ.quarterDays), 9);
    expect(cash(sim)).toBeCloseTo(econ.startCash + l.guests + l.operations + l.interest, 9);
  });

  it('guests stop paying while the habitat is switched off', () => {
    const sim = makeSim();
    sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false });
    sim.run(60);
    expect(sim.snapshot().economy.ledger.guests).toBe(0);
    expect(sim.snapshot().economy.netPerDay).toBeCloseTo(-econ.operationsPerDay - econ.loan.principal * econ.loan.ratePerQuarter);
  });

  it('closes the books each quarter with a report, then starts afresh', () => {
    const sim = makeSim();
    const reports = collect(sim, 'quarterReport');
    sim.run(Math.round(econ.quarterDays * 1440) - 1);
    const before = sim.snapshot().economy;
    sim.tick();
    expect(reports).toHaveLength(1);
    const r = reports[0]!.report;
    expect(r.quarter).toBe(1);
    expect(r.ledger.operations).toBeCloseTo(-econ.operationsPerDay * econ.quarterDays, 6);
    expect(r.net).toBeCloseTo(r.cash - econ.startCash, 6);
    expect(r.guestUptime).toBeGreaterThan(0.5);
    expect(r.guestUptime).toBeLessThanOrEqual(1);
    expect(before.ledger.operations).toBeLessThan(0);
    const after = sim.snapshot().economy;
    expect(after).toMatchObject({ quarter: 2, lastReport: r });
    expect(after.ledger.operations).toBe(0);
  });

  it('repaying the loan moves cash to the loan and cuts the interest', () => {
    const sim = makeSim();
    expect(sim.command({ type: 'repayLoan', amount: 10 })).toEqual({ ok: true });
    expect(sim.snapshot().economy).toMatchObject({ cash: econ.startCash - 10, loan: econ.loan.principal - 10 });
    sim.run(60);
    expect(sim.snapshot().economy.ledger.interest).toBeCloseTo((-60 * 50 * econ.loan.ratePerQuarter) / 1440, 9);
    expect(sim.command({ type: 'repayLoan', amount: 0 }).ok).toBe(false);
    // Can't repay more than you have.
    sim.command({ type: 'repayLoan', amount: 1000 });
    expect(cash(sim)).toBe(0);
  });
});

describe('ordering modules', () => {
  it('charges the price up front, reserves the port, and docks after the delivery time', () => {
    const sim = makeSim();
    const ordered = collect(sim, 'moduleOrdered');
    const added = collect(sim, 'moduleAdded');
    const price = defs.find((d) => d.id === 'battery-pack')!.price!;
    expect(sim.command({ type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'zenith' })).toEqual({ ok: true, moduleId: 'battery-pack-1' });
    expect(ordered).toEqual([{ moduleId: 'battery-pack-1', defId: 'battery-pack', cost: price, hours: econ.deliveryHours }]);
    const s = sim.snapshot();
    expect(s.economy.cash).toBe(econ.startCash - price);
    expect(s.economy.ledger.construction).toBe(-price);
    expect(s.modules.some((m) => m.id === 'battery-pack-1')).toBe(false);
    expect(s.freePorts).not.toContainEqual({ moduleId: 'core-1', portId: 'zenith' });
    expect(s.economy.deliveries).toEqual([expect.objectContaining({ moduleId: 'battery-pack-1', hoursLeft: econ.deliveryHours })]);
    expect(sim.command({ type: 'addModule', defId: 'radiator', to: 'core-1', port: 'zenith' })).toMatchObject({ ok: false, reason: /on its way/ });

    sim.run(econ.deliveryHours * 60 - 1);
    expect(added).toEqual([]);
    sim.tick();
    expect(added).toEqual([{ moduleId: 'battery-pack-1', defId: 'battery-pack' }]);
    expect(mod(sim, 'battery-pack-1').storedKwh).toBeGreaterThan(0);
    expect(sim.snapshot().economy.deliveries).toEqual([]);
  });

  it('gives each order its own id while others are still on the way', () => {
    const sim = makeSim((s) => (s.economy.startCash = 100));
    expect(sim.command({ type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'zenith' })).toMatchObject({ moduleId: 'battery-pack-1' });
    expect(sim.command({ type: 'addModule', defId: 'battery-pack', to: 'habitat-1', port: 'fore' })).toMatchObject({ moduleId: 'battery-pack-2' });
  });

  it('refuses orders it can not pay for, and modules that are not for sale', () => {
    const sim = makeSim((s) => (s.economy.startCash = 5));
    expect(sim.command({ type: 'addModule', defId: 'battery-pack', to: 'core-1', port: 'zenith' })).toMatchObject({ ok: false, reason: /Not enough cash/ });
    expect(cash(sim)).toBe(5);
    expect(sim.command({ type: 'addModule', defId: 'core', to: 'core-1', port: 'zenith' })).toMatchObject({ ok: false, reason: /not for sale/ });
  });

  it('forecasts show a module once docked, and leave its price out of the income', () => {
    const sim = makeSim((s) => (s.economy.startCash = 100));
    const base = forecast(sim, 186)!;
    const lab = forecast(sim, 186, { type: 'addModule', defId: 'research-lab', to: 'life-support-1', port: 'aft' })!;
    expect(lab.maxLoopC).toBeGreaterThan(base.maxLoopC);
    expect(Math.abs(lab.netIncome - base.netIncome)).toBeLessThan(5);
    expect(cash(sim)).toBe(100);
  });
});

describe('research contracts', () => {
  it('need a lab, and one contract per lab', () => {
    const noLab = makeSim();
    const offer = noLab.snapshot().economy.offers[0]!;
    expect(noLab.command({ type: 'acceptContract', uid: offer.uid })).toMatchObject({ ok: false, reason: /Research Lab/ });

    const sim = withLab('alloy-casting', (s) => (s.economy.contracts.startingOffers = 2));
    const [a, b] = sim.snapshot().economy.offers;
    expect(sim.command({ type: 'acceptContract', uid: a!.uid })).toEqual({ ok: true });
    expect(sim.command({ type: 'acceptContract', uid: b!.uid })).toMatchObject({ ok: false, reason: /already running/ });
    expect(sim.command({ type: 'acceptContract', uid: 'nope' }).ok).toBe(false);
  });

  it('pay out when the lab has put in the hours', () => {
    const sim = withLab('alloy-casting');
    const done = collect(sim, 'contractCompleted');
    const c = contract('alloy-casting');
    sim.command({ type: 'acceptContract', uid: sim.snapshot().economy.offers[0]!.uid });
    const before = cash(sim);
    // One lab hour per hour the lab is powered (the eclipse sheds it: one battery can't carry the extra load).
    // Throttled minutes count at the throttle factor (this contract doesn't need a steady loop).
    let hours = 0;
    for (let i = 0; i < 120; i++) {
      sim.tick();
      const status = mod(sim, 'research-lab-1').status;
      hours += status === 'powered' ? 1 / 60 : status === 'throttled' ? baseScenario.thermal.throttleFactor / 60 : 0;
    }
    expect(sim.snapshot().economy.active[0]!.progressHours).toBeCloseTo(hours, 9);
    expect(hours).toBeGreaterThan(0);
    runUntil(sim, () => done.length > 0, c.deadlineHours * 60);
    expect(done[0]).toMatchObject({ reward: c.reward });
    expect(sim.snapshot().economy.ledger.contracts).toBe(c.reward);
    expect(sim.snapshot().economy.active).toEqual([]);
    expect(cash(sim)).toBeGreaterThan(before + c.reward - 3);
  });

  it('cost the penalty if the deadline passes, or if abandoned', () => {
    const late = withLab('alloy-casting');
    const failed = collect(late, 'contractFailed');
    const c = contract('alloy-casting');
    late.command({ type: 'acceptContract', uid: late.snapshot().economy.offers[0]!.uid });
    late.command({ type: 'setModuleEnabled', moduleId: 'research-lab-1', enabled: false });
    late.run(c.deadlineHours * 60);
    expect(failed).toEqual([expect.objectContaining({ penalty: c.penalty, abandoned: false })]);
    expect(late.snapshot().economy.ledger.penalties).toBe(-c.penalty);

    const quit = withLab('alloy-casting');
    const uid = quit.snapshot().economy.offers[0]!.uid;
    quit.command({ type: 'acceptContract', uid });
    expect(quit.command({ type: 'abandonContract', uid })).toEqual({ ok: true });
    expect(quit.snapshot().economy.ledger.penalties).toBe(-c.penalty);
    expect(quit.command({ type: 'abandonContract', uid }).ok).toBe(false);
  });

  it('steady-loop contracts make no progress while the loop is throttled; others go slower', () => {
    const hot = (s: ScenarioDef) => (s.thermal.throttle = { above: -50, below: -60 });
    const stable = withLab('fibre-draw', hot);
    const rough = withLab('alloy-casting', hot);
    const throttled: number[] = [];
    for (const sim of [stable, rough]) {
      sim.tick(); // the throttle takes effect a tick after the loop crosses it
      sim.command({ type: 'acceptContract', uid: sim.snapshot().economy.offers[0]!.uid });
      let n = 0;
      for (let i = 0; i < 120; i++) {
        sim.tick();
        if (mod(sim, 'research-lab-1').status === 'throttled') n++;
      }
      throttled.push(n);
    }
    expect(throttled[0]).toBeGreaterThan(0);
    expect(stable.snapshot().economy.active[0]!.progressHours).toBe(0);
    expect(rough.snapshot().economy.active[0]!.progressHours).toBeCloseTo((throttled[1]! / 60) * baseScenario.thermal.throttleFactor, 9);
  });

  it('new offers arrive on a schedule up to a limit, lapse, and replay from the seed', () => {
    const board = (seed: number) => {
      const sim = makeSim((s) => (s.seed = seed));
      const seen: string[] = [];
      for (let h = 0; h < 48; h++) {
        sim.run(60);
        const offers = sim.snapshot().economy.offers;
        expect(offers.length).toBeLessThanOrEqual(econ.contracts.maxOffers);
        for (const o of offers) expect(o.hoursLeft).toBeLessThanOrEqual(econ.contracts.offerLifeHours);
        seen.push(offers.map((o) => o.defId).join(','));
      }
      return seen.join('|');
    };
    expect(board(5)).toBe(board(5));
    expect(new Set(board(5).split('|')).size).toBeGreaterThan(2);
  });
});

describe('spare parts', () => {
  const breaks = (defId: string) => (list: ModuleDef[]) => {
    for (const d of list) if (d.reliability) d.reliability = { ...d.reliability, failPerDay: d.id === defId ? 1e6 : 1e-12 };
  };

  it('a service costs a share of the price when the crew starts, refunded if cancelled', () => {
    const sim = makeSim();
    const price = defs.find((d) => d.id === 'life-support')!.price!;
    sim.command({ type: 'repair', moduleId: 'life-support-1' });
    expect(sim.snapshot().economy.ledger.repairs).toBeCloseTo(-price * econ.serviceCostShare);
    sim.command({ type: 'cancelRepair', moduleId: 'life-support-1' });
    expect(sim.snapshot().economy.ledger.repairs).toBeCloseTo(0);
  });

  it('a repair costs more than a service, and queued work is not charged until it starts', () => {
    const sim = makeSim(undefined, breaks('radiator'), { failures: true });
    runUntil(sim, () => mod(sim, 'radiator-1').status === 'failed', 50);
    sim.command({ type: 'repair', moduleId: 'life-support-1' }); // the team is busy with this first
    sim.command({ type: 'repair', moduleId: 'radiator-1' });
    const price = (id: string) => defs.find((d) => d.id === id)!.price!;
    expect(sim.snapshot().economy.ledger.repairs).toBeCloseTo(-price('life-support') * econ.serviceCostShare);
    runUntil(sim, () => mod(sim, 'radiator-1').repair?.active === true, 400);
    expect(sim.snapshot().economy.ledger.repairs).toBeCloseTo(-price('life-support') * econ.serviceCostShare - price('radiator') * econ.repairCostShare);
  });
});

describe('money warnings', () => {
  it('a habitat down means guests not paying, traced to why it is down', () => {
    const sim = makeSim();
    sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false });
    const idle = sim.snapshot().warnings.find((w) => w.key === 'guestsIdle:habitat-1');
    expect(idle?.causes).toEqual(['off:habitat-1']);
    // The warning carries what the guests would be paying.
    expect(idle?.value).toBeCloseTo(4 * baseScenario.economy.guestPerDay, 9);
  });

  it('a lab shed at eclipse with the battery still charged is blamed on the battery power limit', () => {
    const sim = withLab('alloy-casting');
    runUntil(sim, () => mod(sim, 'research-lab-1').status === 'shed', 200);
    const shed = sim.snapshot().warnings.find((w) => w.key === 'shed:commercial')!;
    expect(shed.causes).toEqual(expect.arrayContaining(['eclipse', 'batteryLimit']));
  });

  it('a contract with its lab switched off is at risk, traced to the lab', () => {
    const sim = withLab('fibre-draw');
    sim.command({ type: 'acceptContract', uid: sim.snapshot().economy.offers[0]!.uid });
    sim.command({ type: 'setModuleEnabled', moduleId: 'research-lab-1', enabled: false });
    runUntil(sim, () => sim.snapshot().warnings.some((w) => w.kind === 'contractAtRisk'), 600);
    const w = sim.snapshot().warnings.find((x) => x.kind === 'contractAtRisk')!;
    expect(w).toMatchObject({ label: contract('fibre-draw').title, causes: ['off:research-lab-1'] });
  });

  it('negative cash raises an alarm', () => {
    const sim = makeSim((s) => (s.economy.startCash = 0.01));
    sim.command({ type: 'setModuleEnabled', moduleId: 'habitat-1', enabled: false });
    sim.run(30);
    expect(sim.snapshot().warnings.find((w) => w.key === 'overdrawn')).toMatchObject({ severity: 'alarm' });
  });
});
