// Keeps the company in localStorage beside the scenario save, which it leaves alone. A mode key says which of the two
// the title screen's Continue goes back to.
import { parseScenario } from '../sim/data';
import { COMPANY_VERSION, type CompanyState } from './company';

export const COMPANY_KEY = 'stationkeeper.company';
export const MODE_KEY = 'stationkeeper.mode';
export type Mode = 'scenario' | 'company';

/** The company from stored text, or a reason it can't be used. Station scenarios are checked here; saves when loaded. */
export function parseCompany(raw: string): { ok: true; company: CompanyState } | { ok: false; reason: string } {
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not JSON' };
  }
  if (typeof x !== 'object' || x === null) return { ok: false, reason: 'not a company' };
  const c = x as Record<string, unknown>;
  if (c.app !== 'stationkeeper-company') return { ok: false, reason: 'not a company' };
  if (c.version !== COMPANY_VERSION) return { ok: false, reason: `company version ${String(c.version)}` };
  if (!Array.isArray(c.stations) || c.stations.length === 0 || !Array.isArray(c.listings) || !Array.isArray(c.milestones) || !Array.isArray(c.lost)) return { ok: false, reason: 'missing parts' };
  if (!['minutes', 'cash', 'rng', 'nextListingsAt', 'nextNo'].every((k) => typeof c[k] === 'number' && Number.isFinite(c[k]))) return { ok: false, reason: 'bad numbers' };
  if (typeof c.activeId !== 'string' || typeof c.startDate !== 'string' || typeof c.name !== 'string') return { ok: false, reason: 'bad fields' };
  try {
    for (const s of c.stations as Record<string, unknown>[]) {
      if (typeof s.id !== 'string' || typeof s.name !== 'string' || typeof s.summary !== 'object' || s.summary === null) throw new Error('bad station');
      s.scenario = parseScenario(s.scenario);
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  const company = x as CompanyState;
  if (!company.stations.some((s) => s.id === company.activeId)) return { ok: false, reason: 'no active station' };
  return { ok: true, company };
}

export function loadCompany(): CompanyState | null {
  try {
    const raw = localStorage.getItem(COMPANY_KEY);
    if (raw === null) return null;
    const r = parseCompany(raw);
    if (!r.ok) console.warn(`Company discarded: ${r.reason}`);
    return r.ok ? r.company : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser wouldn't store it. */
export function saveCompany(c: CompanyState): boolean {
  try {
    localStorage.setItem(COMPANY_KEY, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

export function clearCompany(): void {
  try {
    localStorage.removeItem(COMPANY_KEY);
  } catch {
    // Nothing to do.
  }
}

export function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'company' ? 'company' : 'scenario';
  } catch {
    return 'scenario';
  }
}

export function saveMode(m: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // Then Continue goes to the scenario, which is still there.
  }
}
