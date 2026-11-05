// Runtime validation for JSON data. JSON imports are untyped, so check shape before trusting it.
import {
  TIERS,
  type Attachment,
  type Band,
  type CabinSpec,
  type ContractDef,
  type EconomyConfig,
  type EndingsConfig,
  type LifeSupportConfig,
  type LifeSupportSpec,
  type GreyboxSpec,
  type LayoutEntry,
  type ModuleDef,
  type ModuleKind,
  type PortDef,
  type PowerSpec,
  type ReliabilityConfig,
  type ReliabilitySpec,
  type ScenarioDef,
  type ThermalConfig,
  type ThermalSpec,
  type Tier,
  type TierThreshold,
  type Vec3,
} from './types';

type Obj = Record<string, unknown>;

function fail(path: string, msg: string): never {
  throw new Error(`Invalid data at ${path}: ${msg}`);
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'expected an array');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, 'expected a string');
  return v;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected a number');
  return v;
}

function optNum(v: unknown, path: string): number | undefined {
  return v === undefined ? undefined : num(v, path);
}

function vec3(v: unknown, path: string): Vec3 {
  const a = arr(v, path);
  if (a.length !== 3) fail(path, 'expected [x, y, z]');
  return [num(a[0], path), num(a[1], path), num(a[2], path)];
}

function optVec3(v: unknown, path: string): Vec3 | undefined {
  return v === undefined ? undefined : vec3(v, path);
}

function tier(v: unknown, path: string): Tier {
  const s = str(v, path);
  if (!(TIERS as readonly string[]).includes(s)) fail(path, `unknown tier "${s}"`);
  return s as Tier;
}

const KINDS: readonly ModuleKind[] = ['core', 'solar', 'battery', 'habitat', 'radiator', 'lifesupport', 'lab', 'node'];

function kind(v: unknown, path: string): ModuleKind {
  const s = str(v, path);
  if (!(KINDS as readonly string[]).includes(s)) fail(path, `unknown module kind "${s}"`);
  return s as ModuleKind;
}

function port(v: unknown, path: string): PortDef {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    position: vec3(o.position, `${path}.position`),
    direction: vec3(o.direction, `${path}.direction`),
  };
}

function power(v: unknown, path: string): PowerSpec {
  const o = obj(v, path);
  const spec: PowerSpec = { drawKw: num(o.drawKw, `${path}.drawKw`), tier: tier(o.tier, `${path}.tier`) };
  const generationKw = optNum(o.generationKw, `${path}.generationKw`);
  const storageKwh = optNum(o.storageKwh, `${path}.storageKwh`);
  const maxChargeKw = optNum(o.maxChargeKw, `${path}.maxChargeKw`);
  const maxDischargeKw = optNum(o.maxDischargeKw, `${path}.maxDischargeKw`);
  if (generationKw !== undefined) spec.generationKw = generationKw;
  if (storageKwh !== undefined) spec.storageKwh = storageKwh;
  if (maxChargeKw !== undefined) spec.maxChargeKw = maxChargeKw;
  if (maxDischargeKw !== undefined) spec.maxDischargeKw = maxDischargeKw;
  return spec;
}

function thermal(v: unknown, path: string): ThermalSpec {
  const o = obj(v, path);
  const spec: ThermalSpec = { riseCPerKw: num(o.riseCPerKw, `${path}.riseCPerKw`) };
  const rejectKw = optNum(o.rejectKw, `${path}.rejectKw`);
  const sunlitFactor = optNum(o.sunlitFactor, `${path}.sunlitFactor`);
  if (rejectKw !== undefined) spec.rejectKw = rejectKw;
  if (sunlitFactor !== undefined) {
    if (sunlitFactor < 0 || sunlitFactor > 1) fail(`${path}.sunlitFactor`, 'expected a fraction 0..1');
    spec.sunlitFactor = sunlitFactor;
  }
  return spec;
}

function fraction(v: unknown, path: string): number {
  const n = num(v, path);
  if (n < 0 || n > 1) fail(path, 'expected a fraction 0..1');
  return n;
}

function positive(v: unknown, path: string): number {
  const n = num(v, path);
  if (n <= 0) fail(path, 'expected a positive number');
  return n;
}

function cabin(v: unknown, path: string): CabinSpec {
  const o = obj(v, path);
  const spec: CabinSpec = { volumeM3: positive(o.volumeM3, `${path}.volumeM3`) };
  const crew = optNum(o.crew, `${path}.crew`);
  const guests = optNum(o.guests, `${path}.guests`);
  if (crew !== undefined) spec.crew = crew;
  if (guests !== undefined) spec.guests = guests;
  return spec;
}

