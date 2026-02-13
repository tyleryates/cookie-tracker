import { describe, expect, it } from 'vitest';
import { ORDER_TYPE, OWNER, TRANSFER_CATEGORY } from '../../constants';
import { createDataStore, type DataStore } from '../../data-store';
import type { Order, Transfer } from '../../types';
import { buildVarieties } from '../calculators/varieties';
import { makeScout } from './test-utils';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderNumber: '',
    scout: '',
    date: '',
    owner: OWNER.GIRL,
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

describe('buildVarieties', () => {
  it('aggregates sales by variety from scout orders', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.orders = [makeOrder({ varieties: { THIN_MINTS: 5, TREFOILS: 3 } }), makeOrder({ varieties: { THIN_MINTS: 2 } })];
    const result = buildVarieties(store, { Jane: jane });
    expect(result.byCookie.THIN_MINTS).toBe(7);
    expect(result.byCookie.TREFOILS).toBe(3);
    expect(result.total).toBe(10);
  });

  it('includes direct ship orders in sales', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.orders = [makeOrder({ orderType: ORDER_TYPE.DIRECT_SHIP, owner: OWNER.GIRL, varieties: { THIN_MINTS: 4 } })];
    const result = buildVarieties(store, { Jane: jane });
    expect(result.byCookie.THIN_MINTS).toBe(4);
  });

  it('excludes Cookie Share from sales by variety', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.orders = [makeOrder({ varieties: { THIN_MINTS: 5, COOKIE_SHARE: 2 } })];
    const result = buildVarieties(store, { Jane: jane });
    expect(result.byCookie.THIN_MINTS).toBe(5);
    expect(result.byCookie.COOKIE_SHARE).toBeUndefined();
  });

  it('includes credited allocations in sales (non-site scouts)', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.allocations = [{ channel: 'booth' as any, girlId: 1, packages: 5, donations: 0, varieties: { TREFOILS: 5 } }];
    const result = buildVarieties(store, { Jane: jane });
    expect(result.byCookie.TREFOILS).toBe(5);
  });

  it('skips site scout allocations', () => {
    const store = createDataStore();
    const site = makeScout('Site');
    site.isSiteOrder = true;
    site.allocations = [{ channel: 'booth' as any, girlId: 1, packages: 10, donations: 0, varieties: { TREFOILS: 10 } }];
    const result = buildVarieties(store, { Site: site });
    expect(result.byCookie.TREFOILS).toBeUndefined();
  });

  it('calculates net inventory from C2T transfers', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalVarieties: { THIN_MINTS: 50 } })];
    const result = buildVarieties(store, {});
    expect(result.inventory.THIN_MINTS).toBe(50);
  });

  it('adds G2T returns to inventory', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [makeTransfer({ category: TRANSFER_CATEGORY.GIRL_RETURN, physicalVarieties: { THIN_MINTS: 10 } })];
    const result = buildVarieties(store, {});
    expect(result.inventory.THIN_MINTS).toBe(10);
  });

  it('subtracts T2G categories from inventory', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalVarieties: { THIN_MINTS: 50 } }),
      makeTransfer({ category: TRANSFER_CATEGORY.GIRL_PICKUP, physicalVarieties: { THIN_MINTS: 20 } }),
      makeTransfer({ category: TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION, physicalVarieties: { THIN_MINTS: 5 } }),
      makeTransfer({ category: TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION, physicalVarieties: { THIN_MINTS: 3 } })
    ];
    const result = buildVarieties(store, {});
    expect(result.inventory.THIN_MINTS).toBe(22); // 50 - 20 - 5 - 3
  });

  it('subtracts T2T outgoing from inventory', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ category: TRANSFER_CATEGORY.COUNCIL_TO_TROOP, physicalVarieties: { THIN_MINTS: 50 } }),
      makeTransfer({ type: 'T2T', category: TRANSFER_CATEGORY.TROOP_OUTGOING, physicalVarieties: { THIN_MINTS: 10 } })
    ];
    const result = buildVarieties(store, {});
    expect(result.inventory.THIN_MINTS).toBe(40);
  });

  it('ignores non-inventory transfer categories for inventory', () => {
    const store = createDataStore() as DataStore;
    store.transfers = [
      makeTransfer({ type: 'D', category: TRANSFER_CATEGORY.DC_ORDER_RECORD, physicalVarieties: { THIN_MINTS: 10 } }),
      makeTransfer({ type: 'COOKIE_SHARE', category: TRANSFER_CATEGORY.COOKIE_SHARE_RECORD, physicalVarieties: { THIN_MINTS: 5 } })
    ];
    const result = buildVarieties(store, {});
    expect(result.inventory.THIN_MINTS).toBeUndefined();
  });

  it('excludes troop-owned orders from sales', () => {
    const store = createDataStore();
    const jane = makeScout('Jane');
    jane.orders = [makeOrder({ owner: OWNER.TROOP, orderType: ORDER_TYPE.DELIVERY, varieties: { THIN_MINTS: 10 } })];
    const result = buildVarieties(store, { Jane: jane });
    // TROOP-owned DELIVERY has needsInventory=false, so excluded
    expect(result.byCookie.THIN_MINTS).toBeUndefined();
  });
});
