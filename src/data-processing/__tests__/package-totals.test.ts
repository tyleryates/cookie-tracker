import { describe, expect, it } from 'vitest';
import { TRANSFER_CATEGORY, TRANSFER_TYPE } from '../../constants';
import type { Transfer } from '../../types';
import { calculatePackageTotals } from '../calculators/package-totals';

function makeTransfer(overrides: Partial<Transfer>): Transfer {
  return {
    type: TRANSFER_TYPE.C2T,
    category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP,
    date: '2025-02-01',
    from: '',
    to: '',
    packages: 0,
    physicalPackages: 0,
    cases: 0,
    varieties: {},
    physicalVarieties: {},
    ...overrides
  };
}

describe('calculatePackageTotals', () => {
  it('returns zeroes for empty transfers', () => {
    const totals = calculatePackageTotals([]);
    expect(totals).toEqual({
      c2tReceived: 0,
      t2tOut: 0,
      allocated: 0,
      virtualBoothT2G: 0,
      boothDividerT2G: 0,
      directShip: 0,
      g2t: 0
    });
  });

  it('counts C2T transfers as c2tReceived', () => {
    const transfers = [makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalPackages: 100 })];
    expect(calculatePackageTotals(transfers).c2tReceived).toBe(100);
  });

  it('counts TROOP_OUTGOING transfers as t2tOut', () => {
    const transfers = [makeTransfer({ category: TRANSFER_CATEGORY.TROOP_OUTGOING, physicalPackages: 20 })];
    expect(calculatePackageTotals(transfers).t2tOut).toBe(20);
  });

  it('counts GIRL_PICKUP as allocated', () => {
    const transfers = [makeTransfer({ category: TRANSFER_CATEGORY.GIRL_PICKUP, physicalPackages: 30 })];
    expect(calculatePackageTotals(transfers).allocated).toBe(30);
  });

  it('counts VIRTUAL_BOOTH_ALLOCATION as virtualBoothT2G', () => {
    const transfers = [makeTransfer({ category: TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION, physicalPackages: 15 })];
    expect(calculatePackageTotals(transfers).virtualBoothT2G).toBe(15);
  });

  it('counts BOOTH_SALES_ALLOCATION as boothDividerT2G', () => {
    const transfers = [makeTransfer({ category: TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION, physicalPackages: 25 })];
    expect(calculatePackageTotals(transfers).boothDividerT2G).toBe(25);
  });

  it('counts DIRECT_SHIP as directShip', () => {
    const transfers = [makeTransfer({ category: TRANSFER_CATEGORY.DIRECT_SHIP, physicalPackages: 10 })];
    expect(calculatePackageTotals(transfers).directShip).toBe(10);
  });

  it('counts GIRL_RETURN as g2t', () => {
    const transfers = [makeTransfer({ category: TRANSFER_CATEGORY.GIRL_RETURN, physicalPackages: 5 })];
    expect(calculatePackageTotals(transfers).g2t).toBe(5);
  });

  it('skips PLANNED transfers', () => {
    const transfers = [makeTransfer({ type: TRANSFER_TYPE.PLANNED, category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalPackages: 50 })];
    expect(calculatePackageTotals(transfers).c2tReceived).toBe(0);
  });

  it('ignores unmapped categories (e.g. DC_ORDER_RECORD)', () => {
    const transfers = [makeTransfer({ category: TRANSFER_CATEGORY.DC_ORDER_RECORD, physicalPackages: 10 })];
    const totals = calculatePackageTotals(transfers);
    expect(totals.c2tReceived).toBe(0);
    expect(totals.allocated).toBe(0);
  });

  it('sums multiple transfers of same category', () => {
    const transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalPackages: 40 }),
      makeTransfer({ id: '2', category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalPackages: 60 })
    ];
    expect(calculatePackageTotals(transfers).c2tReceived).toBe(100);
  });

  it('accumulates across multiple categories', () => {
    const transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalPackages: 100 }),
      makeTransfer({ id: '2', category: TRANSFER_CATEGORY.GIRL_PICKUP, physicalPackages: 30 }),
      makeTransfer({ id: '3', category: TRANSFER_CATEGORY.GIRL_RETURN, physicalPackages: 5 })
    ];
    const totals = calculatePackageTotals(transfers);
    expect(totals.c2tReceived).toBe(100);
    expect(totals.allocated).toBe(30);
    expect(totals.g2t).toBe(5);
  });
});
