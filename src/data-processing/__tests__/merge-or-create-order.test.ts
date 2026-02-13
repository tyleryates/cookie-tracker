import { describe, expect, it } from 'vitest';
import { DATA_SOURCES, OWNER, TRANSFER_CATEGORY } from '../../constants';
import { createDataStore, type DataStore } from '../../data-store';
import { mergeOrCreateOrder } from '../../data-store-operations';
import type { Order, Transfer } from '../../types';
import { calculatePackageTotals } from '../calculators/package-totals';

// ============================================================================
// mergeOrCreateOrder
// ============================================================================

describe('mergeOrCreateOrder', () => {
  it('creates a new order when not in store', () => {
    const store = createDataStore() as DataStore;
    const order = mergeOrCreateOrder(store, '1001', { orderNumber: '1001', scout: 'Jane Doe', packages: 5 }, DATA_SOURCES.DIGITAL_COOKIE, {
      raw: 'data'
    });
    expect(store.orders.has('1001')).toBe(true);
    expect(order.scout).toBe('Jane Doe');
    expect(order.packages).toBe(5);
    expect(order.sources).toContain(DATA_SOURCES.DIGITAL_COOKIE);
  });

  it('stores raw data in metadata', () => {
    const store = createDataStore() as DataStore;
    const raw = { someField: 'value' };
    mergeOrCreateOrder(store, '1001', { orderNumber: '1001' }, DATA_SOURCES.DIGITAL_COOKIE, raw);
    expect(store.orders.get('1001')!.metadata.dc).toBe(raw);
  });

  it('uses correct metadata key for each source', () => {
    const store = createDataStore() as DataStore;
    mergeOrCreateOrder(store, '1001', {}, DATA_SOURCES.SMART_COOKIE, { a: 1 });
    mergeOrCreateOrder(store, '1001', {}, DATA_SOURCES.SMART_COOKIE_REPORT, { b: 2 });
    mergeOrCreateOrder(store, '1001', {}, DATA_SOURCES.SMART_COOKIE_API, { c: 3 });
    const order = store.orders.get('1001')!;
    expect(order.metadata.sc).toEqual({ a: 1 });
    expect(order.metadata.scReport).toEqual({ b: 2 });
    expect(order.metadata.scApi).toEqual({ c: 3 });
  });

  it('merges into existing order (overwrites with Object.assign)', () => {
    const store = createDataStore() as DataStore;
    mergeOrCreateOrder(store, '1001', { orderNumber: '1001', scout: 'Jane', packages: 5 }, DATA_SOURCES.DIGITAL_COOKIE, {});
    mergeOrCreateOrder(store, '1001', { packages: 10, amount: 60 }, DATA_SOURCES.SMART_COOKIE, {});
    const order = store.orders.get('1001')!;
    expect(order.packages).toBe(10);
    expect(order.amount).toBe(60);
    expect(order.scout).toBe('Jane'); // Preserved from first import
  });

  it('adds source without duplicating', () => {
    const store = createDataStore() as DataStore;
    mergeOrCreateOrder(store, '1001', {}, DATA_SOURCES.DIGITAL_COOKIE, {});
    mergeOrCreateOrder(store, '1001', {}, DATA_SOURCES.DIGITAL_COOKIE, {});
    expect(store.orders.get('1001')!.sources).toEqual([DATA_SOURCES.DIGITAL_COOKIE]);
  });

  it('adds multiple different sources', () => {
    const store = createDataStore() as DataStore;
    mergeOrCreateOrder(store, '1001', {}, DATA_SOURCES.DIGITAL_COOKIE, {});
    mergeOrCreateOrder(store, '1001', {}, DATA_SOURCES.SMART_COOKIE, {});
    const sources = store.orders.get('1001')!.sources;
    expect(sources).toContain(DATA_SOURCES.DIGITAL_COOKIE);
    expect(sources).toContain(DATA_SOURCES.SMART_COOKIE);
  });

  it('calls enrichment function instead of Object.assign', () => {
    const store = createDataStore() as DataStore;
    mergeOrCreateOrder(store, '1001', { orderNumber: '1001', scout: 'Jane' }, DATA_SOURCES.DIGITAL_COOKIE, {});

    mergeOrCreateOrder(
      store,
      '1001',
      { scoutId: '42', gradeLevel: '3rd' } as any,
      DATA_SOURCES.SMART_COOKIE_REPORT,
      {},
      (existing: Order, newData: Partial<Order>) => {
        existing.scoutId = (newData as any).scoutId;
      }
    );

    const order = store.orders.get('1001')!;
    expect(order.scoutId).toBe('42');
    // gradeLevel NOT set because enrichment only copied scoutId
    expect(order.gradeLevel).toBeUndefined();
  });

  it('creates order with defaults for missing fields', () => {
    const store = createDataStore() as DataStore;
    mergeOrCreateOrder(store, '1001', {}, DATA_SOURCES.DIGITAL_COOKIE, {});
    const order = store.orders.get('1001')!;
    expect(order.orderNumber).toBe('');
    expect(order.scout).toBe('');
    expect(order.packages).toBe(0);
    expect(order.amount).toBe(0);
    expect(order.owner).toBe(OWNER.TROOP);
    expect(order.varieties).toEqual({});
  });
});