function lifeSupportSpec(v: unknown, path: string): LifeSupportSpec {
  const o = obj(v, path);
  return {
    o2KgPerDay: num(o.o2KgPerDay, `${path}.o2KgPerDay`),
    co2KgPerDay: num(o.co2KgPerDay, `${path}.co2KgPerDay`),
    waterRecovery: fraction(o.waterRecovery, `${path}.waterRecovery`),
    o2TankKg: num(o.o2TankKg, `${path}.o2TankKg`),
    waterTankKg: num(o.waterTankKg, `${path}.waterTankKg`),
  };
}

function reliabilitySpec(v: unknown, path: string): ReliabilitySpec {
  const o = obj(v, path);
  return {
    wearDays: positive(o.wearDays, `${path}.wearDays`),
    failPerDay: positive(o.failPerDay, `${path}.failPerDay`),
    serviceHours: positive(o.serviceHours, `${path}.serviceHours`),
  };
}

function greybox(v: unknown, path: string): GreyboxSpec {
  const o = obj(v, path);
  const spec: GreyboxSpec = { shape: str(o.shape, `${path}.shape`), light: vec3(o.light, `${path}.light`) };
  const length = optNum(o.length, `${path}.length`);
  const radius = optNum(o.radius, `${path}.radius`);
  const wingLength = optNum(o.wingLength, `${path}.wingLength`);
  const wingWidth = optNum(o.wingWidth, `${path}.wingWidth`);
  const size = optVec3(o.size, `${path}.size`);
  if (length !== undefined) spec.length = length;
  if (radius !== undefined) spec.radius = radius;
  if (wingLength !== undefined) spec.wingLength = wingLength;
  if (wingWidth !== undefined) spec.wingWidth = wingWidth;
  if (size !== undefined) spec.size = size;
  return spec;
}

export function parseModuleDefs(raw: unknown): ModuleDef[] {
  const root = obj(raw, 'modules.json');
  return arr(root.modules, 'modules').map((m, i) => {
    const path = `modules[${i}]`;
    const o = obj(m, path);
    const def: ModuleDef = {
      id: str(o.id, `${path}.id`),
      name: str(o.name, `${path}.name`),
      kind: kind(o.kind, `${path}.kind`),
      description: str(o.description, `${path}.description`),
      power: power(o.power, `${path}.power`),
      thermal: thermal(o.thermal, `${path}.thermal`),
      ports: arr(o.ports, `${path}.ports`).map((p, j) => port(p, `${path}.ports[${j}]`)),
      greybox: greybox(o.greybox, `${path}.greybox`),
    };
    if (o.model !== undefined) def.model = str(o.model, `${path}.model`);
    if (o.cabin !== undefined) def.cabin = cabin(o.cabin, `${path}.cabin`);
    if (o.lifeSupport !== undefined) def.lifeSupport = lifeSupportSpec(o.lifeSupport, `${path}.lifeSupport`);
    if (o.reliability !== undefined) def.reliability = reliabilitySpec(o.reliability, `${path}.reliability`);
    if (o.price !== undefined) def.price = positive(o.price, `${path}.price`);
    const gimbalAxis = optVec3(o.gimbalAxis, `${path}.gimbalAxis`);
    const panelNormal = optVec3(o.panelNormal, `${path}.panelNormal`);
    if (gimbalAxis) def.gimbalAxis = gimbalAxis;
    if (panelNormal) def.panelNormal = panelNormal;
    return def;
  });
}

function threshold(v: unknown, path: string): TierThreshold {
  const o = obj(v, path);
  return { shedBelow: num(o.shedBelow, `${path}.shedBelow`), restoreAbove: num(o.restoreAbove, `${path}.restoreAbove`) };
}

function band(v: unknown, path: string): Band {
  const o = obj(v, path);
  const b = { above: num(o.above, `${path}.above`), below: num(o.below, `${path}.below`) };
  if (b.below > b.above) fail(path, '"below" must not be higher than "above"');
  return b;
}

function thermalConfig(v: unknown): ThermalConfig {
  const o = obj(v, 'thermal');
  const trip = obj(o.trip, 'thermal.trip');
  const throttleFactor = num(o.throttleFactor, 'thermal.throttleFactor');
  if (throttleFactor <= 0 || throttleFactor > 1) fail('thermal.throttleFactor', 'expected a fraction in (0, 1]');
  const loopKwhPerC = num(o.loopKwhPerC, 'thermal.loopKwhPerC');
  if (loopKwhPerC <= 0) fail('thermal.loopKwhPerC', 'expected a positive number');
  return {
    setpointC: num(o.setpointC, 'thermal.setpointC'),
    initialC: num(o.initialC, 'thermal.initialC'),
    loopKwhPerC,
    moduleLagMinutes: num(o.moduleLagMinutes, 'thermal.moduleLagMinutes'),
    throttleFactor,
    throttle: band(o.throttle, 'thermal.throttle'),
    trip: {
      critical: band(trip.critical, 'thermal.trip.critical'),
      essential: band(trip.essential, 'thermal.trip.essential'),
      commercial: band(trip.commercial, 'thermal.trip.commercial'),
    },
  };
}

