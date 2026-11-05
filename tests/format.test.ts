import { describe, expect, it } from 'vitest';
import { money } from '../src/ui/format';
import { verdict } from '../src/ui/reportSheet';
import type { QuarterReport } from '../src/sim/types';

describe('money', () => {
  it('writes millions to one decimal, large sums whole, and small ones in thousands', () => {
    expect(money(12.44)).toBe('$12.4M');
    expect(money(250.4)).toBe('$250M');
    expect(money(0.35)).toBe('$350k');
    expect(money(-1.2)).toBe('−$1.2M');
  });

  it('shows a plain $0 for amounts that round to nothing, with no minus sign', () => {
    expect(money(0)).toBe('$0');
    expect(money(-0.0001)).toBe('$0');
    expect(money(0.0006)).toBe('$1k');
  });
});

describe('quarter verdict', () => {
  const report = (net: number, cash = 10): QuarterReport => ({
    quarter: 1,
    ledger: { guests: 0, contracts: 0, wages: 0, operations: 0, interest: 0, construction: 0, repairs: 0, penalties: 0 },
    net,
    cash,
    loan: 60,
    contractsDone: 0,
    contractsFailed: 0,
    guestUptime: 1,
    failures: 0,
  });

  it('gets gloomier as the quarter gets worse, and overdraft trumps everything', () => {
    const lines = [report(8), report(1), report(-2), report(-12), report(8, -1)].map(verdict);
    expect(new Set(lines).size).toBe(5);
    expect(verdict(report(8, -1))).toMatch(/bank/);
  });
});
