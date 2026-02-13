import { describe, expect, it } from 'vitest';
import { ALLOCATION_CHANNEL, ORDER_TYPE, OWNER, PAYMENT_METHOD } from '../../constants';
import type { Allocation, Order, Scout } from '../../types';
import { calculateScoutCounts, calculateScoutTotals } from '../calculators/scout-calculations';
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

function makeAllocation(overrides: Partial<Allocation> = {}): Allocation {
  return { channel: ALLOCATION_CHANNEL.BOOTH, girlId: 1, packages: 0, donations: 0, varieties: {}, ...overrides };
}

// Helper: run calculateScoutTotals on a single scout and return it
function calculateSingle(scout: Scout): Scout {
  const map = new Map<string, Scout>();
  map.set(scout.name, scout);
  calculateScoutTotals(map);
  return scout;
}

describe('calculateScoutTotals — order totals', () => {
  it('tallies delivered packages from inventory orders', () => {
    const scout = makeScout('Jane');
    scout.orders = [
      makeOrder({ physicalPackages: 5, owner: OWNER.GIRL, orderType: ORDER_TYPE.DELIVERY }),
      makeOrder({ physicalPackages: 3, owner: OWNER.GIRL, orderType: ORDER_TYPE.IN_HAND })
    ];
    calculateSingle(scout);
    expect(scout.totals.delivered).toBe(8);
  });

  it('tallies shipped packages from direct ship orders', () => {
    const scout = makeScout('Jane');
    scout.orders = [makeOrder({ physicalPackages: 4, owner: OWNER.GIRL, orderType: ORDER_TYPE.DIRECT_SHIP })];
    calculateSingle(scout);
    expect(scout.totals.shipped).toBe(4);
    expect(scout.totals.delivered).toBe(0);
  });

  it('tallies donations', () => {
    const scout = makeScout('Jane');
    scout.orders = [makeOrder({ donations: 3 }), makeOrder({ donations: 2 })];
    calculateSingle(scout);
    expect(scout.totals.donations).toBe(5);
  });

  it('troop-owned orders do not count as delivered', () => {
    const scout = makeScout('Jane');
    scout.orders = [makeOrder({ physicalPackages: 10, owner: OWNER.TROOP, orderType: ORDER_TYPE.DELIVERY })];
    calculateSingle(scout);
    expect(scout.totals.delivered).toBe(0);
  });
});

describe('calculateScoutTotals — credited + totalSold', () => {
  it('sums credited from allocations', () => {
    const scout = makeScout('Jane');
    scout.allocations = [makeAllocation({ packages: 5, donations: 1 }), makeAllocation({ packages: 3, donations: 0 })];
    calculateSingle(scout);
    expect(scout.totals.credited).toBe(9);
  });

  it('totalSold = delivered + shipped + donations + credited', () => {
    const scout = makeScout('Jane');
    scout.orders = [
      makeOrder({ physicalPackages: 5, owner: OWNER.GIRL, orderType: ORDER_TYPE.DELIVERY, donations: 2 }),
      makeOrder({ physicalPackages: 3, owner: OWNER.GIRL, orderType: ORDER_TYPE.DIRECT_SHIP })
    ];
    scout.allocations = [makeAllocation({ packages: 4, donations: 1 })];
    calculateSingle(scout);
    expect(scout.totals.totalSold).toBe(5 + 3 + 2 + 5); // delivered + shipped + donations + credited
  });
});

describe('calculateScoutTotals — financial tracking', () => {
  it('tracks cash collected from girl cash orders', () => {
    const scout = makeScout('Jane');
    scout.orders = [makeOrder({ owner: OWNER.GIRL, amount: 30, paymentMethod: PAYMENT_METHOD.CASH })];
    calculateSingle(scout);
    expect(scout.totals.$financials.cashCollected).toBe(30);
  });

  it('tracks electronic payments for inventory orders', () => {
    const scout = makeScout('Jane');
    scout.orders = [
      makeOrder({
        owner: OWNER.GIRL,
        orderType: ORDER_TYPE.DELIVERY,
        paymentMethod: PAYMENT_METHOD.CREDIT_CARD,
        amount: 30,
        varieties: { THIN_MINTS: 5 } // 5 * $6 = $30
      })
    ];
    calculateSingle(scout);
    expect(scout.totals.$financials.electronicPayments).toBe(30);
  });

  it('does not count electronic direct ship as inventory electronic', () => {
    const scout = makeScout('Jane');
    scout.orders = [
      makeOrder({
        owner: OWNER.GIRL,
        orderType: ORDER_TYPE.DIRECT_SHIP,
        paymentMethod: PAYMENT_METHOD.CREDIT_CARD,
        amount: 30,
        varieties: { THIN_MINTS: 5 }
      })
    ];
    calculateSingle(scout);
    expect(scout.totals.$financials.electronicPayments).toBe(0);
  });

  it('calculates unsold value as inventory minus sold portions', () => {
    const scout = makeScout('Jane');
    scout.inventory = { total: 10, varieties: { THIN_MINTS: 10 } }; // $60 inventory value
    // Only sold 5 packages via cash → $30 sold
    scout.orders = [
      makeOrder({
        owner: OWNER.GIRL,
        orderType: ORDER_TYPE.DELIVERY,
        paymentMethod: PAYMENT_METHOD.CASH,
        amount: 30,
        varieties: { THIN_MINTS: 5 }
      })
    ];
    calculateSingle(scout);
    expect(scout.totals.$financials.inventoryValue).toBe(60);
    expect(scout.totals.$financials.unsoldValue).toBe(30); // 60 - 30
    expect(scout.totals.$financials.cashOwed).toBe(60); // 30 cash + 30 unsold
  });

  it('unsold value floors at zero', () => {
    const scout = makeScout('Jane');
    scout.inventory = { total: 0, varieties: {} }; // $0 inventory
    scout.orders = [makeOrder({ owner: OWNER.GIRL, paymentMethod: PAYMENT_METHOD.CASH, amount: 10 })];
    calculateSingle(scout);
    expect(scout.totals.$financials.unsoldValue).toBe(0);
  });

  it('ignores troop-owned orders in financial tracking', () => {
    const scout = makeScout('Jane');
    scout.orders = [makeOrder({ owner: OWNER.TROOP, amount: 100, paymentMethod: PAYMENT_METHOD.CASH })];
    calculateSingle(scout);
    expect(scout.totals.$financials.cashCollected).toBe(0);
  });
});

