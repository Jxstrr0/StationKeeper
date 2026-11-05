// Small text formatters shared by the HUD and sheets.
import type { ModuleKind, ModuleStatus, Tier } from '../sim/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function kw(v: number): string {
  return v.toFixed(1);
}

export function minutes(m: number): string {
  if (!Number.isFinite(m)) return '—';
  const whole = Math.max(1, Math.ceil(m));
  return whole >= 60 ? `${Math.floor(whole / 60)} h ${whole % 60} min` : `${whole} min`;
}

export const TIER_LABEL: Record<Tier, string> = {
  critical: 'Critical',
  essential: 'Essential',
  commercial: 'Commercial',
};

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  powered: 'Powered',
  throttled: 'Throttled (running hot)',
  shed: 'Shed',
  overheated: 'Tripped: overheating',
  off: 'Switched off',
};

export const KIND_LABEL: Record<ModuleKind, string> = {
  core: 'Core',
  solar: 'Power generation',
  battery: 'Energy storage',
  habitat: 'Habitat',
  radiator: 'Thermal control',
};

export function celsius(v: number): string {
  return v.toFixed(1);
}
