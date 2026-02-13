import { describe, expect, it } from 'vitest';
import { createDataStore, type DataStore } from '../../data-store';
import type { Warning } from '../../types';
import { buildUnifiedMetadata } from '../calculators/metadata';
import { makeScout } from './test-utils';

describe('buildUnifiedMetadata', () => {
  it('returns store metadata fields', () => {
    const store = createDataStore() as DataStore;
    store.metadata.lastImportDC = '2025-01-15T10:00:00Z';
    store.metadata.lastImportSC = '2025-01-15T11:00:00Z';
    store.metadata.sources = [{ type: 'DC', date: '2025-01-15T10:00:00Z', records: 10 }];
    const result = buildUnifiedMetadata(store, [], {});
    expect(result.lastImportDC).toBe('2025-01-15T10:00:00Z');
    expect(result.lastImportSC).toBe('2025-01-15T11:00:00Z');
    expect(result.sources.length).toBe(1);
  });

  it('sets unifiedBuildTime', () => {
    const store = createDataStore();
    const result = buildUnifiedMetadata(store, [], {});
    expect(result.unifiedBuildTime).toBeTruthy();
    // Should be a valid ISO string
    expect(new Date(result.unifiedBuildTime).getTime()).toBeGreaterThan(0);
  });

  it('counts scouts', () => {
    const scouts = {
      Jane: makeScout('Jane'),
      Bob: makeScout('Bob')
    };
    const result = buildUnifiedMetadata(createDataStore(), [], scouts);
    expect(result.scoutCount).toBe(2);
  });

  it('counts orders across all scouts', () => {
    const jane = makeScout('Jane');
    jane.orders = [{ orderNumber: '1' }, { orderNumber: '2' }] as any;
    const bob = makeScout('Bob');
    bob.orders = [{ orderNumber: '3' }] as any;
    const result = buildUnifiedMetadata(createDataStore(), [], { Jane: jane, Bob: bob });
    expect(result.orderCount).toBe(3);
  });

  it('health checks count total warnings', () => {
    const warnings: Warning[] = [
      { type: 'UNKNOWN_ORDER_TYPE', message: 'test' },
      { type: 'UNKNOWN_PAYMENT_METHOD', message: 'test' }
    ];
    const result = buildUnifiedMetadata(createDataStore(), warnings, {});
    expect(result.healthChecks.warningsCount).toBe(2);
  });

  it('health checks count unknown order types', () => {
    const warnings: Warning[] = [
      { type: 'UNKNOWN_ORDER_TYPE', message: 'a' },
      { type: 'UNKNOWN_ORDER_TYPE', message: 'b' },
      { type: 'UNKNOWN_PAYMENT_METHOD', message: 'c' }
    ];
    const result = buildUnifiedMetadata(createDataStore(), warnings, {});
    expect(result.healthChecks.unknownOrderTypes).toBe(2);
  });

  it('health checks count unknown payment methods', () => {
    const warnings: Warning[] = [{ type: 'UNKNOWN_PAYMENT_METHOD', message: 'a' }];
    const result = buildUnifiedMetadata(createDataStore(), warnings, {});
    expect(result.healthChecks.unknownPaymentMethods).toBe(1);
  });

  it('health checks count unknown transfer types', () => {
    const warnings: Warning[] = [
      { type: 'UNKNOWN_TRANSFER_TYPE', message: 'a' },
      { type: 'UNKNOWN_TRANSFER_TYPE', message: 'b' }
    ];
    const result = buildUnifiedMetadata(createDataStore(), warnings, {});
    expect(result.healthChecks.unknownTransferTypes).toBe(2);
  });

  it('health checks count unknown cookie IDs', () => {
    const warnings: Warning[] = [{ type: 'UNKNOWN_COOKIE_ID', message: 'a' }];
    const result = buildUnifiedMetadata(createDataStore(), warnings, {});
    expect(result.healthChecks.unknownCookieIds).toBe(1);
  });

  it('health checks are all zero when no warnings', () => {
    const result = buildUnifiedMetadata(createDataStore(), [], {});
    expect(result.healthChecks.warningsCount).toBe(0);
    expect(result.healthChecks.unknownOrderTypes).toBe(0);
    expect(result.healthChecks.unknownPaymentMethods).toBe(0);
    expect(result.healthChecks.unknownTransferTypes).toBe(0);
    expect(result.healthChecks.unknownCookieIds).toBe(0);
  });

  it('passes through cookieIdMap from store', () => {
    const store = createDataStore() as DataStore;
    store.metadata.cookieIdMap = { '1': 'THIN_MINTS' as any };
    const result = buildUnifiedMetadata(store, [], {});
    expect(result.cookieIdMap).toEqual({ '1': 'THIN_MINTS' });
  });
});