describe('calculateScoutTotals — inventory display', () => {
  it('computes net inventory per variety', () => {
    const scout = makeScout('Jane');
    scout.inventory = { total: 10, varieties: { THIN_MINTS: 6, TREFOILS: 4 } };
    scout.orders = [makeOrder({ owner: OWNER.GIRL, orderType: ORDER_TYPE.DELIVERY, varieties: { THIN_MINTS: 2 } })];
    calculateSingle(scout);
    expect(scout.totals.$inventoryDisplay.THIN_MINTS).toBe(4); // 6 - 2
    expect(scout.totals.$inventoryDisplay.TREFOILS).toBe(4); // 4 - 0
  });

  it('allows per-variety negatives in total inventory', () => {
    const scout = makeScout('Jane');
    scout.inventory = { total: 5, varieties: { THIN_MINTS: 5, TREFOILS: 0 } };
    scout.orders = [makeOrder({ owner: OWNER.GIRL, orderType: ORDER_TYPE.DELIVERY, varieties: { TREFOILS: 3 } })];
    calculateSingle(scout);
    // THIN_MINTS: 5 - 0 = 5, TREFOILS: 0 - 3 = -3
    expect(scout.totals.inventory).toBe(2); // 5 + (-3)
  });

  it('detects negative inventory issues', () => {
    const scout = makeScout('Jane');
    scout.inventory = { total: 2, varieties: { THIN_MINTS: 2 } };
    scout.orders = [makeOrder({ owner: OWNER.GIRL, orderType: ORDER_TYPE.DELIVERY, varieties: { THIN_MINTS: 5 } })];
    calculateSingle(scout);
    expect(scout.$issues?.negativeInventory).toBeDefined();
    expect(scout.$issues!.negativeInventory!.length).toBe(1);
    expect(scout.$issues!.negativeInventory![0].variety).toBe('THIN_MINTS');
    expect(scout.$issues!.negativeInventory![0].shortfall).toBe(3);
  });

  it('no issues when inventory is sufficient', () => {
    const scout = makeScout('Jane');
    scout.inventory = { total: 10, varieties: { THIN_MINTS: 10 } };
    calculateSingle(scout);
    expect(scout.$issues?.negativeInventory).toBeUndefined();
  });
});

describe('calculateScoutTotals — order status counts', () => {
  it('counts order statuses', () => {
    const scout = makeScout('Jane');
    scout.orders = [makeOrder({ status: 'Delivered' }), makeOrder({ status: 'Delivered' }), makeOrder({ status: 'Pending' })];
    calculateSingle(scout);
    expect(scout.totals.$orderStatusCounts.completed).toBe(2);
    expect(scout.totals.$orderStatusCounts.pending).toBe(1);
    expect(scout.totals.$orderStatusCounts.needsApproval).toBe(0);
  });
});

describe('calculateScoutTotals — allocation grouping', () => {
  it('groups allocations by channel', () => {
    const scout = makeScout('Jane');
    scout.allocations = [
      makeAllocation({ channel: ALLOCATION_CHANNEL.BOOTH, packages: 5 }),
      makeAllocation({ channel: ALLOCATION_CHANNEL.DIRECT_SHIP, packages: 3 }),
      makeAllocation({ channel: ALLOCATION_CHANNEL.BOOTH, packages: 2 })
    ];
    calculateSingle(scout);
    expect(scout.$allocationsByChannel.booth.length).toBe(2);
    expect(scout.$allocationsByChannel.directShip.length).toBe(1);
    expect(scout.totals.$allocationSummary.booth.packages).toBe(7);
    expect(scout.totals.$allocationSummary.directShip.packages).toBe(3);
  });
});

describe('calculateScoutCounts', () => {
  it('counts active vs inactive scouts', () => {
    const jane = makeScout('Jane');
    jane.totals.totalSold = 10;
    const bob = makeScout('Bob');
    bob.totals.totalSold = 0;
    const counts = calculateScoutCounts({ Jane: jane, Bob: bob });
    expect(counts.total).toBe(2);
    expect(counts.active).toBe(1);
    expect(counts.inactive).toBe(1);
  });

  it('excludes site orders from counts', () => {
    const jane = makeScout('Jane');
    jane.totals.totalSold = 10;
    const site = makeScout('Site');
    site.isSiteOrder = true;
    site.totals.totalSold = 5;
    const counts = calculateScoutCounts({ Jane: jane, Site: site });
    expect(counts.total).toBe(1);
  });

  it('counts scouts with negative inventory', () => {
    const jane = makeScout('Jane');
    jane.totals.totalSold = 10;
    jane.$issues = { negativeInventory: [{ variety: 'THIN_MINTS', inventory: 2, sales: 5, shortfall: 3 }] };
    const counts = calculateScoutCounts({ Jane: jane });
    expect(counts.withNegativeInventory).toBe(1);
  });
});
