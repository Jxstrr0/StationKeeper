// Shared sim types. Pure data: no DOM, no Three.js.

export type Vec3 = readonly [number, number, number];

/** Load priority tiers. Commercial sheds first, then Essential; Critical only when nothing is left. */
export type Tier = 'critical' | 'essential' | 'commercial';
export const TIERS: readonly Tier[] = ['critical', 'essential', 'commercial'];

export type ModuleKind = 'core' | 'solar' | 'battery' | 'habitat' | 'radiator' | 'lifesupport' | 'lab' | 'node' | 'quarters' | 'galley' | 'cupola';

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
  /** Beds for crew. The crew themselves come from the roster, not the modules. */
  bunks?: number;
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

/** How a module wears and fails. Modules without one never fail. */
export interface ReliabilitySpec {
  /** Days of running at rated temperature to go from new to fully worn. */
  wearDays: number;
  /** Failure chance per day when fully worn at rated temperature. A new module fails at a small fraction of this. */
  failPerDay: number;
  /** Crew hours for a planned service. Repairing a failure takes longer (see ReliabilityConfig.repairFactor). */
  serviceHours: number;
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
  reliability?: ReliabilitySpec;
  comfort?: ComfortSpec;
  /** Cost to build, launch included, in $ millions. Modules without a price can't be ordered. */
  price?: number;
  ports: PortDef[];
  greybox: GreyboxSpec;
  /** Optional .glb path relative to the site root, e.g. "models/core.glb". */
  model?: string;
  /** Solar arrays: local axis the wings rotate about, and the wing normal at rest. */
  gimbalAxis?: Vec3;
  panelNormal?: Vec3;
}

