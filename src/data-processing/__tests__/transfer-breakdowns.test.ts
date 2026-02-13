import { describe, expect, it } from 'vitest';
import { TRANSFER_CATEGORY } from '../../constants';
import { createDataStore, type DataStore } from '../../data-store';
import type { Transfer, Warning } from '../../types';
import { buildTransferBreakdowns } from '../calculators/transfer-breakdowns';

function makeTransfer(overrides: Partial<Transfer>): Transfer {
  return {
    type: 'C2T',
    category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP,
    date: '2025-01-15',
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

describe('buildTransferBreakdowns', () => {
  it('groups C2T transfers', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalPackages: 10 }),
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalPackages: 20 })
    ];
    const warnings: Warning[] = [];
    const result = buildTransferBreakdowns(store, warnings);
    expect(result.c2t.length).toBe(2);
    expect(result.totals.c2t).toBe(30);
  });

  it('groups T2T outgoing transfers', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [makeTransfer({ type: 'T2T', category: TRANSFER_CATEGORY.TROOP_OUTGOING, physicalPackages: 5 })];
    const warnings: Warning[] = [];
    const result = buildTransferBreakdowns(store, warnings);
    expect(result.t2tOut.length).toBe(1);
    expect(result.totals.t2tOut).toBe(5);
  });

  it('groups T2G girl pickup transfers', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [makeTransfer({ type: 'T2G', category: TRANSFER_CATEGORY.GIRL_PICKUP, physicalPackages: 8 })];
    const warnings: Warning[] = [];
    const result = buildTransferBreakdowns(store, warnings);
    expect(result.t2g.length).toBe(1);
    expect(result.totals.t2gPhysical).toBe(8);
  });

  it('groups G2T girl return transfers', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [makeTransfer({ type: 'G2T', category: TRANSFER_CATEGORY.GIRL_RETURN, physicalPackages: 3 })];
    const warnings: Warning[] = [];
    const result = buildTransferBreakdowns(store, warnings);
    expect(result.g2t.length).toBe(1);
    expect(result.totals.g2t).toBe(3);
  });

  it('ignores non-inventory categories', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ type: 'D', category: TRANSFER_CATEGORY.DC_ORDER_RECORD, physicalPackages: 10 }),
      makeTransfer({ type: 'COOKIE_SHARE', category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, physicalPackages: 5 })
    ];
    const warnings: Warning[] = [];
    const result = buildTransferBreakdowns(store, warnings);
    expect(result.c2t.length).toBe(0);
    expect(result.t2g.length).toBe(0);
    expect(result.g2t.length).toBe(0);
    expect(result.t2tOut.length).toBe(0);
  });

  it('sorts transfers by date (newest first)', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, date: '2025-01-10', physicalPackages: 5 }),
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, date: '2025-01-20', physicalPackages: 10 }),
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, date: '2025-01-15', physicalPackages: 7 })
    ];
    const warnings: Warning[] = [];
    const result = buildTransferBreakdowns(store, warnings);
    expect(result.c2t[0].date).toBe('2025-01-20');
    expect(result.c2t[1].date).toBe('2025-01-15');
    expect(result.c2t[2].date).toBe('2025-01-10');
  });

  it('warns on unknown transfer types (deduplicated)', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ type: 'XYZZY' as any, category: TRANSFER_CATEGORY.DC_ORDER_RECORD }),
      makeTransfer({ type: 'XYZZY' as any, category: TRANSFER_CATEGORY.DC_ORDER_RECORD })
    ];
    const warnings: Warning[] = [];
    buildTransferBreakdowns(store, warnings);
    // Only one warning even though type appears twice
    expect(warnings.length).toBe(1);
    expect(warnings[0].type).toBe('UNKNOWN_TRANSFER_TYPE');
    expect(warnings[0].reason).toBe('XYZZY');
  });

  it('does not warn on known transfer types', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ type: 'C2T', category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP }),
      makeTransfer({ type: 'T2G', category: TRANSFER_CATEGORY.GIRL_PICKUP }),
      makeTransfer({ type: 'G2T', category: TRANSFER_CATEGORY.GIRL_RETURN })
    ];
    const warnings: Warning[] = [];
    buildTransferBreakdowns(store, warnings);
    expect(warnings.length).toBe(0);
  });

  it('returns empty when no transfers', () => {
    const store = createDataStore();
    const warnings: Warning[] = [];
    const result = buildTransferBreakdowns(store, warnings);
    expect(result.c2t.length).toBe(0);
    expect(result.totals.c2t).toBe(0);
  });
});
