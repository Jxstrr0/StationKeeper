// Company mode: one company, several stations, one bank account. The player runs one station hands-on; the others are
// left to a deputy and kept on a cheap summary (income, wear, the odd incident) until the player flies back.
// Everything here is plain data and pure functions, so it saves as JSON and tests without a sim running.
import { Simulation, type SimSave } from '../sim/simulation';
import { Rng } from '../sim/rng';
import type { LayoutEntry, ModuleDef, OrbitConfig, ScenarioDef, SimSnapshot } from '../sim/types';

export const COMPANY_VERSION = 1;
const DAY = 1440;

/** The core has no price (it can't be bought on its own), but it's worth something when the station is valued. */
const CORE_VALUE = 30;
/** A deputy keeps a station ticking over, a little less well than the player would. */
export const DEPUTY_SHARE = 0.75;
/** Wear a deputy-run module picks up per day away; the player finds it waiting on their return. */
const AWAY_WEAR_PER_DAY = 0.03;
/** An incident knocks this much off a station's income until the player visits, and this share of its value in parts. */
const INCIDENT_INCOME_HIT = 0.75;
const INCIDENT_COST_SHARE = 0.015;
const INCIDENT_WEAR = 0.2;
const MAX_WEAR = 0.9;
/** Listings: how many at once, how often a fresh batch comes in, and how long one stays up. */
const LISTINGS = 2;
const LISTING_EVERY_DAYS = 2;
const LISTING_LIFE_DAYS = 3;

/** What the company knows about a station without running it. */
export interface StationSummary {
  netPerDay: number;
  modules: number;
  value: number;
  /** Average wear of the modules that wear, 0..1. */
  wear: number;
  loan: number;
  /** The last reviews' stars, or null before any were posted (or with no guests). */
  stars: number | null;
  crew: number;
}

export interface CompanyStation {
  id: string;
  name: string;
  /** Its own scenario: orbit, layout, crew and the rest. Goal 'none'. */
  scenario: ScenarioDef;
  /** Its state when last run hands-on; null for a station never yet visited. */
  save: SimSave | null;
  summary: StationSummary;
  /** Company minute it was last run hands-on, or bought. */
  leftAt: number;
  /** Incidents while the deputy had it, since the player last visited. */
  incidents: number;
  /** Income left after incidents, as a share of the summary's, 0..1. */
  incomeFactor: number;
}

export interface Listing {
  id: string;
  name: string;
  /** The shipped scenario whose station this one is a copy of. */
  templateId: string;
  price: number;
  /** Extra wear on top of the template's, so a derelict looks it. */
  extraWear: number;
  seed: number;
  expiresAt: number;
  /** For the card: module count and value, worked out when it was listed. */
  modules: number;
  value: number;
  /** The guess at what it would earn hands-on, from a day run headless. */
  netPerDay: number;
}

export interface LostStation {
  name: string;
  outcome: 'evacuated' | 'bankrupt' | 'sold';
  at: number;
}

export interface CompanyState {
  app: 'stationkeeper-company';
  version: typeof COMPANY_VERSION;
  name: string;
  rng: number;
  /** In-game minutes since the company started. */
  minutes: number;
  /** Company day zero. Every station's clock shows company time. */
  startDate: string;
  /** Cash as of the last sync. While a station is live, the live sim holds the real figure. */
  cash: number;
  stations: CompanyStation[];
  activeId: string;
  listings: Listing[];
  nextListingsAt: number;
  milestones: string[];
  lost: LostStation[];
  nextNo: number;
}

/** Orbits a new station can be founded in. Higher beta means shorter eclipses, and a bigger launch bill. */
export interface FoundOption {
  id: string;
  label: string;
  line: string;
  orbit: OrbitConfig;
  price: number;
}

