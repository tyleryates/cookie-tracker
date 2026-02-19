import { describe, expect, it } from 'vitest';
import { ALLOCATION_CHANNEL, ORDER_TYPE, OWNER, TRANSFER_CATEGORY } from '../../constants';
import { createDataStore, type DataStore } from '../../data-store';
import type { Order, Scout, Transfer } from '../../types';
import { buildSiteOrdersDataset } from '../calculators/site-orders';
import { makeScout } from './test-utils';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderNumber: '',
    scout: '',
    date: '',
    owner: OWNER.TROOP,
    orderType: ORDER_TYPE.DELIVERY,
    packages: 0,
    physicalPackages: 0,
    donations: 0,
    amount: 0,
    varieties: {},
    sources: [],
    metadata: { dc: null, sc: null, scReport: null, scApi: null },
    ...overrides
  };
}

function makeTransfer(overrides: Partial<Transfer>): Transfer {
  return {
    type: 'T2G',
    category: TRANSFER_CATEGORY.GIRL_PICKUP,
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

describe('buildSiteOrdersDataset', () => {
  it('returns empty categories when no site scout exists', () => {
    const store = createDataStore();
    const scouts: Record<string, Scout> = { Jane: makeScout('Jane') };
    const result = buildSiteOrdersDataset(store, scouts);
    expect(result.directShip.total).toBe(0);
    expect(result.girlDelivery.total).toBe(0);
    expect(result.boothSale.total).toBe(0);
  });

  it('classifies site orders by type', () => {
    const store = createDataStore();
    const site = makeScout('Troop Site');
    site.isSiteOrder = true;
    site.orders = [
      makeOrder({ orderNumber: '1', physicalPackages: 5, orderType: ORDER_TYPE.DIRECT_SHIP }),
      makeOrder({ orderNumber: '2', physicalPackages: 3, orderType: ORDER_TYPE.BOOTH }),
      makeOrder({ orderNumber: '3', physicalPackages: 7, orderType: ORDER_TYPE.DELIVERY })
    ];
    const scouts = { 'Troop Site': site };
    const result = buildSiteOrdersDataset(store, scouts);
    expect(result.directShip.total).toBe(5);
    expect(result.boothSale.total).toBe(3);
    expect(result.girlDelivery.total).toBe(7);
  });

  it('skips donation orders', () => {
    const store = createDataStore();
    const site = makeScout('Troop Site');
    site.isSiteOrder = true;
    site.orders = [
      makeOrder({ orderNumber: '1', physicalPackages: 5, orderType: ORDER_TYPE.DONATION }),
      makeOrder({ orderNumber: '2', physicalPackages: 3, orderType: ORDER_TYPE.DELIVERY })
    ];
    const scouts = { 'Troop Site': site };
    const result = buildSiteOrdersDataset(store, scouts);
    expect(result.girlDelivery.total).toBe(3);
    // Donation order is excluded
    expect(result.directShip.total).toBe(0);
    expect(result.boothSale.total).toBe(0);
  });

  it('calculates unallocated packages', () => {
    const store = createDataStore() as DataStore;
    const site = makeScout('Troop Site');
    site.isSiteOrder = true;
    site.orders = [makeOrder({ orderNumber: '1', physicalPackages: 10, orderType: ORDER_TYPE.DELIVERY })];

    // Virtual booth allocations count toward girlDelivery allocated
    store.transfers = [makeTransfer({ category: TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION, physicalPackages: 6 })];

    const scouts = { 'Troop Site': site };
    const result = buildSiteOrdersDataset(store, scouts);
    expect(result.girlDelivery.total).toBe(10);
    expect(result.girlDelivery.allocated).toBe(6);
    expect(result.girlDelivery.unallocated).toBe(4);
    expect(result.girlDelivery.hasWarning).toBe(true);
  });

  it('no warning when fully allocated', () => {
    const store = createDataStore() as DataStore;
    const site = makeScout('Troop Site');
    site.isSiteOrder = true;
    site.orders = [makeOrder({ orderNumber: '1', physicalPackages: 5, orderType: ORDER_TYPE.DELIVERY })];
    store.transfers = [makeTransfer({ category: TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION, physicalPackages: 5 })];
    const scouts = { 'Troop Site': site };
    const result = buildSiteOrdersDataset(store, scouts);
    expect(result.girlDelivery.hasWarning).toBe(false);
    expect(result.girlDelivery.unallocated).toBe(0);
  });

  it('uses store.allocations for direct ship and booth allocations', () => {
    const store = createDataStore() as DataStore;
    store.allocations = [
      { channel: ALLOCATION_CHANNEL.DIRECT_SHIP, girlId: 1, packages: 4, donations: 0, varieties: {} },
      { channel: ALLOCATION_CHANNEL.BOOTH, girlId: 1, packages: 3, donations: 0, varieties: {} }
    ];
    const site = makeScout('Troop Site');
    site.isSiteOrder = true;
    site.orders = [
      makeOrder({ orderNumber: '1', physicalPackages: 10, orderType: ORDER_TYPE.DIRECT_SHIP }),
      makeOrder({ orderNumber: '2', physicalPackages: 8, orderType: ORDER_TYPE.BOOTH })
    ];
    const scouts = { 'Troop Site': site };
    const result = buildSiteOrdersDataset(store, scouts);
    expect(result.directShip.allocated).toBe(4);
    expect(result.boothSale.allocated).toBe(3);
  });

  it('unallocated clamps to zero (over-allocated)', () => {
    const store = createDataStore() as DataStore;
    store.allocations = [{ channel: ALLOCATION_CHANNEL.DIRECT_SHIP, girlId: 1, packages: 20, donations: 0, varieties: {} }];
    const site = makeScout('Troop Site');
    site.isSiteOrder = true;
    site.orders = [makeOrder({ orderNumber: '1', physicalPackages: 5, orderType: ORDER_TYPE.DIRECT_SHIP })];
    const scouts = { 'Troop Site': site };
    const result = buildSiteOrdersDataset(store, scouts);
    expect(result.directShip.unallocated).toBe(0);
    expect(result.directShip.hasWarning).toBe(false);
  });
});
