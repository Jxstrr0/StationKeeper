// Words for the sim's warnings. The sim says what is wrong and why; this says it in plain English.
import type { ModuleSnapshot, StationWarning } from '../sim/types';
import { TIER_LABEL, minutes, money } from './format';

const pct = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;

export function warningTitle(w: StationWarning, mod: (id: string) => ModuleSnapshot | undefined): string {
  const m = w.moduleId ? mod(w.moduleId) : undefined;
  const name = m?.name ?? w.moduleId ?? '';
  const tier = w.tier ? TIER_LABEL[w.tier] : '';
  switch (w.kind) {
    case 'eclipse':
      return 'Eclipse: the arrays are dark';
    case 'batteryLimit':
      return 'Batteries at their power limit';
    case 'sunlitRadiators':
      return 'Radiators in sunlight shed less heat';
    case 'moduleFailed':
      return `${name} failed`;
    case 'moduleServicing':
      return m?.repair?.kind === 'repair' ? `${name} under repair` : `${name} being serviced`;
    case 'moduleOff':
      return `${name} switched off`;
    case 'moduleWorn':
      return `${name} due for service (${pct(w.value)} worn)`;
    case 'loadShed':
      return `${tier} loads shed for power`;
    case 'throttled':
      return `Coolant loop hot at ${(w.value ?? 0).toFixed(1)} °C`;
    case 'tripped':
      return `${tier} loads tripped on heat`;
    case 'co2':
      return `CO₂ ${w.severity === 'alarm' ? 'dangerous' : 'high'} at ${(w.value ?? 0).toFixed(1)} mmHg`;
    case 'o2':
      return w.severity === 'alarm' ? 'Oxygen reserve empty' : `Oxygen reserve low at ${pct(w.value)}`;
    case 'water':
      return w.severity === 'alarm' ? 'Water tanks dry' : `Water low at ${pct(w.value)}`;
    case 'crewCondition':
      return w.limit === undefined ? `Crew condition at ${pct(w.value)}` : `Crew condition at ${pct(w.value)}: below ${pct(w.limit)} they're evacuated`;
    case 'guestsIdle':
      return `${name} down: guests aren't paying (${money(w.value ?? 0)} a day)`;
    case 'contractAtRisk':
      return `Contract at risk: ${w.label ?? 'research'}`;
    case 'noEngineers':
      return 'No engineers aboard: repairs can\'t start';
    case 'labUnstaffed': {
      const n = w.value ?? 1;
      return `${n === 1 ? 'A lab has' : `${n} labs have`} no scientist and ${n === 1 ? 'works' : 'work'} slowly`;
    }
    case 'overdrawn':
      return w.final
        ? `Overdrawn by ${money(-(w.value ?? 0))}: end this quarter in the red and the bank takes the station`
        : `Overdrawn by ${money(-(w.value ?? 0))}: the bank takes the station past ${money(w.limit ?? 0)}`;
  }
}

/** What the crew is doing about a module, for sheets and the warnings list. */
export function repairText(m: ModuleSnapshot): string | null {
  const r = m.repair;
  if (!r) return null;
  const what = r.kind === 'repair' ? 'Repair' : 'Service';
  if (r.active) return `${what} under way, ${minutes(r.hoursLeft * 60)} left`;
  return `${what} queued (${r.queuePosition === 1 ? 'next' : `#${r.queuePosition}`}), takes ${minutes(r.hoursLeft * 60)}`;
}