// ============================================================================
// calculatePackageTotals
// ============================================================================

describe('calculatePackageTotals', () => {
  function makeTransfer(overrides: Partial<Transfer>): Transfer {
    return {
      type: 'C2T',
      category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP,
      date: '',
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

  it('accumulates C2T into c2tReceived', () => {
    const totals = calculatePackageTotals([
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalPackages: 50 }),
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalPackages: 30 })
    ]);
    expect(totals.c2tReceived).toBe(80);
  });

  it('accumulates T2T outgoing', () => {
    const totals = calculatePackageTotals([makeTransfer({ category: TRANSFER_CATEGORY.TROOP_OUTGOING, physicalPackages: 10 })]);
    expect(totals.t2tOut).toBe(10);
  });

  it('accumulates girl pickup into allocated', () => {
    const totals = calculatePackageTotals([makeTransfer({ category: TRANSFER_CATEGORY.GIRL_PICKUP, physicalPackages: 20 })]);
    expect(totals.allocated).toBe(20);
  });

  it('accumulates virtual booth T2G', () => {
    const totals = calculatePackageTotals([makeTransfer({ category: TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION, physicalPackages: 5 })]);
    expect(totals.virtualBoothT2G).toBe(5);
  });

  it('accumulates booth divider T2G', () => {
    const totals = calculatePackageTotals([makeTransfer({ category: TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION, physicalPackages: 3 })]);
    expect(totals.boothDividerT2G).toBe(3);
  });

  it('accumulates direct ship', () => {
    const totals = calculatePackageTotals([makeTransfer({ category: TRANSFER_CATEGORY.DIRECT_SHIP, physicalPackages: 7 })]);
    expect(totals.directShip).toBe(7);
  });

  it('accumulates G2T returns', () => {
    const totals = calculatePackageTotals([makeTransfer({ category: TRANSFER_CATEGORY.GIRL_RETURN, physicalPackages: 4 })]);
    expect(totals.g2t).toBe(4);
  });

  it('ignores unmapped categories', () => {
    const totals = calculatePackageTotals([
      makeTransfer({ category: TRANSFER_CATEGORY.DC_ORDER_RECORD, physicalPackages: 100 }),
      makeTransfer({ category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, physicalPackages: 50 })
    ]);
    expect(totals.c2tReceived).toBe(0);
    expect(totals.allocated).toBe(0);
  });

  it('returns all zeros for empty transfers', () => {
    const totals = calculatePackageTotals([]);
    expect(totals.c2tReceived).toBe(0);
    expect(totals.t2tOut).toBe(0);
    expect(totals.allocated).toBe(0);
    expect(totals.g2t).toBe(0);
  });
});
