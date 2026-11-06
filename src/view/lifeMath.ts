// Pure maths behind the station's wear, cargo deliveries and lit windows. No Three.js here, so it can be tested in node.

import type { ModuleStatus } from '../sim/types';

/** How a module's hull should look at its wear and status. All in 0..1. */
export interface WearLook {
  /** Grime and darkening over the panels. */
  grime: number;
  /** Dark scorch patches. */
  scorch: number;
  /** Peak of the faint warm glow along the scorch edges (failed modules only). */
  ember: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Wear to grime, scorch and ember. A new module is clean; grime creeps in from 15% wear and is full at 90%. Scorch only
 * shows past half wear. A failed module is always visibly burnt and glows faintly at the seams, whatever its wear.
 */
export function wearLook(wear: number, status: ModuleStatus): WearLook {
  const w = clamp01(Number.isFinite(wear) ? wear : 0);
  const failed = status === 'failed';
  const grime = Math.max(smooth(0.15, 0.9, w), failed ? 0.6 : 0);
  const scorch = Math.max(smooth(0.5, 1, w) * 0.7, failed ? 0.85 : 0);
  return { grime, scorch, ember: failed ? 1 : 0 };
}

/** Writes `wearLook` into `out` without allocating, for the frame loop. */
export function wearLookInto(out: WearLook, wear: number, status: ModuleStatus): WearLook {
  const l = wearLook(wear, status);
  out.grime = l.grime;
  out.scorch = l.scorch;
  out.ember = l.ember;
  return out;
}

/** Hash of an integer to 0..1, for flicker and spark bursts that look random but cost nothing to store. */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Ember brightness for a failed module at time t (seconds). A slow, uneven breathing between 0.45 and 1; steady at 0.7
 * when motion is reduced.
 */
export function emberPulse(t: number, seed: number, reduceMotion: boolean): number {
  if (reduceMotion) return 0.7;
  const a = Math.sin(t * 1.7 + seed * 5.1) * 0.5 + 0.5;
  const b = Math.sin(t * 4.3 + seed * 2.3) * 0.5 + 0.5;
  return 0.45 + 0.55 * (0.7 * a + 0.3 * b);
}

/** Whether a failed module's windows catch a brief flicker of light at time t (about 6% of the time). Never with reduced motion. */
export function failFlicker(t: number, seed: number, reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return hash01(Math.floor(t * 14) + seed * 1013) > 0.94;
}

/** Whether a failed module throws a burst of sparks at time t: a short burst every few seconds, staggered by seed. */
export function sparkBurst(t: number, seed: number): boolean {
  const slot = Math.floor(t / 0.6 + seed * 7.3);
  return hash01(slot + seed * 977) > 0.72;
}

// ---- Deliveries ----

/** The cargo vehicle shows over the last in-game hour of a delivery. */
export const APPROACH_HOURS = 1;

/** Progress along the approach, 0 as the vehicle comes into view and 1 at the port; null while it is still too far out. */
export function approachProgress(hoursLeft: number, windowHours = APPROACH_HOURS): number | null {
  if (!(hoursLeft <= windowHours) || windowHours <= 0) return null;
  return clamp01(1 - hoursLeft / windowHours);
}

export interface ApproachPlan {
  /** Distance out from the port along its direction at the start and the end, metres. */
  startAlong: number;
  endAlong: number;
  /** Sideways offset at the start, metres; it curves in to nothing at the end. */
  lateral: number;
}

/**
 * Where the approach starts and stops for a port at height `portY` facing `dirY` (the y of its unit direction), with
 * the module reaching `reach` metres out of it. The vehicle stops just past where the module will sit, and never starts
 * below `floorY` (the camera floor above Earth), so a nadir port gets a shorter run in from the side.
 */
export function approachPlan(portY: number, dirY: number, reach: number, floorY: number, maxRun = 55): ApproachPlan {
  const endAlong = Math.max(0, reach) + 3;
  let startAlong = endAlong + maxRun;
  let lateral = maxRun * 0.3;
  if (dirY < -0.05) {
    // Going down from the port: stop the run above the floor, and swing in more from the side instead.
    const room = (portY - floorY) / -dirY;
    if (room < startAlong) {
      startAlong = Math.max(endAlong + 4, room);
      lateral = maxRun * 0.6;
    }
  }
  return { startAlong, endAlong, lateral };
}

/**
 * Distance out along the port direction and sideways at progress t. It decelerates into the port (ease out) and the
 * sideways swing dies away faster, so the last stretch is a straight run in.
 */
export function approachOffset(t: number, plan: ApproachPlan): { along: number; side: number } {
  const u = clamp01(t);
  const e = 1 - (1 - u) * (1 - u);
  const along = plan.startAlong + (plan.endAlong - plan.startAlong) * e;
  const k = 1 - e;
  return { along, side: plan.lateral * k * k };
}

// ---- Windows ----

/** A fixed shuffle of 0..n-1, so the windows that light first are scattered round the hull rather than in a row. */
export function scatterOrder(n: number, seed = 1): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(hash01(i * 31 + seed * 7) * (i + 1));
    const t = out[i]!;
    out[i] = out[j]!;
    out[j] = t;
  }
  return out;
}

/**
 * How many of `count` window panes to draw lit, and how bright, for a guest module at this occupancy (0..1). Unlit panes
 * are not drawn, so the dark window band shows through. Powered and empty still lights one (the crew keeping it ready).
 * Unpowered, failed or shut down draws every pane, all dark.
 */
export function windowLights(count: number, occupancy: number, lit: boolean): { shown: number; intensity: number } {
  if (count <= 0) return { shown: 0, intensity: 0.02 };
  if (!lit) return { shown: count, intensity: 0.02 };
  const occ = clamp01(Number.isFinite(occupancy) ? occupancy : 1);
  return { shown: Math.max(1, Math.round(count * occ)), intensity: 1.1 + 0.6 * occ };
}

/** Share of guest places booked, or 1 when the station has no guest places (so nothing reads as empty). */
export function guestOccupancy(places: number, booked: number): number {
  if (!(places > 0)) return 1;
  return clamp01(booked / places);
}