function lifeSupportConfig(v: unknown): LifeSupportConfig {
  const o = obj(v, 'lifeSupport');
  const pp = obj(o.perPerson, 'lifeSupport.perPerson');
  const h = obj(o.health, 'lifeSupport.health');
  return {
    perPerson: {
      o2KgPerDay: num(pp.o2KgPerDay, 'lifeSupport.perPerson.o2KgPerDay'),
      co2KgPerDay: num(pp.co2KgPerDay, 'lifeSupport.perPerson.co2KgPerDay'),
      waterKgPerDay: num(pp.waterKgPerDay, 'lifeSupport.perPerson.waterKgPerDay'),
    },
    waterPerKgO2: num(o.waterPerKgO2, 'lifeSupport.waterPerKgO2'),
    cabinC: num(o.cabinC, 'lifeSupport.cabinC'),
    co2SetpointMmHg: num(o.co2SetpointMmHg, 'lifeSupport.co2SetpointMmHg'),
    initialCo2MmHg: num(o.initialCo2MmHg, 'lifeSupport.initialCo2MmHg'),
    initialO2Fraction: fraction(o.initialO2Fraction, 'lifeSupport.initialO2Fraction'),
    initialWaterFraction: fraction(o.initialWaterFraction, 'lifeSupport.initialWaterFraction'),
    co2Warn: band(o.co2Warn, 'lifeSupport.co2Warn'),
    co2Danger: band(o.co2Danger, 'lifeSupport.co2Danger'),
    o2Low: band(o.o2Low, 'lifeSupport.o2Low'),
    waterLow: band(o.waterLow, 'lifeSupport.waterLow'),
    health: {
      co2PerMmHgHour: num(h.co2PerMmHgHour, 'lifeSupport.health.co2PerMmHgHour'),
      hypoxiaPerHour: num(h.hypoxiaPerHour, 'lifeSupport.health.hypoxiaPerHour'),
      thirstPerDay: num(h.thirstPerDay, 'lifeSupport.health.thirstPerDay'),
      recoverPerHour: num(h.recoverPerHour, 'lifeSupport.health.recoverPerHour'),
      low: band(h.low, 'lifeSupport.health.low'),
    },
  };
}

function reliabilityConfig(v: unknown): ReliabilityConfig {
  const o = obj(v, 'reliability');
  const initial = obj(o.initialWear, 'reliability.initialWear');
  const teams = num(o.repairTeams, 'reliability.repairTeams');
  if (!Number.isInteger(teams) || teams < 1) fail('reliability.repairTeams', 'expected a whole number of at least 1');
  const initialWear: Record<string, number> = {};
  for (const [id, w] of Object.entries(initial)) initialWear[id] = fraction(w, `reliability.initialWear.${id}`);
  const worn = band(o.worn, 'reliability.worn');
  if (worn.above > 1 || worn.below < 0) fail('reliability.worn', 'expected wear fractions 0..1');
  return {
    ratedC: num(o.ratedC, 'reliability.ratedC'),
    doublingC: positive(o.doublingC, 'reliability.doublingC'),
    newFailShare: fraction(o.newFailShare, 'reliability.newFailShare'),
    repairFactor: positive(o.repairFactor, 'reliability.repairFactor'),
    repairTeams: teams,
    worn,
    initialWear,
  };
}

function nonNegative(v: unknown, path: string): number {
  const n = num(v, path);
  if (n < 0) fail(path, 'expected zero or more');
  return n;
}

function contract(v: unknown, path: string): ContractDef {
  const o = obj(v, path);
  const def: ContractDef = {
    id: str(o.id, `${path}.id`),
    title: str(o.title, `${path}.title`),
    sponsor: str(o.sponsor, `${path}.sponsor`),
    description: str(o.description, `${path}.description`),
    labHours: positive(o.labHours, `${path}.labHours`),
    deadlineHours: positive(o.deadlineHours, `${path}.deadlineHours`),
    reward: positive(o.reward, `${path}.reward`),
    penalty: nonNegative(o.penalty, `${path}.penalty`),
  };
  if (def.deadlineHours < def.labHours) fail(`${path}.deadlineHours`, 'shorter than the lab time it needs');
  if (o.stable !== undefined) {
    if (typeof o.stable !== 'boolean') fail(`${path}.stable`, 'expected true or false');
    def.stable = o.stable;
  }
  return def;
}