/** Something that lifts crew morale while the module runs. */
export interface ComfortSpec {
  /** Added to where everyone's morale settles, 0..1. */
  morale: number;
  /** How many it serves. With more crew aboard than seats, the lift is shared out. */
  seats: number;
  /** Share added to every guest's fare while it runs (guests pay for the view, seat or no seat). Default 0. */
  guestFare?: number;
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

/** What can spoil a guest's stay. */
export type GuestComplaint = 'hot' | 'badAir' | 'dark';

/** What guests said at a quarter's close: stars from the quarter's average reputation, and their main gripe. */
export interface GuestReview {
  stars: number;
  reputation: number;
  complaint: GuestComplaint | null;
}

/** How guests judge the station, and what that does to fares. */
export interface GuestConfig {
  /** Reputation at the start, 0..1. */
  start: number;
  /** Where reputation settles when nothing is wrong. */
  base: number;
  /** Share of the gap to where it is heading closed per hour. */
  perHour: number;
  /** Taken off where reputation is heading while each applies. `dark` is scaled by the share of guest places idle. */
  penalties: Record<GuestComplaint, number>;
  /** Fares are multiplied by `worst` at reputation 0, rising in a straight line to `best` at 1. */
  fare: { worst: number; best: number };
  /** The poor-reviews warning, with hysteresis. */
  poor: Band;
}

export interface GuestSnapshot {
  /** Any guest places on the station at all. */
  hasGuests: boolean;
  reputation: number;
  /** Where it is heading. */
  target: number;
  /** Stars out of five at today's reputation. */
  stars: number;
  /** What fares are multiplied by at today's reputation. */
  fareFactor: number;
  /** What is bothering guests right now. */
  complaints: GuestComplaint[];
  /** Reviews are poor enough to warn about. */
  poor: boolean;
}

export interface ScenarioDef {
  /** Stable id, used to match a save to its scenario. */
  id: string;
  name: string;
  /** A line or two for the scenario picker. */
  blurb: string;
  goal: GoalDef;
  seed: number;
  startDate: string;
  orbit: OrbitConfig;
  power: {
    initialChargeFraction: number;
    thresholds: Record<Tier, TierThreshold>;
  };
  thermal: ThermalConfig;
  lifeSupport: LifeSupportConfig;
  reliability: ReliabilityData;
  economy: EconomyConfig;
  endings: EndingsConfig;
  crew: CrewConfig;
  guests: GuestConfig;
  /** Module ids this station can order. Without it, every module with a price is for sale. */
  catalogue?: string[];
  layout: LayoutEntry[];
}

/**
 * What the board wants from this station. With `days`, it must be done by then or the board replaces you;
 * without, there's no rush.
 */
export type GoalDef =
  | { kind: 'repayLoan'; days?: number }
  | { kind: 'cash'; amount: number; days?: number }
  | { kind: 'contracts'; count: number; days?: number };

export type GoalKind = GoalDef['kind'];

export type CrewRole = 'engineer' | 'scientist';

export interface CrewConfig {
  /** Who is aboard at the start. */
  roster: { name: string; role: CrewRole }[];
  /** Names for new hires, used in order and then reused with a number. */
  names: string[];
  /** Paid when someone is hired, for the contract and the seat up, $ millions. */
  signingFee: number;
  /** Each crew member's pay, $ millions a day. */
  wagePerDay: number;
  /** Hours from hiring to arriving aboard. */
  arrivalHours: number;
  /** A lab with no scientist to run it works at this share of its speed. */
  unstaffedLabFactor: number;
  needs: CrewNeedsConfig;
  /** Different kinds of comfort stack, biggest lift first, each further kind counting for this share of the one before. */
  comfortStack: number;
  /** A one-off payment to everyone aboard that lifts morale at once. */
  bonus: {
    /** $ millions per person aboard. */
    perPerson: number;
    /** Added to each person's morale. */
    morale: number;
    /** Hours before another can be paid. */
    cooldownHours: number;
  };
}

/** Rest, morale, and illness, per person. Fatigue and morale run 0..1. */
export interface CrewNeedsConfig {
  /** Fatigue gained per hour on shift, and lost per hour off it. */
  fatiguePerWorkHour: number;
  restPerHour: number;
  /** On shift past this, a rested colleague takes over if there is one. */
  tiredAbove: number;
  /** At full fatigue someone is exhausted and stops work until fatigue falls below this. "Rested" also means below this. */
  restedBelow: number;
  morale: {
    start: number;
    /** Where morale settles when nothing is wrong. */
    base: number;
    /** How quickly morale closes on where it is heading: share of the gap per hour. */
    perHour: number;
    /** Taken off the settling point while each applies to the person. */
    penalties: { tired: number; exhausted: number; sick: number; badAir: number; hot: number };
    /** Low-morale warning, with hysteresis. */
    low: Band;
    /** Below this for `resignHours` straight, and they resign. */
    resignBelow: number;
    resignHours: number;
    /**
     * How fast people work, by morale: `floor` of full speed when miserable, full speed at `steadyAt`, and `best`
     * when entirely content. Repairs and lab time go at this pace.
     */
    pace: { floor: number; steadyAt: number; best: number };
  };
  illness: {
    /** Chance per person per day of falling ill. */
    perDay: number;
    /** Multipliers on that chance while tired, and while the air is bad. */
    tiredFactor: number;
    badAirFactor: number;
    /** Hours off duty. */
    hours: number;
  };
}

/** What a crew member is doing now. */
export type CrewStatus = 'inFlight' | 'onShift' | 'resting' | 'exhausted' | 'sick';

export interface CrewMemberSnapshot {
  id: string;
  name: string;
  role: CrewRole;
  /** Hours until they arrive, or null if aboard. */
  arrivesInHours: number | null;
  status: CrewStatus;
  fatigue: number;
  morale: number;
  /** Past the tired line. */
  tired: boolean;
  /** Hours until they're well again, while sick. */
  sickHoursLeft: number | null;
  /** Hours until they resign, while their morale is below the resignation line. */
  resignsInHours: number | null;
  /** Morale below the warning line. */
  moraleLow: boolean;
  /** How fast they work at their current morale: 1 is full speed. */
  pace: number;
}

export interface CrewSnapshot {
  /** Aboard first, then on their way. */
  members: CrewMemberSnapshot[];
  aboard: number;
  /** Bunks on the station, and how many are taken by people aboard or on their way. */
  bunks: number;
  bunksTaken: number;
  /** Aboard, by role. */
  engineers: number;
  scientists: number;
  /** Fit to work: aboard, not sick, not exhausted. Engineers fit to work are the repair teams. */
  fitEngineers: number;
  fitScientists: number;
  labs: number;
  wagesPerDay: number;
  signingFee: number;
  wagePerDay: number;
  arrivalHours: number;
  /** What the running comforts add to everyone's morale now, after sharing out the seats. */
  comfortLift: number;
  comfortSeats: number;
  /** Each kind of comfort running, biggest lift first: what it adds after sharing and stacking, and its seats. */
  comforts: { name: string; lift: number; seats: number }[];
  /** A bonus for everyone aboard: what it costs now, and hours until one can be paid again (null if it can now). */
  bonusCost: number;
  bonusMorale: number;
  bonusReadyInHours: number | null;
}

/** How a game can end, besides the goal. */
export interface EndingsConfig {
  /** Cash below minus this and the bank takes the station at once. $ millions. */
  overdraftLimit: number;
  /** Close this many quarters in a row overdrawn and the bank takes it too. */
  overdrawnQuarters: number;
  /** Crew health below this and they are evacuated: the station is abandoned. */
  evacuateBelow: number;
}

/** Ways to lose. Reaching the goal is not an ending: play carries on. */
export type Outcome = 'bankrupt' | 'evacuated' | 'replaced';

export interface GoalSnapshot {
  kind: GoalKind;
  /** Where the station stands: loan left for repayLoan, cash for cash, contracts delivered for contracts. */
  current: number;
  /** What it must reach: 0 loan, the cash amount, or the contract count. */
  target: number;
  /** 0..1, for a progress bar. */
  progress: number;
  /** The board's deadline, or null if there isn't one. */
  deadlineAtMinutes: number | null;
}

export interface EndingSnapshot {
  /** Set once the game is lost; the sim stops ticking. */
  outcome: Outcome | null;
  endedAtMinutes: number | null;
  /** When the goal was reached, or null if it hasn't been. */
  goalAtMinutes: number | null;
  goal: GoalSnapshot;
  /** Quarters closed overdrawn in a row, so far. */
  overdrawnCloses: number;
  overdrawnQuarters: number;
  overdraftLimit: number;
  evacuateBelow: number;
}

/** Money is in $ millions throughout. */
export interface EconomyConfig {
  startCash: number;
  loan: { principal: number; ratePerQuarter: number };
  /** Business quarters are compressed: one quarter is this many in-game days. */
  quarterDays: number;
  /** Paid per guest per day while their habitat is running. */
  guestPerDay: number;
  /** Crew wages and ground operations, per day. */
  operationsPerDay: number;
  /** Hours from ordering a module to it docking. */
  deliveryHours: number;
  /** Spare parts for a service and for a repair, as shares of the module's price. */
  serviceCostShare: number;
  repairCostShare: number;
  contracts: {
    maxOffers: number;
    offerEveryHours: number;
    offerLifeHours: number;
    startingOffers: number;
    /** What sponsors may offer in this scenario. */
    pool: ContractDef[];
  };
}

/** A research contract a sponsor may offer. */
export interface ContractDef {
  id: string;
  title: string;
  sponsor: string;
  description: string;
  /** Hours of lab time needed. */
  labHours: number;
  /** Hours from accepting to the deadline. */
  deadlineHours: number;
  reward: number;
  /** Charged if the deadline passes or the contract is abandoned. */
  penalty: number;
  /** Only counts lab time while the coolant loop is not throttled. */
  stable?: boolean;
}

export type LedgerCategory = 'guests' | 'contracts' | 'wages' | 'operations' | 'interest' | 'construction' | 'repairs' | 'penalties';
export type Ledger = Record<LedgerCategory, number>;

export interface ContractSnapshot {
  uid: string;
  defId: string;
  title: string;
  sponsor: string;
  description: string;
  labHours: number;
  /** Hours allowed from signing to delivery. */
  deadlineHours: number;
  progressHours: number;
  reward: number;
  penalty: number;
  stable: boolean;
  /** Offers: hours until the offer lapses. Active: hours until the deadline. */
  hoursLeft: number;
  /** Active and short of time: the work left is close to (or more than) the time left. */
  atRisk: boolean;
}

export interface DeliverySnapshot {
  moduleId: string;
  defId: string;
  name: string;
  to: string;
  port: string;
  hoursLeft: number;
}

export interface QuarterReport {
  quarter: number;
  ledger: Ledger;
  net: number;
  cash: number;
  loan: number;
  contractsDone: number;
  contractsFailed: number;
  /** Share of the quarter the guest habitats were running, 0..1. */
  guestUptime: number;
  failures: number;
  /** The guests' reviews for the quarter. Absent when there were no guests to post any. */
  reviews?: GuestReview;
}

export interface EconomySnapshot {
  cash: number;
  loan: number;
  ratePerQuarter: number;
  /** 1-based number of the quarter under way. */
  quarter: number;
  /** How far through the quarter, 0..1. */
  quarterProgress: number;
  ledger: Ledger;
  /** Running income minus running costs right now, per day (no one-off items). */
  netPerDay: number;
  lastReport: QuarterReport | null;
  offers: ContractSnapshot[];
  active: ContractSnapshot[];
  /** Research labs on the station; each can run one contract. */
  labs: number;
  /** What each habitat's guests pay a day while it runs, by module id, with the comforts' fare lift. */
  guestIncomePerDay: Record<string, number>;
  /** Share the running comforts add to every guest's fare. */
  fareLift: number;
  /** What fares are multiplied by now, comforts and reputation together. */
  fareFactor: number;
  deliveries: DeliverySnapshot[];
}

export interface ReliabilityConfig {
  /** Modules run at or below this temperature wear at their base rate, °C. */
  ratedC: number;
  /** Wear and failure chance double for every this many °C above `ratedC`. */
  doublingC: number;
  /** Share of the fully-worn failure chance a brand new module has, 0..1. */
  newFailShare: number;
  /** Repairing a failed module takes this many times its service hours. */
  repairFactor: number;
  /** How many repairs or services the crew can work on at once: the engineers aboard. Set by the sim. */
  repairTeams: number;
  /** Raise the "due for service" warning at this wear (with hysteresis). */
  worn: Band;
  /** Starting wear of modules in the scenario layout, by instance id. Others start new. */
  initialWear: Record<string, number>;
}

/** Reliability settings as the scenario gives them. Repair teams aren't data: there is one per engineer aboard. */
export type ReliabilityData = Omit<ReliabilityConfig, 'repairTeams'>;

/**
 * powered: running. throttled: running slow to save heat. shed: no power. overheated: tripped by heat.
 * off: switched off. failed: broken until repaired. servicing: offline while the crew works on it.
 */
export type ModuleStatus = 'powered' | 'throttled' | 'shed' | 'overheated' | 'off' | 'failed' | 'servicing';

export interface RepairSnapshot {
  /** "service" for planned work on a working module, "repair" for a failed one. */
  kind: 'service' | 'repair';
  /** False while waiting for a free crew team. */
  active: boolean;
  hoursLeft: number;
  /** Place in the queue, 0 for work in progress. */
  queuePosition: number;
}

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
  /** 0 new, 1 fully worn. Always 0 for modules that never fail. */
  wear: number;
  /** Chance of failing in the next day at the current wear and temperature, 0..1. */
  failChancePerDay: number;
  /** Whether this module can wear and fail at all. */
  canFail: boolean;
  /** Worn enough that a service is due (with hysteresis). */
  dueForService: boolean;
  repair: RepairSnapshot | null;
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
  economy: EconomySnapshot;
  /** What is wrong, and why: a graph of problems, each naming the problems that cause it. */
  ending: EndingSnapshot;
  crew: CrewSnapshot;
  guests: GuestSnapshot;
  warnings: StationWarning[];
}

