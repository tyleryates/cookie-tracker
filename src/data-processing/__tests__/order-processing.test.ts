import { describe, expect, it } from 'vitest';
import {
  DATA_SOURCES,
  DC_COLUMNS,
  DC_ORDER_TYPE_STRINGS,
  DC_PAYMENT_STATUS,
  ORDER_TYPE,
  OWNER,
  PAYMENT_METHOD,
  SPECIAL_IDENTIFIERS
} from '../../constants';
import type { Warning } from '../../types';
import { addDCOrders } from '../calculators/order-processing';
import { makeScout } from './test-utils';

function makeDCRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    [DC_COLUMNS.ORDER_NUMBER]: '1001',
    [DC_COLUMNS.GIRL_FIRST_NAME]: 'Jane',
    [DC_COLUMNS.GIRL_LAST_NAME]: 'Doe',
    [DC_COLUMNS.ORDER_DATE]: '2025-01-15',
    [DC_COLUMNS.ORDER_TYPE]: 'In-Person Delivery',
    [DC_COLUMNS.TOTAL_PACKAGES]: '5',
    [DC_COLUMNS.REFUNDED_PACKAGES]: '0',
    [DC_COLUMNS.CURRENT_SALE_AMOUNT]: '$30.00',
    [DC_COLUMNS.ORDER_STATUS]: 'Shipped',
    [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CAPTURED,
    [DC_COLUMNS.SHIP_STATUS]: '',
    [DC_COLUMNS.DONATION]: '0',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('addDCOrders', () => {
  // 1. Basic order import
  it('imports a DC order onto the matching scout with correct fields', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow();
    addDCOrders(scouts, [row]);

    const orders = scouts.get('Jane Doe')!.orders;
    expect(orders).toHaveLength(1);

    const order = orders[0];
    expect(order.orderNumber).toBe('1001');
    expect(order.date).toBe('2025-01-15');
    expect(order.amount).toBe(30);
    expect(order.owner).toBe(OWNER.GIRL);
    expect(order.orderType).toBe(ORDER_TYPE.DELIVERY);
    expect(order.paymentMethod).toBe(PAYMENT_METHOD.CREDIT_CARD);
    expect(order.status).toBe('Shipped');
    expect(order.paymentStatus).toBe(DC_PAYMENT_STATUS.CAPTURED);
    expect(order.sources).toEqual([DATA_SOURCES.DIGITAL_COOKIE]);
  });

  // 2. Order classification - Donation
  it('classifies Donation order type as DONATION', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.ORDER_TYPE]: DC_ORDER_TYPE_STRINGS.DONATION });
    addDCOrders(scouts, [row]);

    expect(scouts.get('Jane Doe')!.orders[0].orderType).toBe(ORDER_TYPE.DONATION);
  });

  // 3. Order classification - Direct Ship
  it('classifies order type containing "Shipped" as DIRECT_SHIP', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.ORDER_TYPE]: 'Girl Delivered Shipped' });
    addDCOrders(scouts, [row]);

    expect(scouts.get('Jane Doe')!.orders[0].orderType).toBe(ORDER_TYPE.DIRECT_SHIP);
  });

  // 4a. Order classification - Cookies in Hand (girl order)
  it('classifies "Cookies in Hand" for a girl order as IN_HAND', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.ORDER_TYPE]: 'Cookies in Hand' });
    addDCOrders(scouts, [row]);

    const order = scouts.get('Jane Doe')!.orders[0];
    expect(order.orderType).toBe(ORDER_TYPE.IN_HAND);
    expect(order.owner).toBe(OWNER.GIRL);
  });

  // 4b. Order classification - Cookies in Hand (site order → BOOTH)
  it('classifies "Cookies in Hand" for a site order as BOOTH', () => {
    const scouts = new Map<string, Scout>();
    const siteScoutName = `Troop3990 ${SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME}`;
    scouts.set(siteScoutName, makeScout(siteScoutName));

    const row = makeDCRow({
      [DC_COLUMNS.GIRL_FIRST_NAME]: 'Troop3990',
      [DC_COLUMNS.GIRL_LAST_NAME]: SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME,
      [DC_COLUMNS.ORDER_TYPE]: 'Cookies in Hand'
    });
    addDCOrders(scouts, [row]);

    const order = scouts.get(siteScoutName)!.orders[0];
    expect(order.orderType).toBe(ORDER_TYPE.BOOTH);
    expect(order.owner).toBe(OWNER.TROOP);
  });

  // 5. Order classification - Delivery
  it('classifies "In-Person Delivery" as DELIVERY', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.ORDER_TYPE]: 'In-Person Delivery' });
    addDCOrders(scouts, [row]);

    expect(scouts.get('Jane Doe')!.orders[0].orderType).toBe(ORDER_TYPE.DELIVERY);
  });

  it('classifies "In Person Delivery" (no hyphen) as DELIVERY', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.ORDER_TYPE]: 'In Person Delivery' });
    addDCOrders(scouts, [row]);

    expect(scouts.get('Jane Doe')!.orders[0].orderType).toBe(ORDER_TYPE.DELIVERY);
  });

  it('classifies "Pick Up" as DELIVERY', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.ORDER_TYPE]: 'Pick Up' });
    addDCOrders(scouts, [row]);

    expect(scouts.get('Jane Doe')!.orders[0].orderType).toBe(ORDER_TYPE.DELIVERY);
  });

  // 6. Order classification - Unknown type generates warning
  it('generates a warning for unknown order type', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));
    const warnings: Warning[] = [];

    const row = makeDCRow({ [DC_COLUMNS.ORDER_TYPE]: 'SomethingNew' });
    addDCOrders(scouts, [row], warnings);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('UNKNOWN_ORDER_TYPE');
    expect(warnings[0].orderType).toBe('SomethingNew');
    expect(warnings[0].orderNumber).toBe('1001');

    // Order is still added, but with null orderType
    const order = scouts.get('Jane Doe')!.orders[0];
    expect(order.orderType).toBeNull();
  });

  // 7. Payment classification - Cash
  it('classifies payment status "CASH" as CASH', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CASH });
    addDCOrders(scouts, [row]);

    expect(scouts.get('Jane Doe')!.orders[0].paymentMethod).toBe(PAYMENT_METHOD.CASH);
  });

  // 8. Payment classification - Venmo
  it('classifies payment status containing "VENMO" as VENMO', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.PAYMENT_STATUS]: 'VENMO - Captured' });
    addDCOrders(scouts, [row]);

    expect(scouts.get('Jane Doe')!.orders[0].paymentMethod).toBe(PAYMENT_METHOD.VENMO);
  });

  // 9a. Payment classification - Credit Card (CAPTURED)
  it('classifies payment status "CAPTURED" as CREDIT_CARD', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.CAPTURED });
    addDCOrders(scouts, [row]);

    expect(scouts.get('Jane Doe')!.orders[0].paymentMethod).toBe(PAYMENT_METHOD.CREDIT_CARD);
  });

  // 9b. Payment classification - Credit Card (AUTHORIZED)
  it('classifies payment status "AUTHORIZED" as CREDIT_CARD', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({ [DC_COLUMNS.PAYMENT_STATUS]: DC_PAYMENT_STATUS.AUTHORIZED });
    addDCOrders(scouts, [row]);

    expect(scouts.get('Jane Doe')!.orders[0].paymentMethod).toBe(PAYMENT_METHOD.CREDIT_CARD);
  });

  // 10. Payment classification - Unknown generates warning
  it('generates a warning for unknown payment status', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));
    const warnings: Warning[] = [];

    const row = makeDCRow({ [DC_COLUMNS.PAYMENT_STATUS]: 'BITCOIN' });
    addDCOrders(scouts, [row], warnings);

    const paymentWarnings = warnings.filter((w) => w.type === 'UNKNOWN_PAYMENT_METHOD');
    expect(paymentWarnings).toHaveLength(1);
    expect(paymentWarnings[0].paymentStatus).toBe('BITCOIN');
    expect(paymentWarnings[0].orderNumber).toBe('1001');

    // Order is still added, but with null paymentMethod
    expect(scouts.get('Jane Doe')!.orders[0].paymentMethod).toBeNull();
  });

  // 11. Site orders get owner = TROOP
  it('sets owner to TROOP for site orders (lastName = SITE_ORDER_LASTNAME)', () => {
    const scouts = new Map<string, Scout>();
    const siteScoutName = `Troop3990 ${SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME}`;
    scouts.set(siteScoutName, makeScout(siteScoutName));

    const row = makeDCRow({
      [DC_COLUMNS.GIRL_FIRST_NAME]: 'Troop3990',
      [DC_COLUMNS.GIRL_LAST_NAME]: SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME,
      [DC_COLUMNS.ORDER_TYPE]: 'In-Person Delivery'
    });
    addDCOrders(scouts, [row]);

    const order = scouts.get(siteScoutName)!.orders[0];
    expect(order.owner).toBe(OWNER.TROOP);
  });

  // 12. Skips unknown scouts
  it('skips DC rows where the scout name is not in the map', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const unknownRow = makeDCRow({
      [DC_COLUMNS.GIRL_FIRST_NAME]: 'Unknown',
      [DC_COLUMNS.GIRL_LAST_NAME]: 'Person'
    });
    addDCOrders(scouts, [unknownRow]);

    // Jane should have no orders added (the row was for someone else)
    expect(scouts.get('Jane Doe')!.orders).toHaveLength(0);
    // No scout was created for Unknown Person
    expect(scouts.has('Unknown Person')).toBe(false);
  });

  // 13. Package calculation: totalPackages - refundedPackages = packages,
  //     packages - donations = physicalPackages
  it('calculates packages and physicalPackages correctly from totals, refunds, and donations', () => {
    const scouts = new Map<string, Scout>();
    scouts.set('Jane Doe', makeScout('Jane Doe'));

    const row = makeDCRow({
      [DC_COLUMNS.TOTAL_PACKAGES]: '10',
      [DC_COLUMNS.REFUNDED_PACKAGES]: '2',
      [DC_COLUMNS.DONATION]: '3'
    });
    addDCOrders(scouts, [row]);

    const order = scouts.get('Jane Doe')!.orders[0];
    // packages = 10 - 2 = 8
    expect(order.packages).toBe(8);
    // donations = 3
    expect(order.donations).toBe(3);
    // physicalPackages = 8 - 3 = 5
    expect(order.physicalPackages).toBe(5);
  });
});