export const FOUND_OPTIONS: readonly FoundOption[] = [
  { id: 'equatorial', label: 'Low and equatorial', line: '420 km, long eclipses every orbit. The cheap launch.', orbit: { altitudeKm: 420, betaDeg: 0, startPhaseDeg: 0 }, price: 50 },
  { id: 'inclined', label: 'Inclined', line: '450 km, shorter eclipses. A fair middle.', orbit: { altitudeKm: 450, betaDeg: 40, startPhaseDeg: 0 }, price: 58 },
  { id: 'dawn-dusk', label: 'Dawn–dusk', line: '520 km, riding the terminator: sun nearly all the time, and the heat that comes with it.', orbit: { altitudeKm: 520, betaDeg: 76, startPhaseDeg: 0 }, price: 64 },
];

const NAME_A = ['Tern', 'Marrow', 'Sable', 'Halcyon', 'Brindle', 'Corrie', 'Gannet', 'Wren', 'Lantern', 'Skerry', 'Fallow', 'Ochre', 'Merlin', 'Thistle', 'Calder', 'Juniper', 'Pellam', 'Rook', 'Selkie', 'Tamsin'];
const NAME_B = ['Reach', 'Point', 'Drift', 'Rest', 'Haven', 'Yard', 'Light', 'Hold', 'Crossing', 'Watch', 'Spire', 'Station'];

export function moduleValue(def: ModuleDef | undefined, wear: number): number {
  const price = def ? (def.price ?? CORE_VALUE) : 0;
  return price * (1 - 0.6 * Math.min(1, Math.max(0, wear)));
}

/** What a layout is worth at the given wear per module id. */
export function layoutValue(layout: readonly LayoutEntry[], defs: ReadonlyMap<string, ModuleDef>, wearOf: (id: string) => number): number {
  return layout.reduce((sum, e) => sum + moduleValue(defs.get(e.module), wearOf(e.id)), 0);
}

/** A station's summary from a live snapshot. */
export function summarise(snap: SimSnapshot, scenario: ScenarioDef, defs: ReadonlyMap<string, ModuleDef>): StationSummary {
  const e = snap.economy;
  const r = e.lastReport;
  // A whole quarter's running figures beat a moment's; leave out building and repairs, which the player chose.
  const netPerDay = r ? (r.net - r.ledger.construction - r.ledger.repairs - r.ledger.fleet) / scenario.economy.quarterDays : e.netPerDay;
  const wearing = snap.modules.filter((m) => m.canFail);
  return {
    netPerDay,
    modules: snap.modules.length,
    value: snap.modules.reduce((sum, m) => sum + moduleValue(defs.get(m.defId), m.wear), 0),
    wear: wearing.length ? wearing.reduce((s, m) => s + m.wear, 0) / wearing.length : 0,
    loan: e.loan,
    stars: r?.reviews ? r.reviews.stars : null,
    crew: snap.crew.aboard,
  };
}

/** A summary for a station that hasn't run yet, from its scenario alone. */
export function summariseScenario(scenario: ScenarioDef, defs: ReadonlyMap<string, ModuleDef>): StationSummary {
  const wear = scenario.reliability.initialWear;
  const wearOf = (id: string) => wear[id] ?? 0;
  const wearing = scenario.layout.filter((e) => defs.get(e.module)?.reliability);
  return {
    netPerDay: 0,
    modules: scenario.layout.length,
    value: layoutValue(scenario.layout, defs, wearOf),
    wear: wearing.length ? wearing.reduce((s, e) => s + wearOf(e.id), 0) / wearing.length : 0,
    loan: scenario.economy.loan.principal,
    stars: null,
    crew: scenario.crew.roster.length,
  };
}

const isoPlus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

/** A company station's scenario, made from a shipped one: no goal, no board, nothing withheld from the catalogue. */
export function stationScenario(template: ScenarioDef, over: { id: string; name: string; seed: number; startDate: string; orbit?: OrbitConfig; cash: number; loan: number; extraWear?: number; contracts?: ScenarioDef['economy']['contracts'] }): ScenarioDef {
  const s = structuredClone(template);
  s.id = over.id;
  s.name = over.name;
  s.blurb = '';
  s.goal = { kind: 'none' };
  s.seed = over.seed;
  s.startDate = over.startDate;
  if (over.orbit) s.orbit = { ...over.orbit };
  s.economy.startCash = over.cash;
  s.economy.loan = { ...s.economy.loan, principal: over.loan };
  if (over.contracts) s.economy.contracts = structuredClone(over.contracts);
  delete s.catalogue;
  if (over.extraWear) {
    const w = s.reliability.initialWear;
    for (const e of s.layout) if (e.module !== 'core') w[e.id] = Math.min(0.85, (w[e.id] ?? 0) + over.extraWear);
  }
  return s;
}