export type WarningSeverity = 'info' | 'warn' | 'alarm';

export type WarningKind =
  | 'eclipse'
  | 'batteryLimit'
  | 'sunlitRadiators'
  | 'moduleFailed'
  | 'moduleServicing'
  | 'moduleOff'
  | 'moduleWorn'
  | 'loadShed'
  | 'throttled'
  | 'tripped'
  | 'co2'
  | 'o2'
  | 'water'
  | 'crewCondition'
  | 'guestsIdle'
  | 'contractAtRisk'
  | 'overdrawn'
  | 'noEngineers'
  | 'labUnstaffed'
  | 'crewExhausted'
  | 'crewSick'
  | 'moraleLow'
  | 'reviewsPoor';

export interface StationWarning {
  /** Stable id, like "failed:radiator-1" or "shed:commercial". */
  key: string;
  kind: WarningKind;
  severity: WarningSeverity;
  moduleId?: string;
  tier?: Tier;
  contractId?: string;
  /** A name for the text, such as a contract title. */
  label?: string;
  /** A reading for the text: mmHg for CO₂, a 0..1 fraction for tanks, crew condition, and wear. */
  value?: number;
  /** A limit for the text to compare `value` with, such as the overdraft the bank allows. */
  limit?: number;
  /** The last warning before the game is lost, such as a final quarter in the red. */
  final?: boolean;
  /** Hours left before something happens, such as a resignation. */
  hours?: number;
  /** Keys of the warnings that cause this one. Empty for a root cause. */
  causes: string[];
}
