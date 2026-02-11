import { describe, expect, it } from 'vitest';
import { DC_COLUMNS, ORDER_TYPE, OWNER, TRANSFER_TYPE } from '../../constants';
import { createDataStore } from '../../data-store';
import { createTransfer } from '../../data-store-operations';
import type { Allocation } from '../../types';
import { buildUnifiedDataset } from '../calculators/index';

// =============================================================================
// Test Fixture: A small troop with 2 real scouts + 1 site order "scout"
//
// Jane Doe (girlId 101):
//   - 3 DC orders: delivery (5 pkgs), in-hand (2 pkgs, cash), donation (1 pkg)
//   - Picked up 15 pkgs from troop, returned 2 Trefoils
//   - Has 1 booth sales allocation (4 pkgs + 1 donation)
//
// Bob Smith (girlId 102):
//   - 2 DC orders: direct-ship (3 pkgs), delivery (4 pkgs)
//   - Picked up 10 pkgs from troop
//   - Has 1 virtual booth allocation (5 pkgs via T2G)
//   - Has 1 direct ship allocation (3 pkgs)
//
// Troop3990 Site (site orders):
//   - 2 DC orders: booth sale (10 pkgs), direct-ship (6 pkgs)
//
// Transfers:
//   - C2T: 50 physical packages from council
//   - T2G pickups: 15 to Jane, 10 to Bob
//   - T2G virtual booth: 5 to Bob
//   - G2T return: 2 from Jane
// =============================================================================

function buildTestStore() {
  const store = createDataStore();

  // --- SC Scout data ---
  store.scouts.set('Jane Doe', {
    name: 'Jane Doe',
    scoutId: 101,
    gsusaId: null,
    gradeLevel: null,
    serviceUnit: null,
    troopId: '3990',
    council: null,
    district: null
  });
  store.scouts.set('Bob Smith', {
    name: 'Bob Smith',
    scoutId: 102,
    gsusaId: null,
    gradeLevel: null,
    serviceUnit: null,
    troopId: '3990',
    council: null,
    district: null
  });

  // --- DC Raw Data (rawDCData) ---
  store.metadata.rawDCData = [
    // Jane: delivery order — 5 pkgs (3 Thin Mints, 2 Trefoils), $30, credit card
    makeDCRow('Jane', 'Doe', 'ORD-001', 'In-Person Delivery', 5, 0, '$30.00', 'CAPTURED', { 'Thin Mints': 3, Trefoils: 2 }),
    // Jane: in-hand order — 2 pkgs (2 Thin Mints), $12, cash
    makeDCRow('Jane', 'Doe', 'ORD-002', 'Cookies In Hand', 2, 0, '$12.00', 'CASH', { 'Thin Mints': 2 }),
    // Jane: donation — 1 Cookie Share, $6, credit card
    makeDCRow('Jane', 'Doe', 'ORD-003', 'Donation', 1, 0, '$6.00', 'CAPTURED', {}, 1),
    // Bob: direct-ship — 3 pkgs (3 Caramel deLites), $18, credit card
    makeDCRow('Bob', 'Smith', 'ORD-004', 'Shipped to Customer', 3, 0, '$18.00', 'CAPTURED', { 'Caramel deLites': 3 }),
    // Bob: delivery — 4 pkgs (2 Thin Mints, 2 Lemonades), $24, credit card
    makeDCRow('Bob', 'Smith', 'ORD-005', 'In-Person Delivery', 4, 0, '$24.00', 'CAPTURED', { 'Thin Mints': 2, Lemonades: 2 }),
    // Site: booth sale — 10 pkgs (5 Thin Mints, 5 Trefoils), $60
    makeDCRow('Troop3990', 'Site', 'ORD-006', 'Cookies In Hand', 10, 0, '$60.00', 'CAPTURED', { 'Thin Mints': 5, Trefoils: 5 }),
    // Site: direct ship — 6 pkgs (3 Thin Mints, 3 Caramel deLites), $39
    makeDCRow('Troop3990', 'Site', 'ORD-007', 'Shipped to Customer', 6, 0, '$39.00', 'CAPTURED', { 'Thin Mints': 3, 'Caramel deLites': 3 })
  ];

  // --- SC Transfers ---
  store.transfers = [
    // C2T: 50 physical packages from council
    createTransfer({
      type: TRANSFER_TYPE.C2T,
      from: 'Council',
      to: 'Troop 3990',
      date: '2025-02-01',
      packages: 50,
      varieties: { THIN_MINTS: 20, TREFOILS: 15, LEMONADES: 10, CARAMEL_DELITES: 5 }
    }),
    // T2G pickup: 15 pkgs to Jane
    createTransfer({
      type: TRANSFER_TYPE.T2G,
      from: 'Troop 3990',
      to: 'Jane Doe',
      date: '2025-02-05',
      packages: 15,
      varieties: { THIN_MINTS: 8, TREFOILS: 7 }
    }),
    // T2G pickup: 10 pkgs to Bob
    createTransfer({
      type: TRANSFER_TYPE.T2G,
      from: 'Troop 3990',
      to: 'Bob Smith',
      date: '2025-02-05',
      packages: 10,
      varieties: { THIN_MINTS: 5, LEMONADES: 3, CARAMEL_DELITES: 2 }
    }),
    // T2G virtual booth: 5 pkgs allocated to Bob (from site order)
    createTransfer({
      type: TRANSFER_TYPE.T2G,
      virtualBooth: true,
      from: 'Troop3990 Site',
      to: 'Bob Smith',
      date: '2025-02-10',
      packages: 5,
      varieties: { THIN_MINTS: 3, TREFOILS: 2 }
    }),
    // G2T return: Jane returns 2 Trefoils
    createTransfer({
      type: TRANSFER_TYPE.G2T,
      from: 'Jane Doe',
      to: 'Troop 3990',
      date: '2025-02-08',
      packages: 2,
      varieties: { TREFOILS: 2 }
    })
  ];

  // --- Imported Allocations (from SC divider APIs) ---
  const boothAllocation: Allocation = {
    channel: 'booth',
    girlId: 101,
    packages: 4,
    donations: 1,
    varieties: { THIN_MINTS: 2, TREFOILS: 2 },
    source: 'SmartBoothDivider'
  };
  const directShipAllocation: Allocation = {
    channel: 'directShip',
    girlId: 102,
    packages: 3,
    donations: 0,
    varieties: { THIN_MINTS: 1, CARAMEL_DELITES: 2 },
    source: 'DirectShipDivider'
  };
  store.allocations = [boothAllocation, directShipAllocation];

  return store;
}

