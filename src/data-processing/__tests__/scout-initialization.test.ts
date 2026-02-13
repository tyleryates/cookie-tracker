import { describe, expect, it } from 'vitest';
import { TRANSFER_TYPE } from '../../constants';
import { createDataStore, type DataStore } from '../../data-store';
import { initializeScouts } from '../calculators/scout-initialization';
import {
  mergeDCOrderFromSC,
  parseGirlAllocation,
  recordImportMetadata,
  registerScout,
  trackScoutFromAPITransfer,
  updateScoutData
} from '../importers/scout-helpers';

// ============================================================================
// initializeScouts
// ============================================================================

describe('initializeScouts', () => {
  it('creates scouts from DC data', () => {
    const store = createDataStore();
    const rawDC = [{ 'Girl First Name': 'Jane', 'Girl Last Name': 'Doe' }];
    const scouts = initializeScouts(store, rawDC);
    expect(scouts.has('Jane Doe')).toBe(true);
    expect(scouts.get('Jane Doe')!.isSiteOrder).toBe(false);
  });

  it('detects site orders from last name "Site"', () => {
    const store = createDataStore();
    const rawDC = [{ 'Girl First Name': 'Troop3990', 'Girl Last Name': 'Site' }];
    const scouts = initializeScouts(store, rawDC);
    expect(scouts.get('Troop3990 Site')!.isSiteOrder).toBe(true);
  });

  it('adds scouts from SC data not in DC', () => {
    const store = createDataStore() as DataStore;
    store.scouts.set('Bob Smith', {
      name: 'Bob Smith',
      scoutId: 42,
      gsusaId: null,
      gradeLevel: null,
      serviceUnit: null,
      troopId: null,
      council: null,
      district: null
    });
    const scouts = initializeScouts(store, []);
    expect(scouts.has('Bob Smith')).toBe(true);
    expect(scouts.get('Bob Smith')!.girlId).toBe(42);
  });

  it('enriches existing DC scout with SC girlId', () => {
    const store = createDataStore() as DataStore;
    store.scouts.set('Jane Doe', {
      name: 'Jane Doe',
      scoutId: 42,
      gsusaId: null,
      gradeLevel: null,
      serviceUnit: null,
      troopId: null,
      council: null,
      district: null
    });
    const rawDC = [{ 'Girl First Name': 'Jane', 'Girl Last Name': 'Doe' }];
    const scouts = initializeScouts(store, rawDC);
    expect(scouts.get('Jane Doe')!.girlId).toBe(42);
  });

  it('does not overwrite existing girlId', () => {
    const store = createDataStore() as DataStore;
    store.scouts.set('Jane Doe', {
      name: 'Jane Doe',
      scoutId: 99,
      gsusaId: null,
      gradeLevel: null,
      serviceUnit: null,
      troopId: null,
      council: null,
      district: null
    });
    const rawDC = [{ 'Girl First Name': 'Jane', 'Girl Last Name': 'Doe' }];
    // First DC import sets girlId from SC
    const scouts = initializeScouts(store, rawDC);
    // If already set from DC, SC data shouldn't overwrite
    expect(scouts.get('Jane Doe')!.girlId).toBe(99);
  });

  it('deduplicates DC rows with same name', () => {
    const store = createDataStore();
    const rawDC = [
      { 'Girl First Name': 'Jane', 'Girl Last Name': 'Doe' },
      { 'Girl First Name': 'Jane', 'Girl Last Name': 'Doe' }
    ];
    const scouts = initializeScouts(store, rawDC);
    expect(scouts.size).toBe(1);
  });

  it('handles empty input', () => {
    const store = createDataStore();
    const scouts = initializeScouts(store, []);
    expect(scouts.size).toBe(0);
  });

  it('creates scout structure with default totals', () => {
    const store = createDataStore();
    const rawDC = [{ 'Girl First Name': 'Jane', 'Girl Last Name': 'Doe' }];
    const scouts = initializeScouts(store, rawDC);
    const scout = scouts.get('Jane Doe')!;
    expect(scout.orders).toEqual([]);
    expect(scout.allocations).toEqual([]);
    expect(scout.inventory).toEqual({ total: 0, varieties: {} });
    expect(scout.totals.orders).toBe(0);
    expect(scout.totals.$financials.cashCollected).toBe(0);
  });
});

// ============================================================================
// scout-helpers
// ============================================================================

describe('updateScoutData', () => {
  it('creates a new scout entry', () => {
    const store = createDataStore() as DataStore;
    updateScoutData(store, 'Jane Doe', {});
    expect(store.scouts.has('Jane Doe')).toBe(true);
    expect(store.scouts.get('Jane Doe')!.name).toBe('Jane Doe');
  });

  it('sets non-null metadata fields', () => {
    const store = createDataStore() as DataStore;
    updateScoutData(store, 'Jane Doe', { scoutId: 42, gradeLevel: '3rd' });
    const scout = store.scouts.get('Jane Doe')!;
    expect(scout.scoutId).toBe(42);
    expect(scout.gradeLevel).toBe('3rd');
  });

  it('does not overwrite with null values', () => {
    const store = createDataStore() as DataStore;
    updateScoutData(store, 'Jane Doe', { scoutId: 42 });
    updateScoutData(store, 'Jane Doe', { scoutId: null as any });
    expect(store.scouts.get('Jane Doe')!.scoutId).toBe(42);
  });

  it('updates existing scout', () => {
    const store = createDataStore() as DataStore;
    updateScoutData(store, 'Jane Doe', { scoutId: 42 });
    updateScoutData(store, 'Jane Doe', { gradeLevel: '4th' });
    const scout = store.scouts.get('Jane Doe')!;
    expect(scout.scoutId).toBe(42);
    expect(scout.gradeLevel).toBe('4th');
  });
});

