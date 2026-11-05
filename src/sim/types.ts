// Shared sim types. Pure data: no DOM, no Three.js.

export type Vec3 = readonly [number, number, number];

/** Load priority tiers. Commercial sheds first, then Essential; Critical only when nothing is left. */
export type Tier = 'critical' | 'essential' | 'commercial';
export const TIERS: readonly Tier[] = ['critical', 'essential', 'commercial'];

export type ModuleKind = 'core' | 'solar' | 'battery' | 'habitat' | 'radiator' | 'lifesupport';

export interface PortDef {
  id: string;
  /** Port position in the module's local frame, metres. */
  position: Vec3;
  /** Outward unit direction of the port in the module's local frame. */
  direction: Vec3;
}

export interface PowerSpec {
  /** Constant draw while powered, kW. */
  drawKw: number;
  tier: Tier;
  /** Peak generation in full sunlight, kW. */
  generationKw?: number;
  /** Usable storage capacity, kWh. */
  storageKwh?: number;
  maxChargeKw?: number;
  maxDischargeKw?: number;
}

export interface ThermalSpec {
  /** How far above the coolant loop this module runs per kW of heat it makes, °C/kW. */
  riseCPerKw: number;
  /** Radiators: heat rejected to space in full eclipse, kW. */
  rejectKw?: number;
  /** Radiators: fraction of `rejectKw` left in full sunlight (sun and Earth glare warm the panels). */
  sunlitFactor?: number;
}

/** Pressurised volume and the people who live in it. */
export interface CabinSpec {
  volumeM3: number;
  crew?: number;
  guests?: number;
}

/** Life support equipment: oxygen generation, CO2 removal, water recovery, and tanks. */
export interface LifeSupportSpec {
  /** Electrolysis capacity, kg of O2 per day. */
  o2KgPerDay: number;
  /** CO2 scrubber capacity, kg per day. */
  co2KgPerDay: number;
  /** Fraction of used water recovered while the rack runs, 0..1. */
  waterRecovery: number;
  o2TankKg: number;
  waterTankKg: number;
}

/** Visual-only hints for the grey-box builder. The sim ignores these. */
export interface GreyboxSpec {
  shape: string;
  light: Vec3;
  length?: number;
  radius?: number;
  wingLength?: number;
  wingWidth?: number;
  size?: Vec3;
}

export interface ModuleDef {
  id: string;
  name: string;
  kind: ModuleKind;
  description: string;
  power: PowerSpec;
  thermal: ThermalSpec;
  cabin?: CabinSpec;
  lifeSupport?: LifeSupportSpec;
  ports: PortDef[];
  greybox: GreyboxSpec;
  /** Optional .glb path relative to the site root, e.g. "models/core.glb". */
  model?: string;
  /** Solar arrays: local axis the wings rotate about, and the wing normal at rest. */
  gimbalAxis?: Vec3;
  panelNormal?: Vec3;
}

export interface Attachment {
  /** Instance id of the module we attach to. */
  to: string;
  /** Port id on that module. */
  port: string;
  /** Port id on this module. */
  via: string;
}

export interface LayoutEntry {
  id: string;
  module: string;
  attach?: Attachment;
}

export interface TierThreshold {
  /** Shed the tier when stored fraction drops below this. */
  shedBelow: number;
  /** Restore the tier when stored fraction rises above this. */
  restoreAbove: number;
}

/** Hysteresis band. For a "high" alarm: trip above `above`, clear below `below`. For a "low" alarm: trip below `below`, clear above `above`. */
export interface Band {
  above: number;
  below: number;
}

/** A temperature band, °C. */
export type TempBand = Band;

export interface LifeSupportConfig {
  perPerson: { o2KgPerDay: number; co2KgPerDay: number; waterKgPerDay: number };
  /** kg of water split to make 1 kg of O2 (≈ 1.125 by chemistry). */
  waterPerKgO2: number;
  /** Cabin temperature used to turn CO2 mass into partial pressure, °C. */
  cabinC: number;
  /** CO2 level the scrubbers hold when they can, mmHg. */
  co2SetpointMmHg: number;
  initialCo2MmHg: number;
  initialO2Fraction: number;
  initialWaterFraction: number;
  /** High alarms on CO2, mmHg. */
  co2Warn: Band;
  co2Danger: Band;
  /** Low alarms on tank fractions. */
  o2Low: Band;
  waterLow: Band;
  health: {
    /** Condition lost per hour for each mmHg of CO2 above the danger level. */
    co2PerMmHgHour: number;
    /** Condition lost per hour with no oxygen left. */
    hypoxiaPerHour: number;
    /** Condition lost per day with no water left. */
    thirstPerDay: number;
    /** Condition regained per hour when the air and water are fine. */
    recoverPerHour: number;
    /** Low alarm on crew condition, 0..1. */
    low: Band;
  };
}

