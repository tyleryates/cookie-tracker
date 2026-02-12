import { describe, expect, it } from 'vitest';
import { ALLOCATION_CHANNEL, ORDER_TYPE, OWNER } from '../../constants';
import type { Allocation, Order, Scout } from '../../types';
import {
  buildGirlIdToNameMap,
  calculateSalesByVariety,
  channelTotals,
  findScoutByGirlId,
  needsInventory,
  totalCredited
} from '../calculators/helpers';
import { makeScout } from './test-utils';

describe('needsInventory', () => {
  it('returns true for GIRL + DELIVERY', () => {
    expect(needsInventory({ owner: OWNER.GIRL, orderType: ORDER_TYPE.DELIVERY })).toBe(true);
  });

  it('returns true for GIRL + IN_HAND', () => {
    expect(needsInventory({ owner: OWNER.GIRL, orderType: ORDER_TYPE.IN_HAND })).toBe(true);
  });

  it('returns false for GIRL + DIRECT_SHIP (no physical inventory)', () => {
    expect(needsInventory({ owner: OWNER.GIRL, orderType: ORDER_TYPE.DIRECT_SHIP })).toBe(false);
  });

  it('returns false for GIRL + DONATION', () => {
    expect(needsInventory({ owner: OWNER.GIRL, orderType: ORDER_TYPE.DONATION })).toBe(false);
  });

  it('returns false for GIRL + BOOTH', () => {
    expect(needsInventory({ owner: OWNER.GIRL, orderType: ORDER_TYPE.BOOTH })).toBe(false);
  });

  it('returns false for TROOP orders regardless of type', () => {
    expect(needsInventory({ owner: OWNER.TROOP, orderType: ORDER_TYPE.DELIVERY })).toBe(false);
    expect(needsInventory({ owner: OWNER.TROOP, orderType: ORDER_TYPE.IN_HAND })).toBe(false);
    expect(needsInventory({ owner: OWNER.TROOP, orderType: ORDER_TYPE.BOOTH })).toBe(false);
  });
});

describe('totalCredited', () => {
  it('sums packages + donations across allocations', () => {
    const allocations: Allocation[] = [
      { channel: ALLOCATION_CHANNEL.BOOTH, girlId: 1, packages: 5, donations: 2, varieties: {} },
      { channel: ALLOCATION_CHANNEL.DIRECT_SHIP, girlId: 1, packages: 3, donations: 1, varieties: {} }
    ];
    expect(totalCredited(allocations)).toBe(11);
  });

  it('returns 0 for empty allocations', () => {
    expect(totalCredited([])).toBe(0);
  });
});

describe('channelTotals', () => {
  const boothAllocations: Allocation[] = [
    { channel: ALLOCATION_CHANNEL.BOOTH, girlId: 1, packages: 5, donations: 2, varieties: { THIN_MINTS: 3 } },
    { channel: ALLOCATION_CHANNEL.BOOTH, girlId: 2, packages: 3, donations: 0, varieties: { THIN_MINTS: 1, TREFOILS: 2 } }
  ];

  it('sums all allocations passed', () => {
    const result = channelTotals(boothAllocations);
    expect(result.packages).toBe(8);
    expect(result.donations).toBe(2);
  });

  it('merges varieties across allocations', () => {
    const result = channelTotals(boothAllocations);
    expect(result.varieties.THIN_MINTS).toBe(4);
    expect(result.varieties.TREFOILS).toBe(2);
  });

  it('returns zeros for empty array', () => {
    const result = channelTotals([]);
    expect(result.packages).toBe(0);
    expect(result.donations).toBe(0);
  });
});

describe('buildGirlIdToNameMap', () => {
  it('maps girlId to scout name', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe', 123));
    scouts.set('Bob Smith', makeScout('Bob Smith', 456));

    const map = buildGirlIdToNameMap(scouts);
    expect(map.get(123)).toBe('Jane Doe');
    expect(map.get(456)).toBe('Bob Smith');
  });

  it('skips scouts without girlId', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('No ID', makeScout('No ID'));

    const map = buildGirlIdToNameMap(scouts);
    expect(map.size).toBe(0);
  });
});

describe('findScoutByGirlId', () => {
  it('finds scout by girl ID', () => {
    const scouts = new Map<string, Scout>();
    const jane = makeScout('Jane Doe', 123);
    scouts.set('Jane Doe', jane);

    const girlIdToName = new Map([[123, 'Jane Doe']]);
    expect(findScoutByGirlId(123, scouts, girlIdToName)).toBe(jane);
  });

  it('returns null for unknown ID', () => {
    const scouts = new Map<string, Scout>();
    const girlIdToName = new Map<number, string>();
    expect(findScoutByGirlId(999, scouts, girlIdToName)).toBeNull();
  });
});

describe('calculateSalesByVariety', () => {
  it('sums varieties from inventory orders only', () => {
    const scout = makeScout('Test');
    scout.orders = [
      { ...makeOrder(), owner: OWNER.GIRL, orderType: ORDER_TYPE.DELIVERY, varieties: { THIN_MINTS: 3, TREFOILS: 2 } },
      { ...makeOrder(), owner: OWNER.GIRL, orderType: ORDER_TYPE.DIRECT_SHIP, varieties: { THIN_MINTS: 10 } }, // excluded
      { ...makeOrder(), owner: OWNER.GIRL, orderType: ORDER_TYPE.IN_HAND, varieties: { THIN_MINTS: 1 } }
    ];

    const sales = calculateSalesByVariety(scout);
    expect(sales.THIN_MINTS).toBe(4); // 3 + 1 (not 10 from direct ship)
    expect(sales.TREFOILS).toBe(2);
  });

  it('excludes Cookie Share from sales', () => {
    const scout = makeScout('Test');
    scout.orders = [{ ...makeOrder(), owner: OWNER.GIRL, orderType: ORDER_TYPE.DELIVERY, varieties: { THIN_MINTS: 2, COOKIE_SHARE: 5 } }];

    const sales = calculateSalesByVariety(scout);
    expect(sales.THIN_MINTS).toBe(2);
    expect(sales.COOKIE_SHARE).toBeUndefined();
  });
});

// --- Test Helpers ---

function makeOrder(): Order {
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
    metadata: { dc: null, sc: null, scReport: null, scApi: null }
  };
}
