import { describe, expect, it } from 'vitest';
import { DATA_SOURCES, OWNER } from '../../constants';
import { createDataStore, type DataStore } from '../../data-store';
import { mergeOrCreateOrder } from '../../data-store-operations';
import type { Order } from '../../types';

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
