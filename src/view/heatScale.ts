// Temperature colour scale shared by the Heat overlay and its legend. No Three.js here, so the UI can use it too.

/** [°C, hex colour] stops, coolest first. Blue below the setpoint, lilac when healthy, clay to red when hot. */
export const HEAT_STOPS: readonly (readonly [number, number])[] = [
  [12, 0x2f4c94],
  [18, 0x6f80d2],
  [24, 0xb48ce8],
  [29, 0xe6b48c],
  [34, 0xd97757],
  [42, 0xff3b2f],
];

export const HEAT_MIN_C = HEAT_STOPS[0]![0];
export const HEAT_MAX_C = HEAT_STOPS[HEAT_STOPS.length - 1]![0];

/** Colour for a temperature as [r, g, b] in 0..1 (sRGB). */
export function heatRgb(tempC: number): [number, number, number] {
  const stops = HEAT_STOPS;
  let i = 0;
  while (i < stops.length - 2 && tempC > stops[i + 1]![0]) i++;
  const [t0, c0] = stops[i]!;
  const [t1, c1] = stops[i + 1]!;
  const f = Math.min(1, Math.max(0, (tempC - t0) / (t1 - t0)));
  const ch = (c: number, s: number) => ((c >> s) & 0xff) / 255;
  const mix = (s: number) => ch(c0, s) + (ch(c1, s) - ch(c0, s)) * f;
  return [mix(16), mix(8), mix(0)];
}

/** CSS linear-gradient stops for the legend, spread across HEAT_MIN_C..HEAT_MAX_C. */
export function heatGradientCss(): string {
  const span = HEAT_MAX_C - HEAT_MIN_C;
  const parts = HEAT_STOPS.map(([t, c]) => `#${c.toString(16).padStart(6, '0')} ${(((t - HEAT_MIN_C) / span) * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
