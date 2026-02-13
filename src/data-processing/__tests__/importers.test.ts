import { describe, expect, it } from 'vitest';
import { DATA_SOURCES, SPECIAL_IDENTIFIERS, TRANSFER_TYPE } from '../../constants';
import { createDataStore } from '../../data-store';
import { importDigitalCookie } from '../importers/digital-cookie';
import { importSmartCookie, importSmartCookieOrders, importSmartCookieReport } from '../importers/smart-cookie';

// ============================================================================
// importDigitalCookie
// ============================================================================

describe('importDigitalCookie', () => {
  it('creates an order from a DC row', () => {
    const store = createDataStore();
    importDigitalCookie(store, [
      {
        'Order Number': '1001',
        'Girl First Name': 'Jane',
        'Girl Last Name': 'Doe',
        'Order Date (Central Time)': null,
        'Order Type': 'Girl Delivery',
        'Total Packages (Includes Donate & Gift)': '5',
        'Refunded Packages': '0',
        'Current Sale Amount': '30.00',
        'Order Status': 'Delivered',
        'Payment Status': 'Paid'
      }
    ]);

    expect(store.orders.size).toBe(1);
    const order = store.orders.get('1001')!;
    expect(order.scout).toBe('Jane Doe');
    expect(order.packages).toBe(5);
    expect(order.amount).toBe(30);
    expect(order.status).toBe('Delivered');
    expect(order.sources).toContain(DATA_SOURCES.DIGITAL_COOKIE);
  });

  it('subtracts refunded packages from total', () => {
    const store = createDataStore();
    importDigitalCookie(store, [
      {
        'Order Number': '1001',
        'Girl First Name': 'Jane',
        'Girl Last Name': 'Doe',
        'Total Packages (Includes Donate & Gift)': '10',
        'Refunded Packages': '3',
        'Current Sale Amount': '42.00',
        'Order Status': 'Delivered',
        'Payment Status': 'Paid'
      }
    ]);

    expect(store.orders.get('1001')!.packages).toBe(7);
  });

  it('registers the scout', () => {
    const store = createDataStore();
    importDigitalCookie(store, [
      {
        'Order Number': '1001',
        'Girl First Name': 'Jane',
        'Girl Last Name': 'Doe',
        'Total Packages (Includes Donate & Gift)': '5',
        'Refunded Packages': '0',
        'Current Sale Amount': '30.00',
        'Order Status': 'Delivered',
        'Payment Status': 'Paid'
      }
    ]);

    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('records import metadata', () => {
    const store = createDataStore();
    importDigitalCookie(store, [
      {
        'Order Number': '1001',
        'Girl First Name': 'A',
        'Girl Last Name': 'B',
        'Total Packages (Includes Donate & Gift)': '1',
        'Refunded Packages': '0',
        'Current Sale Amount': '6.00',
        'Order Status': 'Delivered',
        'Payment Status': 'Paid'
      }
    ]);

    expect(store.metadata.lastImportDC).toBeTruthy();
    expect(store.metadata.sources.length).toBe(1);
    expect(store.metadata.sources[0].type).toBe(DATA_SOURCES.DIGITAL_COOKIE);
    expect(store.metadata.sources[0].records).toBe(1);
  });

  it('stores rawDCData on metadata', () => {
    const store = createDataStore();
    const rows = [
      {
        'Order Number': '1001',
        'Girl First Name': 'A',
        'Girl Last Name': 'B',
        'Total Packages (Includes Donate & Gift)': '1',
        'Refunded Packages': '0',
        'Current Sale Amount': '6.00',
        'Order Status': 'Delivered',
        'Payment Status': 'Paid'
      }
    ];
    importDigitalCookie(store, rows);
    expect(store.metadata.rawDCData).toBe(rows);
  });

  it('merges when same order number appears twice', () => {
    const store = createDataStore();
    const row = {
      'Order Number': '1001',
      'Girl First Name': 'Jane',
      'Girl Last Name': 'Doe',
      'Total Packages (Includes Donate & Gift)': '5',
      'Refunded Packages': '0',
      'Current Sale Amount': '30.00',
      'Order Status': 'Delivered',
      'Payment Status': 'Paid'
    };
    importDigitalCookie(store, [row, { ...row, 'Order Status': 'Shipped' }]);

    // Should still be 1 order — second row merges into first
    expect(store.orders.size).toBe(1);
  });
});

// ============================================================================
// importSmartCookieOrders (API format)
// ============================================================================

describe('importSmartCookieOrders', () => {
  it('creates transfers from SC API orders', () => {
    const store = createDataStore();
    store.troopNumber = '3990';
    importSmartCookieOrders(store, {
      orders: [
        {
          transfer_type: TRANSFER_TYPE.C2T,
          order_number: '100',
          to: 'Troop 3990',
          from: 'Council',
          date: '2025-01-15',
          cookies: [{ id: 1, quantity: 10 }],
          total_cases: 0,
          status: 'Approved'
        }
      ]
    });

    expect(store.transfers.length).toBe(1);
    expect(store.transfers[0].type).toBe(TRANSFER_TYPE.C2T);
    expect(store.transfers[0].orderNumber).toBe('100');
  });

  it('warns on unknown cookie IDs', () => {
    const store = createDataStore();
    importSmartCookieOrders(store, {
      orders: [
        {
          transfer_type: TRANSFER_TYPE.C2T,
          order_number: '100',
          to: 'Troop 3990',
          from: 'Council',
          cookies: [{ id: 99999, quantity: 5 }]
        }
      ]
    });

    expect(store.metadata.warnings.length).toBeGreaterThan(0);
    expect(store.metadata.warnings[0].type).toBe('UNKNOWN_COOKIE_ID');
  });

  it('merges D-prefixed orders as DC orders', () => {
    const store = createDataStore();
    importSmartCookieOrders(store, {
      orders: [
        {
          transfer_type: TRANSFER_TYPE.D,
          order_number: `${SPECIAL_IDENTIFIERS.DC_ORDER_PREFIX}1001`,
          to: 'Jane Doe',
          from: 'Troop 3990',
          cookies: [],
          total: '30'
        }
      ]
    });

    // D-prefixed order should create a DC order with the D stripped
    expect(store.orders.has('1001')).toBe(true);
  });

  it('records import metadata', () => {
    const store = createDataStore();
    importSmartCookieOrders(store, {
      orders: [
        {
          transfer_type: TRANSFER_TYPE.T2G,
          order_number: '200',
          to: 'Jane',
          from: 'Troop 3990',
          cookies: []
        }
      ]
    });

    expect(store.metadata.lastImportSC).toBeTruthy();
    expect(store.metadata.sources[0].type).toBe(DATA_SOURCES.SMART_COOKIE_API);
  });

  it('tracks scouts from T2G transfers', () => {
    const store = createDataStore();
    importSmartCookieOrders(store, {
      orders: [
        {
          transfer_type: TRANSFER_TYPE.T2G,
          order_number: '200',
          to: 'Jane Doe',
          from: 'Troop 3990',
          cookies: []
        }
      ]
    });

    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('handles empty orders array', () => {
    const store = createDataStore();
    importSmartCookieOrders(store, { orders: [] });
    expect(store.transfers.length).toBe(0);
  });

  it('handles missing orders field', () => {
    const store = createDataStore();
    importSmartCookieOrders(store, {} as any);
    expect(store.transfers.length).toBe(0);
  });

  it('passes troopName for transfer classification', () => {
    const store = createDataStore();
    store.troopName = 'Troop 3990';
    importSmartCookieOrders(store, {
      orders: [
        {
          transfer_type: TRANSFER_TYPE.T2T,
          order_number: '300',
          to: 'Troop 1234',
          from: 'Troop 3990',
          cookies: [{ id: 1, quantity: 5 }]
        }
      ]
    });

    // The transfer should be classified as TROOP_OUTGOING via troopName matching
    expect(store.transfers[0].type).toBe(TRANSFER_TYPE.T2T);
  });
});

// ============================================================================
// importSmartCookie (old flat format)
// ============================================================================

describe('importSmartCookie', () => {
  it('creates transfers from flat SC data', () => {
    const store = createDataStore();
    importSmartCookie(store, [
      {
        TYPE: TRANSFER_TYPE.C2T,
        'ORDER #': '100',
        TO: 'Troop 3990',
        FROM: 'Council',
        DATE: '2025-01-15',
        TOTAL: '10',
        'TOTAL $': '60.00'
      }
    ]);

    expect(store.transfers.length).toBe(1);
    expect(store.transfers[0].type).toBe(TRANSFER_TYPE.C2T);
    expect(store.transfers[0].packages).toBe(10);
    expect(store.transfers[0].amount).toBe(60);
  });

  it('extracts troop number from C2T transfers', () => {
    const store = createDataStore();
    importSmartCookie(store, [
      {
        TYPE: TRANSFER_TYPE.C2T,
        'ORDER #': '100',
        TO: 'Troop 3990',
        FROM: 'Council',
        DATE: '2025-01-15',
        TOTAL: '10',
        'TOTAL $': '60.00'
      }
    ]);

    expect(store.troopNumber).toBe('Troop 3990');
  });

  it('registers scouts from T2G pickups', () => {
    const store = createDataStore();
    store.troopNumber = 'Troop 3990';
    importSmartCookie(store, [
      {
        TYPE: TRANSFER_TYPE.T2G,
        'ORDER #': '200',
        TO: 'Jane Doe',
        FROM: 'Troop 3990',
        DATE: '2025-01-20',
        TOTAL: '5',
        'TOTAL $': '30.00'
      }
    ]);

    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('registers scouts from G2T returns', () => {
    const store = createDataStore();
    store.troopNumber = 'Troop 3990';
    importSmartCookie(store, [
      {
        TYPE: TRANSFER_TYPE.G2T,
        'ORDER #': '300',
        TO: 'Troop 3990',
        FROM: 'Jane Doe',
        DATE: '2025-01-25',
        TOTAL: '2',
        'TOTAL $': '12.00'
      }
    ]);

    expect(store.scouts.has('Jane Doe')).toBe(true);
  });

  it('merges D-prefixed COOKIE_SHARE as DC order', () => {
    const store = createDataStore();
    importSmartCookie(store, [
      {
        TYPE: TRANSFER_TYPE.COOKIE_SHARE,
        'ORDER #': `${SPECIAL_IDENTIFIERS.DC_ORDER_PREFIX}1001`,
        TO: 'Jane Doe',
        FROM: 'Troop 3990',
        DATE: '2025-01-20',
        TOTAL: '3',
        'TOTAL $': '18.00'
      }
    ]);

    expect(store.orders.has('1001')).toBe(true);
  });

  it('records import metadata', () => {
    const store = createDataStore();
    importSmartCookie(store, [
      {
        TYPE: TRANSFER_TYPE.C2T,
        'ORDER #': '100',
        TO: 'Troop 3990',
        FROM: 'Council',
        DATE: '2025-01-15',
        TOTAL: '10',
        'TOTAL $': '60.00'
      }
    ]);

    expect(store.metadata.lastImportSC).toBeTruthy();
    expect(store.metadata.sources[0].type).toBe(DATA_SOURCES.SMART_COOKIE);
  });

  it('registers scouts from Cookie Share transfers', () => {
    const store = createDataStore();
    store.troopNumber = 'Troop 3990';
    importSmartCookie(store, [
      {
        TYPE: TRANSFER_TYPE.COOKIE_SHARE,
        'ORDER #': '400',
        TO: 'Jane Doe',
        FROM: 'Troop 3990',
        DATE: '2025-01-20',
        TOTAL: '3',
        'TOTAL $': '18.00'
      }
    ]);

    expect(store.scouts.has('Jane Doe')).toBe(true);
  });
});

// ============================================================================
// importSmartCookieReport (Excel/CSV format)
// ============================================================================

describe('importSmartCookieReport', () => {
  it('creates an order from a report row', () => {
    const store = createDataStore();
    importSmartCookieReport(store, [
      {
        OrderID: '500',
        RefNumber: '',
        GirlName: 'Jane Doe',
        GirlID: '42',
        GSUSAID: 'GS-001',
        GradeLevel: '3rd',
        OrderDate: '2025-01-15',
        Total: '0/10',
        TroopID: 'T3990',
        ServiceUnitDesc: 'SU-100',
        CouncilDesc: 'Council ABC'
      }
    ]);

    expect(store.orders.size).toBe(1);
    const order = store.orders.get('500')!;
    expect(order.scout).toBe('Jane Doe');
    expect(order.packages).toBe(10);
    expect(order.scoutId).toBe('42');
    expect(order.gsusaId).toBe('GS-001');
    expect(order.sources).toContain(DATA_SOURCES.SMART_COOKIE_REPORT);
  });

  it('registers scout with metadata', () => {
    const store = createDataStore();
    importSmartCookieReport(store, [
      {
        OrderID: '500',
        GirlName: 'Jane Doe',
        GirlID: '42',
        GSUSAID: 'GS-001',
        GradeLevel: '3rd',
        OrderDate: '2025-01-15',
        Total: '0/5',
        ServiceUnitDesc: 'SU-100'
      }
    ]);

    const scout = store.scouts.get('Jane Doe');
    expect(scout).toBeDefined();
    expect(scout!.scoutId).toBe('42');
    expect(scout!.gsusaId).toBe('GS-001');
    expect(scout!.gradeLevel).toBe('3rd');
    expect(scout!.serviceUnit).toBe('SU-100');
  });

  it('parses Total field as cases/packages', () => {
    const store = createDataStore();
    importSmartCookieReport(store, [
      {
        OrderID: '500',
        GirlName: 'Jane Doe',
        GirlID: '42',
        OrderDate: '2025-01-15',
        Total: '1/2' // 1 case (12 packages) + 2 = 14
      }
    ]);

    expect(store.orders.get('500')!.packages).toBe(14);
  });

  it('falls back to RefNumber when OrderID missing', () => {
    const store = createDataStore();
    importSmartCookieReport(store, [
      {
        OrderID: '',
        RefNumber: 'REF-999',
        GirlName: 'Jane Doe',
        Total: '0/5'
      }
    ]);

    expect(store.orders.has('REF-999')).toBe(true);
  });

  it('records import metadata', () => {
    const store = createDataStore();
    importSmartCookieReport(store, [
      {
        OrderID: '500',
        GirlName: 'Jane',
        Total: '0/1'
      }
    ]);

    expect(store.metadata.sources[0].type).toBe(DATA_SOURCES.SMART_COOKIE_REPORT);
    expect(store.metadata.sources[0].records).toBe(1);
  });
});
