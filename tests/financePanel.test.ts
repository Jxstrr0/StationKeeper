import { describe, expect, it } from 'vitest';
import type { ContractSnapshot, Ledger } from '../src/sim/types';
import { acceptBlocked, hoursText, ledgerRows, offerTerms, progressLine } from '../src/ui/financePanel';

const ledger = (over: Partial<Ledger> = {}): Ledger => ({
  guests: 0,
  contracts: 0,
  fleet: 0,
  wages: 0,
  operations: 0,
  interest: 0,
  construction: 0,
  repairs: 0,
  penalties: 0,
  ...over,
});

const contract = (over: Partial<ContractSnapshot> = {}): ContractSnapshot => ({
  uid: 'c1',
  defId: 'crystal',
  title: 'Protein crystals',
  sponsor: 'Helix Bio',
  description: 'Grow crystals in microgravity.',
  labHours: 12,
  deadlineHours: 24,
  progressHours: 0,
  reward: 7,
  penalty: 2,
  stable: false,
  hoursLeft: 5,
  atRisk: false,
  ...over,
});

describe('finance ledger rows', () => {
  it('lists income first, then costs, skips zero rows, and ends with the net', () => {
    const rows = ledgerRows(ledger({ penalties: -2, operations: -3.5, guests: 10, construction: 0, contracts: 7, interest: -0.4 }));
    expect(rows.map((r) => r.label)).toEqual(['Guests', 'Research contracts', 'Operations', 'Loan interest', 'Penalties', 'Net']);
    expect(rows.map((r) => r.amount).slice(0, -1)).toEqual([10, 7, -3.5, -0.4, -2]);
    expect(rows.at(-1)!.amount).toBeCloseTo(11.1, 10);
  });

  it('shows only the net when nothing has been booked', () => {
    expect(ledgerRows(ledger())).toEqual([{ label: 'Net', amount: 0 }]);
  });

  it('names repairs as spare parts and treats sub-$500 amounts as zero', () => {
    const rows = ledgerRows(ledger({ repairs: -1.2, guests: 0.0001 }));
    expect(rows.map((r) => r.label)).toEqual(['Spare parts', 'Net']);
    expect(rows[1]!.amount).toBeCloseTo(-1.1999, 10);
  });
});

describe('finance contract text', () => {
  it('formats hours with at most one decimal', () => {
    expect(hoursText(12)).toBe('12');
    expect(hoursText(6.24)).toBe('6.2');
    expect(hoursText(5.96)).toBe('6');
  });

  it('describes progress on a contract under way', () => {
    expect(progressLine(contract({ progressHours: 6.2, hoursLeft: 9 + 40 / 60 }))).toBe('6.2 of 12 lab hours · 9 h 40 min left');
  });

  it('describes an offer with its deadline', () => {
    expect(offerTerms(contract())).toBe('12 lab hours within 24 h · pays $7.0M · penalty $2.0M');
  });

  it('blocks accepting without a free lab', () => {
    expect(acceptBlocked({ labs: 0, active: [] })).toBe('Needs a Research Lab');
    expect(acceptBlocked({ labs: 1, active: [contract()] })).toBe('The lab is busy');
    expect(acceptBlocked({ labs: 2, active: [contract(), contract({ uid: 'c2' })] })).toBe('Every lab is busy');
    expect(acceptBlocked({ labs: 2, active: [contract()] })).toBeNull();
  });
});
