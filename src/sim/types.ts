// Shared sim types. Pure data: no DOM, no Three.js.

export type Vec3 = readonly [number, number, number];

/** Load priority tiers. Commercial sheds first, then Essential; Critical only when nothing is left. */
export type Tier = 'critical' | 'essential' | 'commercial';
export const TIERS: readonly Tier[] = ['critical', 'essential', 'commercial'];

export type ModuleKind = 'core' | 'solar' | 'battery' | 'habitat';

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
  layout: LayoutEntry[];
}

export type ModuleStatus = 'powered' | 'shed' | 'off';

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

export interface SimSnapshot {
  /** Elapsed in-game minutes (ticks). */
  minutes: number;
  /** Epoch milliseconds of the current in-game time. */
  timeMs: number;
  orbit: OrbitSnapshot;
  power: PowerSnapshot;
  modules: ModuleSnapshot[];
}
