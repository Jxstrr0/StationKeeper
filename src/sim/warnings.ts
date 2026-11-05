// What is wrong with the station, and why. Built from a snapshot as a small graph: every problem names the
// problems that cause it, down to root causes such as a failed radiator or the eclipse. The UI groups the feed by
// root cause and lets the player walk a chain like "CO₂ high ← rack tripped ← loop hot ← radiator failed".
import type { ModuleSnapshot, SimSnapshot, StationWarning, Tier } from './types';

type DiagnosisInput = Omit<SimSnapshot, 'warnings' | 'freePorts'>;

const running = (m: ModuleSnapshot) => m.status === 'powered' || m.status === 'throttled';

const TIER_SEVERITY: Record<Tier, StationWarning['severity']> = { commercial: 'warn', essential: 'alarm', critical: 'alarm' };

export function diagnose(s: DiagnosisInput): StationWarning[] {
  const out = new Map<string, StationWarning>();
  const add = (w: StationWarning): string => {
    out.set(w.key, w);
    return w.key;
  };

  // Root causes on modules.
  for (const m of s.modules) {
    const base = { moduleId: m.id, tier: m.tier, causes: [] };
    if (m.status === 'failed') add({ ...base, key: `failed:${m.id}`, kind: 'moduleFailed', severity: TIER_SEVERITY[m.tier] });
    else if (m.status === 'servicing') add({ ...base, key: `servicing:${m.id}`, kind: 'moduleServicing', severity: 'info' });
    else if (m.status === 'off') add({ ...base, key: `off:${m.id}`, kind: 'moduleOff', severity: 'info' });
    if (m.dueForService && m.status !== 'failed' && !m.repair) {
      add({ ...base, key: `worn:${m.id}`, kind: 'moduleWorn', severity: 'warn', value: m.wear });
    }
  }

  /** The warning that explains why `m` isn't running, if it isn't. */
  const whyDown = (m: ModuleSnapshot): string | null => {
    switch (m.status) {
      case 'failed':
      case 'servicing':
      case 'off':
        return `${m.status}:${m.id}`;
      case 'shed':
        return `shed:${m.tier}`;
      case 'overheated':
        return `trip:${m.tier}`;
      default:
        return null;
    }
  };
  /** Modules out of the network entirely (not just unpowered). */
  const outOfService = (m: ModuleSnapshot) => m.status === 'failed' || m.status === 'servicing' || m.status === 'off';
  const keys = (list: (string | null)[]) => [...new Set(list.filter((k): k is string => k !== null))];
  const eclipse = () => add({ key: 'eclipse', kind: 'eclipse', severity: 'info', causes: [] });

  // Power: shedding happens when the arrays and batteries can't cover the load.
  const supplyDown = s.modules.filter((m) => (m.kind === 'solar' || m.kind === 'battery') && outOfService(m)).map(whyDown);
  for (const tier of ['commercial', 'essential', 'critical'] as const) {
    // The tier flag follows battery level. Loads shed without it were shed one by one because the arrays and
    // batteries together couldn't deliver that much power at once: no battery, or batteries at their power limit.
    const byFlag = s.power.shedTiers[tier];
    if (!byFlag && !s.modules.some((m) => m.tier === tier && m.status === 'shed')) continue;
    const limit = !byFlag && s.power.capacityKwh > 0 ? add({ key: 'batteryLimit', kind: 'batteryLimit', severity: 'info', causes: [] }) : null;
    add({ key: `shed:${tier}`, kind: 'loadShed', severity: TIER_SEVERITY[tier], tier, causes: keys([s.orbit.sunlit ? null : eclipse(), limit, ...supplyDown]) });
  }

  // Heat: the loop runs hot when the radiators can't keep up.
  if (s.thermal.throttled || Object.values(s.thermal.tripped).some(Boolean)) {
    const radiatorsDown = s.modules.filter((m) => m.kind === 'radiator' && !running(m)).map(whyDown);
    const sunlit = s.orbit.sunlit ? add({ key: 'sunlitRadiators', kind: 'sunlitRadiators', severity: 'info', causes: [] }) : null;
    add({ key: 'loopHot', kind: 'throttled', severity: 'warn', value: s.thermal.loopC, causes: keys([...radiatorsDown, sunlit]) });
    for (const tier of ['commercial', 'essential', 'critical'] as const) {
      if (s.thermal.tripped[tier]) add({ key: `trip:${tier}`, kind: 'tripped', severity: TIER_SEVERITY[tier], tier, value: s.thermal.loopC, causes: ['loopHot'] });
    }
  }

  // Life support: air and tanks go wrong when the racks stop.
  const ls = s.lifeSupport;
  const racks = s.modules.filter((m) => m.kind === 'lifesupport');
  const racksDown = racks.every((m) => !running(m)) ? keys(racks.map(whyDown)) : [];
  if (ls.alarms.co2Warn || ls.alarms.co2Danger) {
    add({ key: 'co2', kind: 'co2', severity: ls.alarms.co2Danger ? 'alarm' : 'warn', value: ls.co2MmHg, causes: racksDown });
  }
  if (ls.alarms.o2Low || ls.alarms.o2Out) {
    add({ key: 'o2', kind: 'o2', severity: ls.alarms.o2Out ? 'alarm' : 'warn', value: ls.o2CapacityKg > 0 ? ls.o2Kg / ls.o2CapacityKg : 0, causes: racksDown });
  }
  if (ls.alarms.waterLow || ls.alarms.waterOut) {
    add({ key: 'water', kind: 'water', severity: ls.alarms.waterOut ? 'alarm' : 'warn', value: ls.waterCapacityKg > 0 ? ls.waterKg / ls.waterCapacityKg : 0, causes: racksDown });
  }
  if (ls.alarms.healthLow) {
    const why = [ls.alarms.co2Danger ? 'co2' : null, ls.alarms.o2Out ? 'o2' : null, ls.alarms.waterOut ? 'water' : null];
    add({ key: 'crew', kind: 'crewCondition', severity: 'alarm', value: ls.health, limit: s.ending.evacuateBelow, causes: keys(why) });
  }

  // Money: guests only pay while their habitat runs, and contracts need their lab.
  for (const m of s.modules) {
    if (m.kind !== 'habitat' || running(m)) continue;
    const value = s.economy.guestIncomePerDay[m.id] ?? 0;
    add({ key: `guestsIdle:${m.id}`, kind: 'guestsIdle', severity: 'warn', moduleId: m.id, value, causes: keys([whyDown(m)]) });
  }
  const labs = s.modules.filter((m) => m.kind === 'lab');
  for (const c of s.economy.active) {
    if (!c.atRisk) continue;
    // Labs not running, and for contracts that need a steady loop, a throttled loop.
    const why = labs.filter((m) => !running(m) || (c.stable && m.status === 'throttled')).map((m) => (running(m) ? 'loopHot' : whyDown(m)));
    add({ key: `risk:${c.uid}`, kind: 'contractAtRisk', severity: 'warn', contractId: c.uid, label: c.title, value: c.hoursLeft, causes: keys(why) });
  }
  // Crew off their feet: exhausted or ill people do no work until they're back.
  const here = s.crew.members.filter((m) => m.status !== 'inFlight');
  const exhausted = here.filter((m) => m.status === 'exhausted');
  const sick = here.filter((m) => m.status === 'sick');
  const exhaustedKey =
    exhausted.length > 0 ? add({ key: 'crewExhausted', kind: 'crewExhausted', severity: 'warn', value: exhausted.length, label: exhausted[0]!.name, causes: [] }) : null;
  const sickKey = sick.length > 0 ? add({ key: 'crewSick', kind: 'crewSick', severity: 'info', value: sick.length, label: sick[0]!.name, causes: [] }) : null;
  const offDuty = (role: 'engineer' | 'scientist') =>
    keys([exhausted.some((m) => m.role === role) ? exhaustedKey : null, sick.some((m) => m.role === role) ? sickKey : null]);
  // No engineers fit to work: nobody can start a repair, and any failed module stays failed.
  const needsHands = s.modules.some((m) => m.status === 'failed' || m.repair !== null);
  if (s.crew.fitEngineers === 0 && needsHands) {
    add({ key: 'noEngineers', kind: 'noEngineers', severity: 'alarm', value: s.crew.engineers, causes: offDuty('engineer') });
  }
  // More labs at work than scientists to run them: the rest work at a reduced pace.
  const labsAtWork = labs.filter(running).length;
  if (s.economy.active.length > 0 && labsAtWork > s.crew.fitScientists) {
    add({ key: 'labUnstaffed', kind: 'labUnstaffed', severity: 'warn', value: labsAtWork - s.crew.fitScientists, causes: offDuty('scientist') });
  }
  // Morale: the unhappiest person aboard, and whatever is getting them down.
  const glum = here.filter((m) => m.moraleLow).sort((a, b) => a.morale - b.morale)[0];
  if (glum) {
    const why = keys([
      s.lifeSupport.alarms.co2Warn ? 'co2' : null,
      s.lifeSupport.alarms.o2Low ? 'o2' : null,
      s.lifeSupport.alarms.waterLow ? 'water' : null,
      s.thermal.throttled ? 'loopHot' : null,
      glum.status === 'exhausted' ? exhaustedKey : null,
      glum.status === 'sick' ? sickKey : null,
    ]);
    const quitting = here.filter((m) => m.resignsInHours !== null).sort((a, b) => (a.resignsInHours ?? 0) - (b.resignsInHours ?? 0))[0];
    const who = quitting ?? glum;
    add({
      key: 'moraleLow',
      kind: 'moraleLow',
      severity: quitting ? 'alarm' : 'warn',
      value: who.morale,
      label: who.name,
      ...(quitting ? { hours: quitting.resignsInHours ?? 0 } : {}),
      causes: why,
    });
  }
  // Guests: poor reviews, and what the guests are complaining about now.
  if (s.guests.poor) {
    const dark = s.modules.filter((m) => m.kind === 'habitat' && !running(m)).map((m) => `guestsIdle:${m.id}`);
    const why = keys([
      s.lifeSupport.alarms.co2Warn ? 'co2' : null,
      s.lifeSupport.alarms.o2Low ? 'o2' : null,
      s.lifeSupport.alarms.waterLow ? 'water' : null,
      s.thermal.throttled ? 'loopHot' : null,
      ...dark,
    ]);
    add({ key: 'reviewsPoor', kind: 'reviewsPoor', severity: 'warn', value: s.guests.stars, limit: s.guests.fareFactor, causes: why });
  }
  if (s.economy.cash < 0) {
    const final = s.ending.overdrawnCloses >= s.ending.overdrawnQuarters - 1;
    add({ key: 'overdrawn', kind: 'overdrawn', severity: 'alarm', value: s.economy.cash, limit: s.ending.overdraftLimit, final, causes: [] });
  }

  // Keep only links to warnings that exist (a status and its tier flag can disagree for a tick).
  const list = [...out.values()];
  for (const w of list) w.causes = w.causes.filter((k) => out.has(k));
  return list;
}

/** The root causes behind a warning: the warnings at the end of its cause chains. A root cause is its own root. */
export function rootCauses(warnings: readonly StationWarning[], key: string): string[] {
  const byKey = new Map(warnings.map((w) => [w.key, w]));
  const roots: string[] = [];
  const seen = new Set<string>();
  const visit = (k: string) => {
    if (seen.has(k)) return;
    seen.add(k);
    const w = byKey.get(k);
    if (!w) return;
    if (w.causes.length === 0) roots.push(k);
    else for (const c of w.causes) visit(c);
  };
  visit(key);
  return roots;
}

/** Every warning `key` leads to (its effects), nearest first. */
export function effectsOf(warnings: readonly StationWarning[], key: string): string[] {
  const out: string[] = [];
  const queue = [key];
  while (queue.length) {
    const k = queue.shift()!;
    for (const w of warnings) {
      if (w.causes.includes(k) && !out.includes(w.key) && w.key !== key) {
        out.push(w.key);
        queue.push(w.key);
      }
    }
  }
  return out;
}
