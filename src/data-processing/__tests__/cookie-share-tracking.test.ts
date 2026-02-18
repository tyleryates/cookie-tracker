import { describe, expect, it } from 'vitest';
import { TRANSFER_CATEGORY } from '../../constants';
import { createDataStore, type DataStore } from '../../data-store';
import type { Transfer } from '../../types';
import { buildCookieShareTracking } from '../calculators/cookie-share-tracking';

function makeTransfer(overrides: Partial<Transfer>): Transfer {
  return {
    type: 'COOKIE_SHARE',
    category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD,
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

describe('buildCookieShareTracking', () => {
  it('counts DC donations from non-site orders', () => {
    const store = createDataStore() as DataStore;
    store.rawDCData = [
      { 'Girl Last Name': 'Doe', 'Order Type': 'In-Person Delivery', 'Payment Status': 'CASH', Donation: '3' },
      { 'Girl Last Name': 'Smith', 'Order Type': 'In-Person Delivery', 'Payment Status': 'CASH', Donation: '2' }
    ];
    const result = buildCookieShareTracking(store);
    expect(result.digitalCookie.total).toBe(5);
  });

  it('skips site orders in DC donation count', () => {
    const store = createDataStore() as DataStore;
    store.rawDCData = [
      { 'Girl Last Name': 'Site', 'Order Type': 'In-Person Delivery', 'Payment Status': 'CASH', Donation: '10' },
      { 'Girl Last Name': 'Doe', 'Order Type': 'In-Person Delivery', 'Payment Status': 'CASH', Donation: '3' }
    ];
    const result = buildCookieShareTracking(store);
    expect(result.digitalCookie.total).toBe(3);
  });

  it('detects DC manual entries (non-auto-sync orders)', () => {
    const store = createDataStore() as DataStore;
    store.rawDCData = [
      // In-Person Delivery + CASH → NOT auto-sync → manual entry
      { 'Girl Last Name': 'Doe', 'Order Type': 'In-Person Delivery', 'Payment Status': 'CASH', Donation: '3' },
      // Shipped + CAPTURED → auto-sync → NOT manual entry
      { 'Girl Last Name': 'Smith', 'Order Type': 'Shipped to Customer', 'Payment Status': 'CAPTURED', Donation: '2' }
    ];
    const result = buildCookieShareTracking(store);
    expect(result.digitalCookie.total).toBe(5);
    expect(result.digitalCookie.manualEntry).toBe(3);
  });

  it('Donation + CAPTURED is auto-sync, not manual', () => {
    const store = createDataStore() as DataStore;
    store.rawDCData = [{ 'Girl Last Name': 'Doe', 'Order Type': 'Donation', 'Payment Status': 'CAPTURED', Donation: '4' }];
    const result = buildCookieShareTracking(store);
    expect(result.digitalCookie.total).toBe(4);
    expect(result.digitalCookie.manualEntry).toBe(0);
  });

  it('counts SC manual COOKIE_SHARE entries', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, orderNumber: '100', packages: 5 }),
      makeTransfer({ category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, orderNumber: '101', packages: 3 })
    ];
    const result = buildCookieShareTracking(store);
    expect(result.smartCookie.manualEntries).toBe(8);
  });

  it('excludes D-prefixed orders from SC manual count', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, orderNumber: 'D1001', packages: 5 }),
      makeTransfer({ category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, orderNumber: '100', packages: 3 })
    ];
    const result = buildCookieShareTracking(store);
    expect(result.smartCookie.manualEntries).toBe(3);
  });

  it('excludes booth cookie share from SC manual count', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.BOOTH_COOKIE_SHARE, orderNumber: '100', packages: 5 }),
      makeTransfer({ category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, orderNumber: '101', packages: 3 })
    ];
    const result = buildCookieShareTracking(store);
    expect(result.smartCookie.manualEntries).toBe(3);
  });

  it('reconciled when DC manual entries match SC manual entries', () => {
    const store = createDataStore() as DataStore;
    store.rawDCData = [{ 'Girl Last Name': 'Doe', 'Order Type': 'In-Person Delivery', 'Payment Status': 'CASH', Donation: '5' }];
    store.transfers = [makeTransfer({ category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, orderNumber: '100', packages: 5 })];
    const result = buildCookieShareTracking(store);
    expect(result.digitalCookie.manualEntry).toBe(5);
    expect(result.smartCookie.manualEntries).toBe(5);
    expect(result.reconciled).toBe(true);
  });

  it('not reconciled when DC and SC manual entries differ', () => {
    const store = createDataStore() as DataStore;
    store.rawDCData = [{ 'Girl Last Name': 'Doe', 'Order Type': 'In-Person Delivery', 'Payment Status': 'CASH', Donation: '5' }];
    store.transfers = [makeTransfer({ category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, orderNumber: '100', packages: 3 })];
    const result = buildCookieShareTracking(store);
    expect(result.reconciled).toBe(false);
  });

  it('reconciled when both are zero (no manual entries)', () => {
    const store = createDataStore();
    const result = buildCookieShareTracking(store);
    expect(result.reconciled).toBe(true);
  });

  it('uses Math.abs for SC transfer packages', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [makeTransfer({ category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, orderNumber: '100', packages: -5 })];
    const result = buildCookieShareTracking(store);
    expect(result.smartCookie.manualEntries).toBe(5);
  });
});