function economyConfig(v: unknown): EconomyConfig {
  const o = obj(v, 'economy');
  const loan = obj(o.loan, 'economy.loan');
  const c = obj(o.contracts, 'economy.contracts');
  const whole = (x: unknown, path: string) => {
    const n = nonNegative(x, path);
    if (!Number.isInteger(n)) fail(path, 'expected a whole number');
    return n;
  };
  const pool = arr(c.pool, 'economy.contracts.pool').map((x, i) => contract(x, `economy.contracts.pool[${i}]`));
  const ids = new Set<string>();
  for (const d of pool) {
    if (ids.has(d.id)) fail('economy.contracts.pool', `duplicate contract "${d.id}"`);
    ids.add(d.id);
  }
  return {
    startCash: num(o.startCash, 'economy.startCash'),
    loan: { principal: nonNegative(loan.principal, 'economy.loan.principal'), ratePerQuarter: fraction(loan.ratePerQuarter, 'economy.loan.ratePerQuarter') },
    quarterDays: positive(o.quarterDays, 'economy.quarterDays'),
    guestPerDay: nonNegative(o.guestPerDay, 'economy.guestPerDay'),
    operationsPerDay: nonNegative(o.operationsPerDay, 'economy.operationsPerDay'),
    deliveryHours: nonNegative(o.deliveryHours, 'economy.deliveryHours'),
    serviceCostShare: fraction(o.serviceCostShare, 'economy.serviceCostShare'),
    repairCostShare: fraction(o.repairCostShare, 'economy.repairCostShare'),
    contracts: {
      maxOffers: whole(c.maxOffers, 'economy.contracts.maxOffers'),
      offerEveryHours: positive(c.offerEveryHours, 'economy.contracts.offerEveryHours'),
      offerLifeHours: positive(c.offerLifeHours, 'economy.contracts.offerLifeHours'),
      startingOffers: whole(c.startingOffers, 'economy.contracts.startingOffers'),
      pool,
    },
  };
}

function attachment(v: unknown, path: string): Attachment {
  const o = obj(v, path);
  return { to: str(o.to, `${path}.to`), port: str(o.port, `${path}.port`), via: str(o.via, `${path}.via`) };
}

function endingsConfig(raw: unknown): EndingsConfig {
  const o = obj(raw, 'endings');
  const cfg: EndingsConfig = {
    overdraftLimit: num(o.overdraftLimit, 'endings.overdraftLimit'),
    overdrawnQuarters: num(o.overdrawnQuarters, 'endings.overdrawnQuarters'),
    evacuateBelow: num(o.evacuateBelow, 'endings.evacuateBelow'),
  };
  if (cfg.overdraftLimit < 0) fail('endings.overdraftLimit', 'must be zero or more');
  if (!Number.isInteger(cfg.overdrawnQuarters) || cfg.overdrawnQuarters < 1) fail('endings.overdrawnQuarters', 'must be a whole number, 1 or more');
  if (cfg.evacuateBelow < 0 || cfg.evacuateBelow >= 1) fail('endings.evacuateBelow', 'must be from 0 to below 1');
  return cfg;
}

export function parseScenario(raw: unknown): ScenarioDef {
  const o = obj(raw, 'scenario');
  const orbit = obj(o.orbit, 'orbit');
  const pw = obj(o.power, 'power');
  const th = obj(pw.thresholds, 'power.thresholds');
  const layout: LayoutEntry[] = arr(o.layout, 'layout').map((e, i) => {
    const path = `layout[${i}]`;
    const eo = obj(e, path);
    const entry: LayoutEntry = { id: str(eo.id, `${path}.id`), module: str(eo.module, `${path}.module`) };
    if (eo.attach !== undefined) entry.attach = attachment(eo.attach, `${path}.attach`);
    return entry;
  });
  const reliability = reliabilityConfig(o.reliability);
  for (const id of Object.keys(reliability.initialWear)) {
    if (!layout.some((e) => e.id === id)) fail(`reliability.initialWear.${id}`, 'no module with that id in the layout');
  }
  return {
    name: str(o.name, 'name'),
    seed: num(o.seed, 'seed'),
    startDate: str(o.startDate, 'startDate'),
    orbit: {
      altitudeKm: num(orbit.altitudeKm, 'orbit.altitudeKm'),
      betaDeg: num(orbit.betaDeg, 'orbit.betaDeg'),
      startPhaseDeg: num(orbit.startPhaseDeg, 'orbit.startPhaseDeg'),
    },
    power: {
      initialChargeFraction: num(pw.initialChargeFraction, 'power.initialChargeFraction'),
      thresholds: {
        critical: threshold(th.critical, 'power.thresholds.critical'),
        essential: threshold(th.essential, 'power.thresholds.essential'),
        commercial: threshold(th.commercial, 'power.thresholds.commercial'),
      },
    },
    thermal: thermalConfig(o.thermal),
    lifeSupport: lifeSupportConfig(o.lifeSupport),
    reliability,
    economy: economyConfig(o.economy),
    endings: endingsConfig(o.endings),
    layout,
  };
}
