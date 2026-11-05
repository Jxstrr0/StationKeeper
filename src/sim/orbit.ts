// Circular low Earth orbit with a cylindrical Earth shadow. Real constants, simple geometry.
//
// Station-local frame (used by the view too):
//   x = along-track (velocity), y = radial up (away from Earth), z = x × y (opposite the orbit normal).
// Orbit phase u is measured from orbital noon (sun straight overhead).
import type { OrbitConfig, OrbitSnapshot, Vec3 } from './types';

export const EARTH_RADIUS_KM = 6371;
const MU_KM3_S2 = 398_600.4418;
/** Half-width of the soft shadow edge, km. Keeps the light change smooth instead of a hard switch. */
const PENUMBRA_KM = 25;
const TWO_PI = Math.PI * 2;

export interface OrbitModel {
  radiusKm: number;
  periodMinutes: number;
  beta: number;
  startPhase: number;
  /** Half the eclipse arc, radians. Shadow spans phase (π − a, π + a). 0 when the orbit never enters shadow. */
  eclipseHalfAngle: number;
}

export function createOrbit(cfg: OrbitConfig): OrbitModel {
  const radiusKm = EARTH_RADIUS_KM + cfg.altitudeKm;
  const periodMinutes = (TWO_PI * Math.sqrt(radiusKm ** 3 / MU_KM3_S2)) / 60;
  const beta = (cfg.betaDeg * Math.PI) / 180;
  const k = Math.sqrt(1 - (EARTH_RADIUS_KM / radiusKm) ** 2) / Math.cos(beta);
  return {
    radiusKm,
    periodMinutes,
    beta,
    startPhase: (cfg.startPhaseDeg * Math.PI) / 180,
    eclipseHalfAngle: k >= 1 ? 0 : Math.acos(k),
  };
}

function wrap(angle: number): number {
  const a = angle % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

export function phaseAt(orbit: OrbitModel, minutes: number): number {
  return wrap(orbit.startPhase + (TWO_PI * minutes) / orbit.periodMinutes);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 1 in full sunlight, 0 in Earth's umbra, smooth across the edge. */
export function sunlightAt(orbit: OrbitModel, phase: number): number {
  const c = Math.cos(phase) * Math.cos(orbit.beta);
  if (c >= 0) return 1; // On the day side of the terminator plane.
  const distFromShadowAxis = orbit.radiusKm * Math.sqrt(1 - c * c);
  return smoothstep(EARTH_RADIUS_KM - PENUMBRA_KM, EARTH_RADIUS_KM + PENUMBRA_KM, distFromShadowAxis);
}

/** Unit sun direction in the station-local frame. */
export function sunDirection(orbit: OrbitModel, phase: number): Vec3 {
  const cb = Math.cos(orbit.beta);
  return [-Math.sin(phase) * cb, Math.cos(phase) * cb, -Math.sin(orbit.beta)];
}

export function isInShadowArc(orbit: OrbitModel, phase: number): boolean {
  const a = orbit.eclipseHalfAngle;
  return a > 0 && phase > Math.PI - a && phase < Math.PI + a;
}

/** Minutes until the next sunrise or sunset. Infinity if the orbit never enters shadow. */
export function minutesToTransition(orbit: OrbitModel, phase: number): number {
  const a = orbit.eclipseHalfAngle;
  if (a === 0) return Infinity;
  const target = isInShadowArc(orbit, phase) ? Math.PI + a : Math.PI - a;
  return (wrap(target - phase) / TWO_PI) * orbit.periodMinutes;
}

export function orbitSnapshot(orbit: OrbitModel, minutes: number): OrbitSnapshot {
  const phase = phaseAt(orbit, minutes);
  return {
    phase,
    periodMinutes: orbit.periodMinutes,
    sunlight: sunlightAt(orbit, phase),
    sunlit: !isInShadowArc(orbit, phase),
    minutesToTransition: minutesToTransition(orbit, phase),
    sunDirection: sunDirection(orbit, phase),
  };
}
