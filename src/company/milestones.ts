// Company milestones: there's no end to company mode, so these mark the way. Each is reached once and stays reached.
import { companyValue, type CompanyState, type StationSummary } from './company';

export interface MilestoneView {
  cash: number;
  /** The live station's summary, fresher than the one stored. */
  live: StationSummary;
}

interface Milestone {
  id: string;
  label: string;
  reached(c: CompanyState, v: MilestoneView): boolean;
}

const summaries = (c: CompanyState, v: MilestoneView) => c.stations.map((s) => (s.id === c.activeId ? v.live : s.summary));

export const MILESTONES: readonly Milestone[] = [
  { id: 'debt-free', label: 'Every loan paid off', reached: (c, v) => summaries(c, v).every((s) => s.loan <= 0) },
  { id: 'stations-2', label: 'A second station', reached: (c) => c.stations.length >= 2 },
  { id: 'cash-100', label: '$100M in the bank', reached: (_, v) => v.cash >= 100 },
  { id: 'value-250', label: 'A company worth $250M', reached: (c, v) => companyValue(c, v.cash, v.live) >= 250 },
  { id: 'stations-3', label: 'Three stations', reached: (c) => c.stations.length >= 3 },
  { id: 'five-star', label: 'Five-star reviews at a station', reached: (c, v) => summaries(c, v).some((s) => (s.stars ?? 0) >= 5) },
  { id: 'days-30', label: 'Thirty days in business', reached: (c) => c.minutes >= 30 * 1440 },
  { id: 'value-500', label: 'A company worth $500M', reached: (c, v) => companyValue(c, v.cash, v.live) >= 500 },
  { id: 'stations-5', label: 'Five stations', reached: (c) => c.stations.length >= 5 },
  { id: 'value-1000', label: 'A company worth $1B', reached: (c, v) => companyValue(c, v.cash, v.live) >= 1000 },
];

/** Record any milestones newly reached, and return them. */
export function checkMilestones(c: CompanyState, v: MilestoneView): Milestone[] {
  const fresh = MILESTONES.filter((m) => !c.milestones.includes(m.id) && m.reached(c, v));
  for (const m of fresh) c.milestones.push(m.id);
  return fresh;
}
