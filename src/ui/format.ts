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
  if (whole < 60) return `${whole} min`;
  return whole % 60 === 0 ? `${whole / 60} h` : `${Math.floor(whole / 60)} h ${whole % 60} min`;
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
  failed: 'Failed',
  servicing: 'Crew working on it',
};

export const KIND_LABEL: Record<ModuleKind, string> = {
  core: 'Core',
  solar: 'Power generation',
  battery: 'Energy storage',
  habitat: 'Habitat',
  radiator: 'Thermal control',
  lifesupport: 'Life support',
  lab: 'Research',
  node: 'Structure',
  quarters: 'Crew quarters',
  galley: 'Crew comfort',
  cupola: 'Crew comfort',
};

export function celsius(v: number): string {
  return v.toFixed(1);
}

/** Money in $ millions, as "$12.4M" or "$350k". Negative amounts get a minus sign. */
export function money(m: number): string {
  const a = Math.abs(m);
  // Under $500 rounds to nothing: show a plain $0 rather than "$0k" or "−$0k".
  if (a < 0.0005) return '$0';
  const sign = m < 0 ? '−' : '';
  if (a >= 100) return `${sign}$${Math.round(a)}M`;
  if (a >= 1) return `${sign}$${a.toFixed(1)}M`;
  return `${sign}$${Math.round(a * 1000)}k`;
}
