import { describe, expect, it } from 'vitest';
import { ALLOCATION_CHANNEL, ALLOCATION_SOURCE, TRANSFER_CATEGORY } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import { createDataStore, type DataStore } from '../../data-store';
import type { Transfer } from '../../types';
import { addAllocations, addInventory } from '../calculators/allocation-processing';
import { makeScout } from './test-utils';

function makeTransfer(overrides: Partial<Transfer>): Transfer {
  return {
    type: 'T2G',
    category: TRANSFER_CATEGORY.GIRL_PICKUP,
    date: '2025-01-15',
    from: 'Troop 3990',
    to: 'Jane Doe',
    packages: 0,
    physicalPackages: 0,
    cases: 0,
    varieties: {},
    physicalVarieties: {},
    ...overrides
  };
}

describe('addInventory', () => {
  it('adds physical packages from T2G pickup', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({
        category: TRANSFER_CATEGORY.GIRL_PICKUP,
        to: 'Jane Doe',
        physicalPackages: 10,
        physicalVarieties: { THIN_MINTS: 6, TREFOILS: 4 }
      })
    ];
    const scoutDataset = new Map();
    const jane = makeScout('Jane Doe');
    scoutDataset.set('Jane Doe', jane);

    addInventory(store, scoutDataset);

    expect(jane.inventory.total).toBe(10);
    expect(jane.inventory.varieties.THIN_MINTS).toBe(6);
    expect(jane.inventory.varieties.TREFOILS).toBe(4);
  });

  it('subtracts physical packages from G2T return', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({
        category: TRANSFER_CATEGORY.GIRL_RETURN,
        from: 'Jane Doe',
        to: 'Troop 3990',
        physicalPackages: 3,
        physicalVarieties: { THIN_MINTS: 3 }
      })
    ];
    const scoutDataset = new Map();
    const jane = makeScout('Jane Doe');
    scoutDataset.set('Jane Doe', jane);

    addInventory(store, scoutDataset);

    expect(jane.inventory.total).toBe(-3);
    expect(jane.inventory.varieties.THIN_MINTS).toBe(-3);
  });

  it('accumulates multiple transfers', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({
        category: TRANSFER_CATEGORY.GIRL_PICKUP,
        to: 'Jane Doe',
        physicalPackages: 10,
        physicalVarieties: { THIN_MINTS: 10 }
      }),
      makeTransfer({ category: TRANSFER_CATEGORY.GIRL_RETURN, from: 'Jane Doe', physicalPackages: 3, physicalVarieties: { THIN_MINTS: 3 } })
    ];
    const scoutDataset = new Map();
    const jane = makeScout('Jane Doe');
    scoutDataset.set('Jane Doe', jane);

    addInventory(store, scoutDataset);

    expect(jane.inventory.total).toBe(7); // 10 - 3
    expect(jane.inventory.varieties.THIN_MINTS).toBe(7);
  });

  it('ignores non-physical transfer categories', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION, to: 'Jane Doe', physicalPackages: 10 }),
      makeTransfer({ category: TRANSFER_CATEGORY.DC_ORDER_RECORD, to: 'Jane Doe', physicalPackages: 5 })
    ];
    const scoutDataset = new Map();
    const jane = makeScout('Jane Doe');
    scoutDataset.set('Jane Doe', jane);

    addInventory(store, scoutDataset);

    expect(jane.inventory.total).toBe(0);
  });

  it('skips transfers for unknown scouts', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [makeTransfer({ category: TRANSFER_CATEGORY.GIRL_PICKUP, to: 'Unknown Girl', physicalPackages: 10 })];
    const scoutDataset = new Map();
    addInventory(store, scoutDataset);
    // No error thrown
    expect(scoutDataset.size).toBe(0);
  });
});

describe('addAllocations', () => {
  it('processes virtual booth T2G transfers', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({
        category: TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION,
        to: 'Jane Doe',
        physicalPackages: 5,
        varieties: { THIN_MINTS: 3, [COOKIE_TYPE.COOKIE_SHARE]: 2 },
        date: '2025-01-15',
        orderNumber: 'VB-1',
        from: 'Troop 3990',
        amount: 30
      })
    ];
    const scoutDataset = new Map();
    const jane = makeScout('Jane Doe', 42);
    scoutDataset.set('Jane Doe', jane);

    addAllocations(store, scoutDataset);

    expect(jane.allocations.length).toBe(1);
    expect(jane.allocations[0].channel).toBe(ALLOCATION_CHANNEL.VIRTUAL_BOOTH);
    expect(jane.allocations[0].packages).toBe(5);
    expect(jane.allocations[0].donations).toBe(2); // Cookie Share count
    expect(jane.allocations[0].source).toBe(ALLOCATION_SOURCE.VIRTUAL_BOOTH_TRANSFER);
  });

  it('processes imported allocations (booth + direct ship)', () => {
    const store = createDataStore() as DataStore;
    store.allocations = [
      {
        channel: ALLOCATION_CHANNEL.BOOTH,
        girlId: 42,
        packages: 5,
        donations: 0,
        varieties: { THIN_MINTS: 5 },
        source: ALLOCATION_SOURCE.SMART_BOOTH_DIVIDER
      },
      {
        channel: ALLOCATION_CHANNEL.DIRECT_SHIP,
        girlId: 42,
        packages: 3,
        donations: 0,
        varieties: { TREFOILS: 3 },
        source: ALLOCATION_SOURCE.SMART_DIRECT_SHIP_DIVIDER
      }
    ];
    const scoutDataset = new Map();
    const jane = makeScout('Jane Doe', 42);
    scoutDataset.set('Jane Doe', jane);

    addAllocations(store, scoutDataset);

    expect(jane.allocations.length).toBe(2);
    expect(jane.allocations[0].channel).toBe(ALLOCATION_CHANNEL.BOOTH);
    expect(jane.allocations[1].channel).toBe(ALLOCATION_CHANNEL.DIRECT_SHIP);
  });

  it('skips allocations for unknown scouts (no girlId match)', () => {
    const store = createDataStore() as DataStore;
    store.allocations = [{ channel: ALLOCATION_CHANNEL.BOOTH, girlId: 999, packages: 5, donations: 0, varieties: {} }];
    const scoutDataset = new Map();
    const jane = makeScout('Jane Doe', 42);
    scoutDataset.set('Jane Doe', jane);

    addAllocations(store, scoutDataset);

    // girlId 999 doesn't match any scout
    expect(jane.allocations.length).toBe(0);
  });

  it('virtual booth skips unknown scouts', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({
        category: TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION,
        to: 'Unknown Girl',
        physicalPackages: 5,
        varieties: { THIN_MINTS: 5 }
      })
    ];
    const scoutDataset = new Map();
    addAllocations(store, scoutDataset);
    // No error thrown
    expect(scoutDataset.size).toBe(0);
  });
});
