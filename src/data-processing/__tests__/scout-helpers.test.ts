import { describe, expect, it } from 'vitest';
import { DATA_SOURCES, TRANSFER_TYPE } from '../../constants';
import { createDataStore } from '../../data-store';
import type { SCDividerGirl } from '../../scrapers/sc-types';
import {
  mergeDCOrderFromSC,
  parseGirlAllocation,
  recordImportMetadata,
  registerScout,
  trackScoutFromAPITransfer,
  updateScoutData
} from '../importers/scout-helpers';

function makeGirl(overrides?: Partial<SCDividerGirl>): SCDividerGirl {
  return { id: 100, first_name: 'Jane', last_name: 'Doe', cookies: [], ...overrides };
}

describe('recordImportMetadata', () => {
  it('sets timestamp and adds source entry', () => {
    const store = createDataStore();
    recordImportMetadata(store, 'lastImportSC', DATA_SOURCES.SMART_COOKIE, 42);
    expect(store.metadata.lastImportSC).toBeTruthy();
    expect(store.metadata.sources).toHaveLength(1);
    expect(store.metadata.sources[0].type).toBe('SC');
    expect(store.metadata.sources[0].records).toBe(42);
  });

  it('appends multiple source entries', () => {
    const store = createDataStore();
    recordImportMetadata(store, 'lastImportSC', DATA_SOURCES.SMART_COOKIE, 10);
    recordImportMetadata(store, 'lastImportDC', DATA_SOURCES.DIGITAL_COOKIE, 20);
    expect(store.metadata.sources).toHaveLength(2);
  });
});

describe('updateScoutData', () => {
  it('creates a new scout with defaults', () => {
    const store = createDataStore();
    updateScoutData(store, 'Alice Smith');
    const scout = store.scouts.get('Alice Smith');
    expect(scout).toBeTruthy();
    expect(scout!.name).toBe('Alice Smith');
    expect(scout!.scoutId).toBeNull();
  });

  it('updates existing scout with non-null fields', () => {
    const store = createDataStore();
    updateScoutData(store, 'Alice Smith');
    updateScoutData(store, 'Alice Smith', { scoutId: 42, gradeLevel: '4th' });
    const scout = store.scouts.get('Alice Smith');
    expect(scout!.scoutId).toBe(42);
    expect(scout!.gradeLevel).toBe('4th');
  });

  it('does not overwrite with null values', () => {
    const store = createDataStore();
    updateScoutData(store, 'Alice Smith', { scoutId: 42 });
    updateScoutData(store, 'Alice Smith', { scoutId: null });
    expect(store.scouts.get('Alice Smith')!.scoutId).toBe(42);
  });

  it('does not overwrite with undefined values', () => {
    const store = createDataStore();
    updateScoutData(store, 'Alice Smith', { scoutId: 42 });
    updateScoutData(store, 'Alice Smith', { scoutId: undefined });
    expect(store.scouts.get('Alice Smith')!.scoutId).toBe(42);
  });
});

describe('registerScout', () => {
  it('creates scout from girl data', () => {
    const store = createDataStore();
    registerScout(store, 100, makeGirl());
    expect(store.scouts.has('Jane Doe')).toBe(true);
    expect(store.scouts.get('Jane Doe')!.scoutId).toBe(100);
  });

  it('does not overwrite existing scoutId', () => {
    const store = createDataStore();
    updateScoutData(store, 'Jane Doe', { scoutId: 99 });
    registerScout(store, 100, makeGirl());
    expect(store.scouts.get('Jane Doe')!.scoutId).toBe(99);
  });

  it('sets scoutId if existing scout has none', () => {
    const store = createDataStore();
    updateScoutData(store, 'Jane Doe');
    registerScout(store, 100, makeGirl());
    expect(store.scouts.get('Jane Doe')!.scoutId).toBe(100);
  });

  it('skips if girlId is 0', () => {
    const store = createDataStore();
    registerScout(store, 0, makeGirl());
    expect(store.scouts.size).toBe(0);
  });

  it('skips if name is empty', () => {
    const store = createDataStore();
    registerScout(store, 100, makeGirl({ first_name: '', last_name: '' }));
    expect(store.scouts.size).toBe(0);
  });
});

describe('trackScoutFromAPITransfer', () => {
  it('registers T2G recipient as scout', () => {
    const store = createDataStore();
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.T2G, 'Jane Doe', 'Troop 3990');
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('registers G2T sender as scout', () => {
    const store = createDataStore();
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.G2T, 'Troop 3990', 'Jane Doe');
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('registers Cookie Share recipient as scout', () => {
    const store = createDataStore();
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.COOKIE_SHARE, 'Jane Doe', 'Troop 3990');
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('registers Cookie Share D recipient as scout', () => {
    const store = createDataStore();
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.COOKIE_SHARE_D, 'Jane Doe', 'Troop 3990');
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('does not register T2G when to === from', () => {
    const store = createDataStore();
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.T2G, 'Troop 3990', 'Troop 3990');
    expect(store.scouts.size).toBe(0);
  });

  it('does not register for C2T transfers', () => {
    const store = createDataStore();
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.C2T, 'Troop 3990', 'Council');
    expect(store.scouts.size).toBe(0);
  });
});

describe('mergeDCOrderFromSC', () => {
  it('creates order with D-prefix stripped', () => {
    const store = createDataStore();
    mergeDCOrderFromSC(store, 'D12345', 'Jane Doe', { date: '2025-02-01', packages: 5, amount: 30 }, {}, DATA_SOURCES.SMART_COOKIE, {});
    expect(store.orders.has('12345')).toBe(true);
    const order = store.orders.get('12345')!;
    expect(order.orderNumber).toBe('12345');
    expect(order.scout).toBe('Jane Doe');
    expect(order.packages).toBe(5);
  });

  it('uses absolute values for packages and amount', () => {
    const store = createDataStore();
    mergeDCOrderFromSC(store, 'D999', 'Jane Doe', { date: '2025-02-01', packages: -3, amount: -18 }, {}, DATA_SOURCES.SMART_COOKIE, {});
    const order = store.orders.get('999')!;
    expect(order.packages).toBe(3);
    expect(order.amount).toBe(18);
  });
});

describe('parseGirlAllocation', () => {
  it('returns null for zero packages', () => {
    const store = createDataStore();
    const seen = new Set<string>();
    const result = parseGirlAllocation(makeGirl({ cookies: [] }), 'booth-1', seen, store, null);
    expect(result).toBeNull();
  });

  it('returns null for duplicate key', () => {
    const store = createDataStore();
    const seen = new Set<string>();
    const girl = makeGirl({ cookies: [{ id: 1, quantity: 5 }] });
    // First call succeeds
    parseGirlAllocation(girl, 'booth-1', seen, store, { '1': 'THIN_MINTS' });
    // Second call is a duplicate
    const result = parseGirlAllocation(girl, 'booth-1', seen, store, { '1': 'THIN_MINTS' });
    expect(result).toBeNull();
  });

  it('registers scout and returns allocation data', () => {
    const store = createDataStore();
    const seen = new Set<string>();
    const girl = makeGirl({ cookies: [{ id: 1, quantity: 10 }] });
    const result = parseGirlAllocation(girl, 'booth-1', seen, store, { '1': 'THIN_MINTS' });
    expect(result).not.toBeNull();
    expect(result!.girlId).toBe(100);
    expect(result!.totalPackages).toBe(10);
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });
});