/** A new company: the first posting, under a fresh name, with its usual cash and loan. */
export function newCompany(first: ScenarioDef, defs: ReadonlyMap<string, ModuleDef>, seed: number, name = 'Longlight Orbital'): CompanyState {
  const scenario = stationScenario(first, { id: 'co-1', name: first.name, seed: first.seed, startDate: first.startDate, cash: first.economy.startCash, loan: first.economy.loan.principal });
  const company: CompanyState = {
    app: 'stationkeeper-company',
    version: COMPANY_VERSION,
    name,
    rng: seed >>> 0,
    minutes: 0,
    startDate: first.startDate,
    cash: first.economy.startCash,
    stations: [{ id: 'co-1', name: first.name, scenario, save: null, summary: summariseScenario(scenario, defs), leftAt: 0, incidents: 0, incomeFactor: 1 }],
    activeId: 'co-1',
    listings: [],
    nextListingsAt: 0,
    milestones: [],
    lost: [],
    nextNo: 2,
  };
  return company;
}

export const activeStation = (c: CompanyState): CompanyStation => {
  const s = c.stations.find((x) => x.id === c.activeId);
  if (!s) throw new Error(`No active station "${c.activeId}"`);
  return s;
};

function pickName(c: CompanyState, rng: Rng): string {
  const taken = new Set([...c.stations.map((s) => s.name), ...c.listings.map((l) => l.name)]);
  for (let i = 0; i < 40; i++) {
    const n = `${NAME_A[rng.int(0, NAME_A.length - 1)]} ${NAME_B[rng.int(0, NAME_B.length - 1)]}`;
    if (!taken.has(n)) return n;
  }
  return `Station ${c.nextNo}`;
}

/** Off-screen news, for toasts. */
export interface CompanyNews {
  text: string;
  kind: 'ok' | 'warn';
}

export interface StepResult {
  /** Money the off-screen stations made (or cost) over the step, to move into the live station. */
  cash: number;
  news: CompanyNews[];
}

/**
 * Advance the company clock by `minutes` of live play: the deputies run the other stations, and the market turns over.
 * Returns the money to book into the live station. Deterministic from the company's own dice.
 */
export function stepCompany(c: CompanyState, minutes: number, templates: readonly ScenarioDef[], defs: ReadonlyMap<string, ModuleDef>): StepResult {
  const rng = new Rng(c.rng);
  const days = minutes / DAY;
  const news: CompanyNews[] = [];
  let cash = 0;
  for (const s of c.stations) {
    if (s.id === c.activeId) continue;
    cash += s.summary.netPerDay * DEPUTY_SHARE * s.incomeFactor * days;
    // A worn station has more to go wrong with it.
    if (rng.chance(Math.min(0.9, (0.1 + 0.4 * s.summary.wear) * days))) {
      s.incidents++;
      s.incomeFactor = Math.max(0.25, s.incomeFactor * INCIDENT_INCOME_HIT);
      const cost = s.summary.value * INCIDENT_COST_SHARE;
      cash -= cost;
      news.push({ text: `${s.name}: a breakdown the deputy couldn't fix cost ${cost.toFixed(1)}M in parts. Income is down until you visit.`, kind: 'warn' });
    }
  }
  c.minutes += minutes;
  c.listings = c.listings.filter((l) => l.expiresAt > c.minutes);
  if (c.minutes >= c.nextListingsAt) {
    while (c.listings.length < LISTINGS && templates.length > 0) c.listings.push(makeListing(c, rng, templates, defs));
    c.nextListingsAt = c.minutes + LISTING_EVERY_DAYS * DAY;
  }
  c.rng = rng.getState();
  return { cash, news };
}

