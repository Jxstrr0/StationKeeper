// Runtime validation for JSON data. JSON imports are untyped, so check shape before trusting it.
import {
  TIERS,
  type Attachment,
  type GreyboxSpec,
  type LayoutEntry,
  type ModuleDef,
  type ModuleKind,
  type PortDef,
  type PowerSpec,
  type ScenarioDef,
  type TempBand,
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

const KINDS: readonly ModuleKind[] = ['core', 'solar', 'battery', 'habitat', 'radiator'];

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

function band(v: unknown, path: string): TempBand {
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

function attachment(v: unknown, path: string): Attachment {
  const o = obj(v, path);
  return { to: str(o.to, `${path}.to`), port: str(o.port, `${path}.port`), via: str(o.via, `${path}.via`) };
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
    layout,
  };
}
