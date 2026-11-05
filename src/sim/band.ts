// Hysteresis helpers shared by the systems, so alarms and trips don't flicker at a threshold.
import type { Band } from './types';

/** High alarm: trips above `band.above`, clears below `band.below`. */
export function bandHigh(active: boolean, value: number, band: Band): boolean {
  if (!active && value > band.above) return true;
  if (active && value < band.below) return false;
  return active;
}

/** Low alarm: trips below `band.below`, clears above `band.above`. */
export function bandLow(active: boolean, value: number, band: Band): boolean {
  if (!active && value < band.below) return true;
  if (active && value > band.above) return false;
  return active;
}
