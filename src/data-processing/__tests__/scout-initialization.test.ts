import { describe, expect, it } from 'vitest';
import { createDataStore, type DataStore } from '../../data-store';
import { initializeScouts } from '../calculators/scout-initialization';

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
