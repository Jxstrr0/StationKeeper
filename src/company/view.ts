// What the company sheet shows, worked out from the company and the live station. Plain data, so it tests without a DOM.
import { boardMeasure, boardTitle } from './board';
import { companyNetPerDay, companyValue, creditLeft, CREDIT_RATE_PER_DAY, CREDIT_STEP, DEPUTIES, deputyNetPerDay, FOUND_OPTIONS, salePrice, type CompanyState, type DeputyKind, type StationSummary } from './company';
import { MILESTONES } from './milestones';

export interface CompanyView {
  name: string;
  cash: number;
  value: number;
  perDay: number;
  day: number;
  stations: { id: string; name: string; line: string; note: string; here: boolean; sale: number; deputy: DeputyKind; canSell: boolean }[];
  board: { kind: 'offer' | 'active' | 'none'; title: string; line: string };
  credit: { debt: number; left: number; step: number; line: string };
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

export const SEASONED_LINE = `A seasoned deputy keeps ${Math.round(DEPUTIES.seasoned.share * 100)}% of the income and lets half as much go wrong, for ${money(DEPUTIES.seasoned.wagesPerDay)} a day.`;

function boardView(c: CompanyState, cash: number, live: StationSummary): CompanyView['board'] {
  const b = c.board;
  const t = b.active ?? b.offer;
  if (!t) return { kind: 'none', title: 'Nothing from the board just now', line: b.done + b.missed > 0 ? `${b.done} done, ${b.missed} missed so far.` : 'Requests come every couple of days.' };
  const now = boardMeasure(t, c, { cash, live });
  const fmt = (n: number) => (t.kind === 'cash' || t.kind === 'income' ? money(n) : t.kind === 'stars' ? `${n}★` : String(n));
  if (b.active) return { kind: 'active', title: boardTitle(t), line: `Now ${fmt(now)} of ${fmt(t.target)} · ${hoursLeft(t.until - c.minutes)} · $${t.reward}M bonus` };
  return { kind: 'offer', title: boardTitle(t), line: `Within ${t.days} days, for a $${t.reward}M bonus · now ${fmt(now)} · the offer stands ${hoursLeft(t.until - c.minutes).replace(' left', '')} more` };
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
      else {
        const who = s.deputy === 'seasoned' ? 'Seasoned deputy' : 'Deputy';
        notes.push(`${s.save ? '' : 'Not visited yet · '}${who} earning ${money(deputyNetPerDay(s))}/day`);
      }
      if (!here && s.incidents > 0) notes.push(`${s.incidents} ${s.incidents === 1 ? 'breakdown' : 'breakdowns'} waiting`);
      if (sum.loan > 0) notes.push(`${money(sum.loan)} loan`);
      return { id: s.id, name: s.name, line: stationLine(sum), note: notes.join(' · '), here, sale: salePrice(s, here ? live : undefined), deputy: s.deputy ?? 'standard', canSell: !here };
    }),
    board: boardView(c, cash, live),
    credit: {
      debt: c.debt,
      left: creditLeft(c, cash, live),
      step: CREDIT_STEP,
      line:
        c.debt > 0
          ? `${money(c.debt)} owed on the credit line, costing ${money(c.debt * CREDIT_RATE_PER_DAY)} a day.`
          : `Borrow against the company's worth, ${money(CREDIT_STEP)} at a time, at ${Math.round(CREDIT_RATE_PER_DAY * 100)}% a day.`,
    },
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