export interface ThermalConfig {
  /** Loop temperature the radiator valves hold when they have capacity to spare, °C. */
  setpointC: number;
  initialC: number;
  /** Heat capacity of the coolant loop, kWh per °C. */
  loopKwhPerC: number;
  /** How fast module temperatures follow their target, minutes. */
  moduleLagMinutes: number;
  /** Commercial loads run at this fraction of their draw while throttled. */
  throttleFactor: number;
  throttle: TempBand;
  /** Per-tier overheat trips. Cooling modules (radiators) are never tripped. */
  trip: Record<Tier, TempBand>;
}

export interface OrbitConfig {
  altitudeKm: number;
  /** Angle between the orbit plane and the sun direction. 0 gives the longest eclipse. */
  betaDeg: number;
  /** Orbit phase at minute 0, measured from orbital noon. */
  startPhaseDeg: number;
}

export interface ScenarioDef {
  name: string;
  seed: number;
  startDate: string;
  orbit: OrbitConfig;
  power: {
    initialChargeFraction: number;
    thresholds: Record<Tier, TierThreshold>;
  };
  thermal: ThermalConfig;
  lifeSupport: LifeSupportConfig;
  layout: LayoutEntry[];
}

/** powered: running. throttled: running slow to save heat. shed: no power. overheated: tripped by heat. off: switched off. */
export type ModuleStatus = 'powered' | 'throttled' | 'shed' | 'overheated' | 'off';

export interface ModuleSnapshot {
  id: string;
  defId: string;
  /** Where this module joins its parent; undefined for the root. */
  attach: Attachment | undefined;
  name: string;
  kind: ModuleKind;
  tier: Tier;
  status: ModuleStatus;
  /** Draw when powered, kW. */
  drawKw: number;
  /** Actual draw this tick, kW. */
  actualDrawKw: number;
  generationKw: number;
  storedKwh: number;
  capacityKwh: number;
  enabled: boolean;
  /** Module temperature, °C. */
  tempC: number;
  /** Heat this module adds to the loop, kW. */
  heatKw: number;
  /** Heat this module rejects to space, kW (radiators). */
  rejectKw: number;
}

export interface OrbitSnapshot {
  /** Orbit phase from orbital noon, radians in [0, 2π). */
  phase: number;
  periodMinutes: number;
  /** 1 in full sun, 0 in umbra. */
  sunlight: number;
  sunlit: boolean;
  minutesToTransition: number;
  /** Sun direction in the station's local frame (x along track, y up, z = x × y). */
  sunDirection: Vec3;
}

export interface PowerSnapshot {
  generationKw: number;
  loadKw: number;
  demandKw: number;
  chargeKw: number;
  dischargeKw: number;
  curtailedKw: number;
  storedKwh: number;
  capacityKwh: number;
  /** Stored energy as a fraction 0..1. */
  charge: number;
  shedTiers: Record<Tier, boolean>;
}

export interface ThermalSnapshot {
  loopC: number;
  setpointC: number;
  /** Heat flowing into the loop, kW. */
  heatKw: number;
  /** Heat rejected to space this tick, kW. */
  rejectKw: number;
  /** What the radiators could reject right now, kW. */
  capacityKw: number;
  throttled: boolean;
  tripped: Record<Tier, boolean>;
  throttleAboveC: number;
  /** Lowest trip temperature (Commercial), for gauges. */
  tripAboveC: number;
}

export interface LifeSupportSnapshot {
  crew: number;
  guests: number;
  people: number;
  volumeM3: number;
  o2Kg: number;
  o2CapacityKg: number;
  /** O2 made and CO2 removed this tick, as daily rates. */
  o2MadeKgPerDay: number;
  o2UsedKgPerDay: number;
  co2RemovedKgPerDay: number;
  co2MmHg: number;
  co2WarnMmHg: number;
  co2DangerMmHg: number;
  waterKg: number;
  waterCapacityKg: number;
  /** Net water change, kg per day (negative when draining). */
  waterNetKgPerDay: number;
  /** Crew condition 0..1. */
  health: number;
  alarms: { co2Warn: boolean; co2Danger: boolean; o2Low: boolean; o2Out: boolean; waterLow: boolean; waterOut: boolean; healthLow: boolean };
}

export interface SimSnapshot {
  /** Elapsed in-game minutes (ticks). */
  minutes: number;
  /** Epoch milliseconds of the current in-game time. */
  timeMs: number;
  orbit: OrbitSnapshot;
  power: PowerSnapshot;
  thermal: ThermalSnapshot;
  lifeSupport: LifeSupportSnapshot;
  modules: ModuleSnapshot[];
  /** Ports with nothing attached, where new modules can go. */
  freePorts: { moduleId: string; portId: string }[];
}