// =============================================================================
// Tests
// =============================================================================

describe('buildUnifiedDataset — integration', () => {
  const store = buildTestStore();
  const result = buildUnifiedDataset(store);

  // -------------------------------------------------------------------------
  // Scout-level: Jane Doe
  // -------------------------------------------------------------------------
  describe('Jane Doe', () => {
    const jane = result.scouts.get('Jane Doe')!;

    it('exists with correct identity', () => {
      expect(jane).toBeDefined();
      expect(jane.girlId).toBe(101);
      expect(jane.isSiteOrder).toBe(false);
    });

    it('has 3 classified orders', () => {
      expect(jane.orders).toHaveLength(3);
      expect(jane.orders[0].orderType).toBe(ORDER_TYPE.DELIVERY);
      expect(jane.orders[1].orderType).toBe(ORDER_TYPE.IN_HAND);
      expect(jane.orders[2].orderType).toBe(ORDER_TYPE.DONATION);
    });

    it('calculates order totals', () => {
      expect(jane.totals.orders).toBe(3);
      // DELIVERY(5) + IN_HAND(2) = 7
      expect(jane.totals.delivered).toBe(7);
      expect(jane.totals.shipped).toBe(0);
      // 1 Cookie Share donation
      expect(jane.totals.donations).toBe(1);
    });

    it('calculates credited from booth allocation', () => {
      // booth: 4 pkgs + 1 donation = 5
      expect(jane.totals.credited).toBe(5);
    });

    it('calculates total sold', () => {
      // delivered(7) + shipped(0) + donations(1) + credited(5) = 13
      expect(jane.totals.totalSold).toBe(13);
    });

    it('tracks inventory from T2G pickup minus G2T return', () => {
      // Picked up 15 (8 TM, 7 TRE), returned 2 TRE
      // Sales from inventory: DELIVERY(3 TM, 2 TRE) + IN_HAND(2 TM) = 5 TM, 2 TRE
      // Net: TM(8-5)=3, TRE(7-2-2)=3
      expect(jane.totals.inventory).toBe(6);
      expect(jane.totals.$inventoryDisplay.THIN_MINTS).toBe(3);
      expect(jane.totals.$inventoryDisplay.TREFOILS).toBe(3);
    });

    it('calculates financials', () => {
      // inventoryValue = revenue(8 TM, 5 TRE) = 48 + 30 = $78
      expect(jane.totals.$financials.inventoryValue).toBe(78);
      // Cash collected: in-hand order paid with CASH, amount=$12
      expect(jane.totals.$financials.cashCollected).toBe(12);
      // Electronic: delivery order (credit card), physicalRevenue = 3*6 + 2*6 = $30
      expect(jane.totals.$financials.electronicPayments).toBe(30);
      // Unsold = inventoryValue(78) - electronic(30) - cashPhysical(12) = 36
      expect(jane.totals.$financials.unsoldValue).toBe(36);
      // Cash owed = cashCollected(12) + unsold(36) = 48
      expect(jane.totals.$financials.cashOwed).toBe(48);
    });

    it('has no negative inventory issues', () => {
      expect(jane.$issues?.negativeInventory).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Scout-level: Bob Smith
  // -------------------------------------------------------------------------
  describe('Bob Smith', () => {
    const bob = result.scouts.get('Bob Smith')!;

    it('exists with correct identity', () => {
      expect(bob).toBeDefined();
      expect(bob.girlId).toBe(102);
      expect(bob.isSiteOrder).toBe(false);
    });

    it('has 2 classified orders', () => {
      expect(bob.orders).toHaveLength(2);
      expect(bob.orders[0].orderType).toBe(ORDER_TYPE.DIRECT_SHIP);
      expect(bob.orders[1].orderType).toBe(ORDER_TYPE.DELIVERY);
    });

    it('calculates order totals', () => {
      expect(bob.totals.orders).toBe(2);
      expect(bob.totals.delivered).toBe(4);
      expect(bob.totals.shipped).toBe(3);
      expect(bob.totals.donations).toBe(0);
    });

    it('calculates credited from virtual booth + direct ship allocations', () => {
      // virtualBooth(5 pkgs + 0 donations) + directShip(3 pkgs + 0 donations) = 8
      expect(bob.totals.credited).toBe(8);
    });

    it('calculates total sold', () => {
      // delivered(4) + shipped(3) + donations(0) + credited(8) = 15
      expect(bob.totals.totalSold).toBe(15);
    });

    it('tracks inventory from T2G pickup', () => {
      // Picked up 10 (5 TM, 3 LEM, 2 CD)
      // Sales from inventory (delivery only): 2 TM, 2 LEM
      // Net: TM(5-2)=3, LEM(3-2)=1, CD(2-0)=2
      expect(bob.totals.inventory).toBe(6);
      expect(bob.totals.$inventoryDisplay.THIN_MINTS).toBe(3);
      expect(bob.totals.$inventoryDisplay.LEMONADES).toBe(1);
      expect(bob.totals.$inventoryDisplay.CARAMEL_DELITES).toBe(2);
    });

    it('calculates financials', () => {
      // inventoryValue = revenue(5 TM, 3 LEM, 2 CD) = 30 + 18 + 12 = $60
      expect(bob.totals.$financials.inventoryValue).toBe(60);
      // All electronic (credit card)
      expect(bob.totals.$financials.cashCollected).toBe(0);
      // Electronic: delivery order physicalRevenue = 2*6 + 2*6 = $24
      expect(bob.totals.$financials.electronicPayments).toBe(24);
      // Unsold = 60 - 24 = 36
      expect(bob.totals.$financials.unsoldValue).toBe(36);
      // Cash owed = 0 + 36 = 36
      expect(bob.totals.$financials.cashOwed).toBe(36);
    });
  });

  // -------------------------------------------------------------------------
  // Scout-level: Site orders
  // -------------------------------------------------------------------------
  describe('Site orders scout', () => {
    const site = result.scouts.get('Troop3990 Site')!;

    it('exists and is flagged as site order', () => {
      expect(site).toBeDefined();
      expect(site.isSiteOrder).toBe(true);
    });

    it('has 2 orders classified as TROOP-owned', () => {
      expect(site.orders).toHaveLength(2);
      expect(site.orders[0].owner).toBe(OWNER.TROOP);
      expect(site.orders[0].orderType).toBe(ORDER_TYPE.BOOTH);
      expect(site.orders[1].owner).toBe(OWNER.TROOP);
      expect(site.orders[1].orderType).toBe(ORDER_TYPE.DIRECT_SHIP);
    });
  });

  // -------------------------------------------------------------------------
  // Troop Totals
  // -------------------------------------------------------------------------
  describe('troopTotals', () => {
    it('calculates troop inventory from transfers', () => {
      // ordered(50) - allocated(25) - virtualBoothT2G(5) - boothDividerT2G(0) + g2t(2) = 22
      expect(result.troopTotals.inventory).toBe(22);
    });

    it('tracks package flow', () => {
      expect(result.troopTotals.c2tReceived).toBe(50);
      // Girl delivery = Jane delivered(7) + Bob delivered(4) + Bob VB alloc(5) = 16
      expect(result.troopTotals.girlDelivery).toBe(16);
      // Girl inventory on hand = Jane(6) + Bob(6) = 12
      expect(result.troopTotals.girlInventory).toBe(12);
      expect(result.troopTotals.virtualBoothT2G).toBe(5);
      expect(result.troopTotals.boothDividerT2G).toBe(0);
      expect(result.troopTotals.boothSalesPackages).toBe(4);
      expect(result.troopTotals.boothSalesDonations).toBe(1);
    });

    it('counts donations from DC + credited allocations', () => {
      // DC non-site donations = 1 (Jane's donation)
      // Credited donations = 1 (Jane's booth allocation donation)
      expect(result.troopTotals.donations).toBe(2);
    });

    it('counts scouts correctly', () => {
      expect(result.troopTotals.scouts.total).toBe(2);
      expect(result.troopTotals.scouts.active).toBe(2);
      expect(result.troopTotals.scouts.inactive).toBe(0);
      expect(result.troopTotals.scouts.withNegativeInventory).toBe(0);
    });

    it('calculates proceeds', () => {
      // packagesCredited = ordered(50) + donations(2) + directShip(9) = 61
      expect(result.troopTotals.packagesCredited).toBe(61);
      // PGA = round(61 / 2 active) = 31 → rate = 0.85
      expect(result.troopTotals.proceedsRate).toBe(0.85);
      // grossProceeds = 61 * 0.85 = 51.85
      expect(result.troopTotals.grossProceeds).toBeCloseTo(51.85);
    });
  });

  // -------------------------------------------------------------------------
  // Transfer Breakdowns
  // -------------------------------------------------------------------------
  describe('transferBreakdowns', () => {
    it('classifies C2T transfers', () => {
      expect(result.transferBreakdowns.c2t).toHaveLength(1);
      expect(result.transferBreakdowns.totals.c2t).toBe(50);
    });

    it('classifies T2G (girl pickup only)', () => {
      // Only GIRL_PICKUP transfers, not virtual booth
      expect(result.transferBreakdowns.t2g).toHaveLength(2);
      expect(result.transferBreakdowns.totals.t2gPhysical).toBe(25);
    });

    it('classifies G2T returns', () => {
      expect(result.transferBreakdowns.g2t).toHaveLength(1);
      expect(result.transferBreakdowns.totals.g2t).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Varieties
  // -------------------------------------------------------------------------
  describe('varieties', () => {
    it('aggregates sales by cookie across all scouts', () => {
      // TM: Jane orders(3+2) + Bob orders(2) + site DS(3) + Jane booth(2) + Bob VB(3) + Bob DS alloc(1) = 16
      expect(result.varieties.byCookie.THIN_MINTS).toBe(16);
      // TRE: Jane orders(2) + Jane booth(2) + Bob VB(2) = 6
      expect(result.varieties.byCookie.TREFOILS).toBe(6);
      // CD: Bob orders(3) + site DS(3) + Bob DS alloc(2) = 8
      expect(result.varieties.byCookie.CARAMEL_DELITES).toBe(8);
      // LEM: Bob orders(2)
      expect(result.varieties.byCookie.LEMONADES).toBe(2);
    });

    it('calculates total packages sold', () => {
      // 16 + 6 + 8 + 2 = 32
      expect(result.varieties.total).toBe(32);
    });

    it('calculates net troop inventory by variety from transfers', () => {
      // C2T(+) minus T2G pickup(-) minus VB(-) plus G2T(+)
      // TM: 20 - 8 - 5 - 3 = 4
      expect(result.varieties.inventory.THIN_MINTS).toBe(4);
      // TRE: 15 - 7 - 2 + 2 = 8
      expect(result.varieties.inventory.TREFOILS).toBe(8);
      // LEM: 10 - 3 = 7
      expect(result.varieties.inventory.LEMONADES).toBe(7);
      // CD: 5 - 2 = 3
      expect(result.varieties.inventory.CARAMEL_DELITES).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Cookie Share Tracking
  // -------------------------------------------------------------------------
  describe('cookieShare', () => {
    it('tracks DC donations (non-site)', () => {
      // Jane's donation order = 1
      expect(result.cookieShare.digitalCookie.total).toBe(1);
    });

    it('identifies auto-synced vs manual-entry donations', () => {
      // Jane's donation is "Donation" + "CAPTURED" → auto-sync → manualEntry = 0
      expect(result.cookieShare.digitalCookie.manualEntry).toBe(0);
    });

    it('reports reconciled when manual entries match', () => {
      // DC manual(0) === SC manual(0) → reconciled
      expect(result.cookieShare.reconciled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Site Orders Dataset
  // -------------------------------------------------------------------------
  describe('siteOrders', () => {
    it('tracks booth sale orders and allocations', () => {
      expect(result.siteOrders.boothSale.total).toBe(10);
      expect(result.siteOrders.boothSale.allocated).toBe(4);
      expect(result.siteOrders.boothSale.unallocated).toBe(6);
      expect(result.siteOrders.boothSale.hasWarning).toBe(true);
    });

    it('tracks direct ship site orders and allocations', () => {
      expect(result.siteOrders.directShip.total).toBe(6);
      expect(result.siteOrders.directShip.allocated).toBe(3);
      expect(result.siteOrders.directShip.unallocated).toBe(3);
      expect(result.siteOrders.directShip.hasWarning).toBe(true);
    });

    it('tracks girl delivery site orders (virtual booth)', () => {
      // No girl delivery site orders, but 5 allocated via VB
      expect(result.siteOrders.girlDelivery.total).toBe(0);
      expect(result.siteOrders.girlDelivery.allocated).toBe(5);
      expect(result.siteOrders.girlDelivery.hasWarning).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Metadata & Warnings
  // -------------------------------------------------------------------------
  describe('metadata', () => {
    it('counts scouts and orders', () => {
      // 3 scouts (Jane, Bob, Site)
      expect(result.metadata.scoutCount).toBe(3);
      // 3 + 2 + 2 = 7 orders
      expect(result.metadata.orderCount).toBe(7);
    });

    it('reports zero health check issues for clean data', () => {
      expect(result.metadata.healthChecks.unknownOrderTypes).toBe(0);
      expect(result.metadata.healthChecks.unknownPaymentMethods).toBe(0);
      expect(result.metadata.healthChecks.unknownTransferTypes).toBe(0);
    });

    it('has no warnings for well-formed data', () => {
      expect(result.warnings).toHaveLength(0);
    });
  });

  it('has transfer data', () => {
    expect(result.hasTransferData).toBe(true);
  });
});

// =============================================================================
// DC Row Builder — Creates raw DC data rows with correct column names
// =============================================================================

function makeDCRow(
  firstName: string,
  lastName: string,
  orderNumber: string,
  orderType: string,
  totalPackages: number,
  refundedPackages: number,
  amount: string,
  paymentStatus: string,
  cookies: Record<string, number> = {},
  donations = 0
): Record<string, any> {
  return {
    [DC_COLUMNS.ORDER_NUMBER]: orderNumber,
    [DC_COLUMNS.GIRL_FIRST_NAME]: firstName,
    [DC_COLUMNS.GIRL_LAST_NAME]: lastName,
    [DC_COLUMNS.ORDER_DATE]: '2025-02-10',
    [DC_COLUMNS.ORDER_TYPE]: orderType,
    [DC_COLUMNS.TOTAL_PACKAGES]: String(totalPackages),
    [DC_COLUMNS.REFUNDED_PACKAGES]: String(refundedPackages),
    [DC_COLUMNS.CURRENT_SALE_AMOUNT]: amount,
    [DC_COLUMNS.ORDER_STATUS]: 'Approved',
    [DC_COLUMNS.PAYMENT_STATUS]: paymentStatus,
    [DC_COLUMNS.SHIP_STATUS]: '',
    [DC_COLUMNS.DONATION]: String(donations),
    // Cookie variety columns
    'Thin Mints': String(cookies['Thin Mints'] || 0),
    'Caramel deLites': String(cookies['Caramel deLites'] || 0),
    'Peanut Butter Patties': String(cookies['Peanut Butter Patties'] || 0),
    'Peanut Butter Sandwich': String(cookies['Peanut Butter Sandwich'] || 0),
    Trefoils: String(cookies.Trefoils || 0),
    Adventurefuls: String(cookies.Adventurefuls || 0),
    Lemonades: String(cookies.Lemonades || 0),
    Exploremores: String(cookies.Exploremores || 0),
    'Caramel Chocolate Chip': String(cookies['Caramel Chocolate Chip'] || 0)
  };
}