/** A listed station's scenario, as it would be if bought now. */
function listingScenario(c: CompanyState, l: Pick<Listing, 'name' | 'seed' | 'extraWear'>, t: ScenarioDef, templates: readonly ScenarioDef[], id: string): ScenarioDef {
  return stationScenario(t, { id, name: l.name, seed: l.seed, startDate: isoPlus(c.startDate, c.minutes), cash: 0, loan: 0, extraWear: l.extraWear, contracts: templates[0]?.economy.contracts });
}

function makeListing(c: CompanyState, rng: Rng, templates: readonly ScenarioDef[], defs: ReadonlyMap<string, ModuleDef>): Listing {
  const t = templates[rng.int(0, templates.length - 1)]!;
  const base = { name: pickName(c, rng), seed: rng.int(1, 2 ** 31 - 1), extraWear: Math.round(rng.range(0.1, 0.3) * 100) / 100 };
  const est = estimateSummary(listingScenario(c, base, t, templates, 'listing'), defs);
  // Cheap for what it's made of, since someone gave up on it, but a station that earns well still asks more.
  const price = Math.max(10, Math.round(est.value * rng.range(0.3, 0.4) + Math.max(0, est.netPerDay) * 4));
  const listing: Listing = {
    id: `listing-${c.nextNo}`,
    ...base,
    templateId: t.id,
    price,
    expiresAt: c.minutes + LISTING_LIFE_DAYS * DAY,
    modules: t.layout.length,
    value: est.value,
    netPerDay: est.netPerDay,
  };
  c.nextNo++;
  return listing;
}

export type Purchase = { ok: true; cost: number; station: CompanyStation } | { ok: false; reason: string };

/**
 * What a station nobody has run yet would earn: a day of it run headless, with nothing breaking, as a deputy's guess.
 * Its wear and value stay as listed.
 */
export function estimateSummary(scenario: ScenarioDef, defs: ReadonlyMap<string, ModuleDef>): StationSummary {
  const base = summariseScenario(scenario, defs);
  const trial = new Simulation([...defs.values()], structuredClone(scenario), scenario.layout, { failures: false });
  trial.run(DAY);
  return { ...base, netPerDay: summarise(trial.snapshot(), scenario, defs).netPerDay };
}

function addStation(c: CompanyState, scenario: ScenarioDef, defs: ReadonlyMap<string, ModuleDef>): CompanyStation {
  const station: CompanyStation = { id: scenario.id, name: scenario.name, scenario, save: null, summary: estimateSummary(scenario, defs), leftAt: c.minutes, incidents: 0, incomeFactor: 1 };
  c.stations.push(station);
  return station;
}

/** Buy a listed derelict with `cash` in hand. The caller takes `cost` out of the live station. */
export function buyListing(c: CompanyState, listingId: string, cash: number, templates: readonly ScenarioDef[], defs: ReadonlyMap<string, ModuleDef>): Purchase {
  const l = c.listings.find((x) => x.id === listingId);
  if (!l) return { ok: false, reason: 'That station has been sold to someone else' };
  if (cash < l.price) return { ok: false, reason: `Not enough cash: it costs ${l.price}M` };
  const t = templates.find((x) => x.id === l.templateId);
  if (!t) return { ok: false, reason: 'That station is no longer for sale' };
  const scenario = listingScenario(c, l, t, templates, `co-${c.nextNo++}`);
  c.listings = c.listings.filter((x) => x !== l);
  return { ok: true, cost: l.price, station: addStation(c, scenario, defs) };
}