describe('registerScout', () => {
  it('registers a new scout by girlId', () => {
    const store = createDataStore() as DataStore;
    registerScout(store, 42, { id: 42, first_name: 'Jane', last_name: 'Doe' });
    expect(store.scouts.has('Jane Doe')).toBe(true);
    expect(store.scouts.get('Jane Doe')!.scoutId).toBe(42);
  });

  it('updates existing scout scoutId if not set', () => {
    const store = createDataStore() as DataStore;
    updateScoutData(store, 'Jane Doe', {});
    registerScout(store, 42, { id: 42, first_name: 'Jane', last_name: 'Doe' });
    expect(store.scouts.get('Jane Doe')!.scoutId).toBe(42);
  });

  it('does not overwrite existing scoutId', () => {
    const store = createDataStore() as DataStore;
    updateScoutData(store, 'Jane Doe', { scoutId: 99 });
    registerScout(store, 42, { id: 42, first_name: 'Jane', last_name: 'Doe' });
    expect(store.scouts.get('Jane Doe')!.scoutId).toBe(99);
  });

  it('skips registration with no girlId', () => {
    const store = createDataStore() as DataStore;
    registerScout(store, 0, { id: 0, first_name: 'Jane', last_name: 'Doe' });
    expect(store.scouts.size).toBe(0);
  });

  it('skips registration with empty name', () => {
    const store = createDataStore() as DataStore;
    registerScout(store, 42, { id: 42 });
    expect(store.scouts.size).toBe(0);
  });
});

describe('trackScoutFromAPITransfer', () => {
  it('registers scout from T2G transfer (to field)', () => {
    const store = createDataStore() as DataStore;
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.T2G, 'Jane Doe', 'Troop 3990');
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('registers scout from G2T transfer (from field)', () => {
    const store = createDataStore() as DataStore;
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.G2T, 'Troop 3990', 'Jane Doe');
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('registers scout from Cookie Share transfer', () => {
    const store = createDataStore() as DataStore;
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.COOKIE_SHARE, 'Jane Doe', 'Troop 3990');
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('does not register when to equals from in T2G', () => {
    const store = createDataStore() as DataStore;
    trackScoutFromAPITransfer(store, TRANSFER_TYPE.T2G, 'Troop 3990', 'Troop 3990');
    expect(store.scouts.size).toBe(0);
  });
});

describe('recordImportMetadata', () => {
  it('sets timestamp and adds source entry', () => {
    const store = createDataStore() as DataStore;
    recordImportMetadata(store, 'lastImportDC', 'DigitalCookie', 10);
    expect(store.metadata.lastImportDC).toBeTruthy();
    expect(store.metadata.sources.length).toBe(1);
    expect(store.metadata.sources[0].type).toBe('DigitalCookie');
    expect(store.metadata.sources[0].records).toBe(10);
  });
});

describe('mergeDCOrderFromSC', () => {
  it('creates a DC order with D prefix stripped', () => {
    const store = createDataStore() as DataStore;
    mergeDCOrderFromSC(store, 'D1001', 'Jane Doe', { date: '2025-01-15', packages: 5, amount: 30 }, {}, 'SC_API', {});
    expect(store.orders.has('1001')).toBe(true);
    const order = store.orders.get('1001')!;
    expect(order.orderNumber).toBe('1001');
    expect(order.scout).toBe('Jane Doe');
    expect(order.packages).toBe(5);
    expect(order.status).toBe('In SC Only');
  });

  it('uses absolute values for packages and amount', () => {
    const store = createDataStore() as DataStore;
    mergeDCOrderFromSC(store, 'D1001', 'Jane', { date: '', packages: -5, amount: -30 }, {}, 'SC', {});
    const order = store.orders.get('1001')!;
    expect(order.packages).toBe(5);
    expect(order.amount).toBe(30);
  });
});

describe('parseGirlAllocation', () => {
  it('returns allocation for valid girl with cookies', () => {
    const store = createDataStore() as DataStore;
    const seen = new Set<string>();
    const idMap: Record<string, any> = { '1': 'THIN_MINTS' };
    const result = parseGirlAllocation(
      { id: 42, first_name: 'Jane', last_name: 'Doe', cookies: [{ id: 1, quantity: 5 }] },
      'RES-1',
      seen,
      store,
      idMap
    );
    expect(result).not.toBeNull();
    expect(result!.girlId).toBe(42);
    expect(result!.totalPackages).toBe(5);
  });

  it('returns null for zero total packages', () => {
    const store = createDataStore() as DataStore;
    const seen = new Set<string>();
    const result = parseGirlAllocation({ id: 42, first_name: 'Jane', last_name: 'Doe', cookies: [] }, 'RES-1', seen, store, null);
    expect(result).toBeNull();
  });

  it('deduplicates by prefix-girlId key', () => {
    const store = createDataStore() as DataStore;
    const seen = new Set<string>();
    const idMap: Record<string, any> = { '1': 'THIN_MINTS' };
    const girl = { id: 42, first_name: 'Jane', last_name: 'Doe', cookies: [{ id: 1, quantity: 5 }] };
    const first = parseGirlAllocation(girl, 'RES-1', seen, store, idMap);
    const second = parseGirlAllocation(girl, 'RES-1', seen, store, idMap);
    expect(first).not.toBeNull();
    expect(second).toBeNull(); // Duplicate
  });

  it('registers scout in store', () => {
    const store = createDataStore() as DataStore;
    const seen = new Set<string>();
    const idMap: Record<string, any> = { '1': 'THIN_MINTS' };
    parseGirlAllocation({ id: 42, first_name: 'Jane', last_name: 'Doe', cookies: [{ id: 1, quantity: 5 }] }, 'RES-1', seen, store, idMap);
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });
});
