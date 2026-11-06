// Player preferences, kept per browser beside the save. Like the save, storage can be missing, so every call fails quietly.

export type Quality = 'auto' | 'low' | 'high';
export type UiSize = 'small' | 'normal' | 'large';

export interface Settings {
  /** Auto lowers the resolution when frames are slow; Low and High hold it fixed. */
  quality: Quality;
  /** No camera drift or fling, no sliding panels. */
  reducedMotion: boolean;
  uiSize: UiSize;
  /** 24-hour clock in the HUD, or 12-hour with am/pm. */
  clock24: boolean;
  /** Master volume, 0 to 1. */
  volume: number;
  muted: boolean;
}

const KEY = 'stationkeeper.settings';
const QUALITIES: readonly Quality[] = ['auto', 'low', 'high'];
const SIZES: readonly UiSize[] = ['small', 'normal', 'large'];
export const UI_ZOOM: Record<UiSize, number> = { small: 0.88, normal: 1, large: 1.15 };

export function defaultSettings(prefersReducedMotion = false): Settings {
  return { quality: 'auto', reducedMotion: prefersReducedMotion, uiSize: 'normal', clock24: true, volume: 0.7, muted: false };
}

/** Whatever is stored, cleaned up: unknown fields dropped, bad values replaced by the defaults. Never throws. */
export function parseSettings(raw: string | null, fallback: Settings = defaultSettings()): Settings {
  if (raw === null) return { ...fallback };
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return { ...fallback };
  }
  if (typeof x !== 'object' || x === null) return { ...fallback };
  const s = x as Record<string, unknown>;
  const pick = <T>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const volume = typeof s.volume === 'number' && Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : fallback.volume;
  return {
    quality: pick(QUALITIES, s.quality, fallback.quality),
    reducedMotion: bool(s.reducedMotion, fallback.reducedMotion),
    uiSize: pick(SIZES, s.uiSize, fallback.uiSize),
    clock24: bool(s.clock24, fallback.clock24),
    volume,
    muted: bool(s.muted, fallback.muted),
  };
}

export function loadSettings(): Settings {
  let prefersReduced = false;
  try {
    prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // No matchMedia: assume motion is fine.
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: defaults for this visit.
  }
  return parseSettings(raw, defaultSettings(prefersReduced));
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // The choice lasts until the page closes.
  }
}
