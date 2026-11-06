// What the company sheet shows, worked out from the company and the live station. Plain data, so it tests without a DOM.
import { companyNetPerDay, companyValue, FOUND_OPTIONS, type CompanyState, type StationSummary } from './company';
import { MILESTONES } from './milestones';

export interface CompanyView {
  name: string;
  cash: number;
  value: number;
  perDay: number;
  day: number;
  stations: { id: string; name: string; line: string; note: string; here: boolean }[];
  listings: { id: string; name: string; line: string; price: number; affordable: boolean; left: string }[];
  found: { id: string; label: string; line: string; price: number; affordable: boolean }[];
  milestones: { label: string; done: boolean }[];
  lost: string[];
}

const money = (m: number) => `${m < 0 ? '−' : ''}$${Math.abs(m).toFixed(1)}M`;
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

function stationLine(s: StationSummary): string {
  const parts = [`${s.modules} modules`, `${money(s.netPerDay)}/day`, `${Math.round(s.wear * 100)}% worn`];
  if (s.stars !== null) parts.push(stars(s.stars));
  return parts.join(' · ');
}

const hoursLeft = (min: number) => {
  const h = Math.max(0, Math.round(min / 60));
  return h >= 48 ? `${Math.floor(h / 24)} days left` : `${h} h left`;
};

export function companyView(c: CompanyState, cash: number, live: StationSummary): CompanyView {
  return {
    name: c.name,
    cash,
    value: companyValue(c, cash, live),
    perDay: companyNetPerDay(c, live),
    day: Math.floor(c.minutes / 1440) + 1,
    stations: c.stations.map((s) => {
      const here = s.id === c.activeId;
      const sum = here ? live : s.summary;
      const notes: string[] = [];
      if (here) notes.push('You are here');
      else if (!s.save) notes.push(`Not visited yet · deputy earning ${money(sum.netPerDay * 0.75 * s.incomeFactor)}/day`);
      else notes.push(`Deputy in charge, earning ${money(sum.netPerDay * 0.75 * s.incomeFactor)}/day`);
      if (!here && s.incidents > 0) notes.push(`${s.incidents} ${s.incidents === 1 ? 'breakdown' : 'breakdowns'} waiting`);
      if (sum.loan > 0) notes.push(`${money(sum.loan)} loan`);
      return { id: s.id, name: s.name, line: stationLine(sum), note: notes.join(' · '), here };
    }),
    listings: c.listings.map((l) => ({
      id: l.id,
      name: l.name,
      line: `${l.modules} modules · worth ${money(l.value)} · run down · could earn ${money(l.netPerDay)}/day`,
      price: l.price,
      affordable: cash >= l.price,
      left: hoursLeft(l.expiresAt - c.minutes),
    })),
    found: FOUND_OPTIONS.map((o) => ({ id: o.id, label: o.label, line: o.line, price: o.price, affordable: cash >= o.price })),
    milestones: MILESTONES.map((m) => ({ label: m.label, done: c.milestones.includes(m.id) })),
    lost: c.lost.map((l) => `${l.name}: ${l.outcome === 'evacuated' ? 'evacuated' : l.outcome === 'bankrupt' ? 'taken by the bank' : 'sold'}`),
  };
}