/** Found a new station in one of the offered orbits, kitted out like the first posting. */
export function foundStation(c: CompanyState, optionId: string, cash: number, kit: ScenarioDef, defs: ReadonlyMap<string, ModuleDef>): Purchase {
  const o = FOUND_OPTIONS.find((x) => x.id === optionId);
  if (!o) return { ok: false, reason: 'No such orbit' };
  if (cash < o.price) return { ok: false, reason: `Not enough cash: a launch costs ${o.price}M` };
  const rng = new Rng(c.rng);
  const id = `co-${c.nextNo++}`;
  const scenario = stationScenario(kit, { id, name: pickName(c, rng), seed: rng.int(1, 2 ** 31 - 1), startDate: isoPlus(c.startDate, c.minutes), orbit: o.orbit, cash: 0, loan: 0 });
  // Fresh from the factory: nothing worn yet.
  scenario.reliability.initialWear = {};
  c.rng = rng.getState();
  return { ok: true, cost: o.price, station: addStation(c, scenario, defs) };
}

/** Before leaving the live station: keep its state and what it's like, and the company's cash. */
export function leaveStation(c: CompanyState, save: SimSave, snap: SimSnapshot, defs: ReadonlyMap<string, ModuleDef>): void {
  const s = activeStation(c);
  s.save = save;
  s.summary = summarise(snap, s.scenario, defs);
  s.leftAt = c.minutes;
  c.cash = snap.economy.cash;
}

/**
 * Make `id` the live station. Returns its scenario and save, ready for the sim: its clock moved on to company time,
 * the company's cash in its account, and the wear the deputy let build up. A never-visited station returns no save.
 */
export function enterStation(c: CompanyState, id: string): { scenario: ScenarioDef; save: SimSave | null } {
  const s = c.stations.find((x) => x.id === id);
  if (!s) throw new Error(`No station "${id}"`);
  c.activeId = id;
  if (!s.save) {
    s.scenario.economy.startCash = c.cash;
    s.scenario.startDate = isoPlus(c.startDate, c.minutes);
    return { scenario: s.scenario, save: null };
  }
  const save = structuredClone(s.save);
  // Its clock shows company time: shift the start so start + elapsed lands on today.
  s.scenario.startDate = isoPlus(c.startDate, c.minutes - save.minutes);
  save.economy.cash = c.cash;
  const awayDays = Math.max(0, c.minutes - s.leftAt) / DAY;
  const rng = new Rng((c.rng ^ save.minutes) >>> 0);
  const ids = Object.keys(save.reliability.modules);
  for (const mid of ids) {
    const m = save.reliability.modules[mid]!;
    m.wear = Math.min(MAX_WEAR, m.wear + AWAY_WEAR_PER_DAY * awayDays);
  }
  for (let i = 0; i < s.incidents && ids.length > 0; i++) {
    const m = save.reliability.modules[ids[rng.int(0, ids.length - 1)]!]!;
    m.wear = Math.min(MAX_WEAR, m.wear + INCIDENT_WEAR);
  }
  s.incidents = 0;
  s.incomeFactor = 1;
  return { scenario: s.scenario, save };
}

/** A station lost while live, or sold. Returns false if it was the company's last. */
export function removeStation(c: CompanyState, id: string, outcome: LostStation['outcome']): boolean {
  const s = c.stations.find((x) => x.id === id);
  if (!s) return c.stations.length > 0;
  c.stations = c.stations.filter((x) => x !== s);
  c.lost.push({ name: s.name, outcome, at: c.minutes });
  if (c.activeId === id && c.stations[0]) c.activeId = c.stations[0].id;
  return c.stations.length > 0;
}

/** What the company is worth: cash, plus its stations, less what it owes. `live` replaces the active station's summary. */
export function companyValue(c: CompanyState, cash: number, live?: StationSummary): number {
  return c.stations.reduce((sum, s) => {
    const sum2 = s.id === c.activeId && live ? live : s.summary;
    return sum + sum2.value - sum2.loan;
  }, cash);
}

/** Income across the company per day, as things stand: the live station in full, the rest at the deputies' share. */
export function companyNetPerDay(c: CompanyState, live?: StationSummary): number {
  return c.stations.reduce((sum, s) => {
    if (s.id === c.activeId) return sum + (live ?? s.summary).netPerDay;
    return sum + s.summary.netPerDay * DEPUTY_SHARE * s.incomeFactor;
  }, 0);
}
