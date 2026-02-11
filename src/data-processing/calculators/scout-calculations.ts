// Scout-Level Calculations
// Handles all per-scout totals, variety calculations, and financial tracking

import { ORDER_TYPE, OWNER, PAYMENT_METHOD } from '../../constants';
import {
  COOKIE_TYPE,
  calculateRevenue,
  PHYSICAL_COOKIE_TYPES,
  PROCEEDS_EXEMPT_PACKAGES,
  TROOP_PROCEEDS_PER_PACKAGE
} from '../../cookie-constants';
import type { CookieType, Order, Scout, Varieties } from '../../types';
import { calculateSalesByVariety, totalCredited } from './helpers';

/** Check single variety for negative inventory */
function checkVarietyInventory(
  variety: CookieType,
  scout: Scout,
  salesByVariety: Varieties
): {
  variety: CookieType;
  inventory: number;
  sales: number;
  shortfall: number;
} | null {
  const inventoryCount = scout.inventory.varieties[variety] || 0;
  const salesCount = salesByVariety[variety] || 0;
  const netInventory = inventoryCount - salesCount;

  if (netInventory >= 0) return null;

  return {
    variety: variety,
    inventory: inventoryCount,
    sales: salesCount,
    shortfall: Math.abs(netInventory)
  };
}

/** Detect negative inventory issues */
function detectNegativeInventory(scout: Scout, salesByVariety: Varieties): void {
  const negativeVarieties = PHYSICAL_COOKIE_TYPES.map((variety) => checkVarietyInventory(variety, scout, salesByVariety)).filter(
    (issue) => issue !== null
  );

  if (negativeVarieties.length === 0) return;

  scout.$issues = scout.$issues || {};
  scout.$issues.negativeInventory = negativeVarieties;
}

/** Calculate order totals from scout's orders */
function calculateOrderTotals(scout: Scout): void {
  scout.totals.orders = scout.orders.length;

  scout.orders.forEach((order: Order) => {
    // Physical packages by delivery method
    if (order.needsInventory) {
      scout.totals.delivered += order.physicalPackages;
    } else if (order.orderType === ORDER_TYPE.DIRECT_SHIP) {
      scout.totals.shipped += order.physicalPackages;
    }

    // Donations
    scout.totals.donations += order.donations;
  });
}

/** Calculate credited totals from allocations */
function calculateCreditedTotals(scout: Scout): void {
  scout.totals.credited = totalCredited(scout.credited);

  scout.totals.$creditedRevenue =
    calculateRevenue(scout.credited.virtualBooth.varieties) +
    calculateRevenue(scout.credited.directShip.varieties) +
    calculateRevenue(scout.credited.boothSales.varieties);
}

/** Calculate sold totals and proceeds */
function calculateRevenueTotals(scout: Scout): void {
  // Total sold across all channels
  scout.totals.totalSold = scout.totals.delivered + scout.totals.shipped + scout.totals.donations + scout.totals.credited;

  // Troop proceeds (first 50 packages per active girl are exempt)
  const grossProceeds = scout.totals.totalSold * TROOP_PROCEEDS_PER_PACKAGE;
  if (!scout.isSiteOrder && scout.totals.totalSold > 0) {
    const exemptPackages = Math.min(scout.totals.totalSold, PROCEEDS_EXEMPT_PACKAGES);
    scout.totals.$proceedsDeduction = exemptPackages * TROOP_PROCEEDS_PER_PACKAGE;
    scout.totals.$troopProceeds = grossProceeds - scout.totals.$proceedsDeduction;
  } else {
    scout.totals.$proceedsDeduction = 0;
    scout.totals.$troopProceeds = grossProceeds;
  }
}

/** Calculate physical revenue from order varieties (excludes Cookie Share) */
function physicalOrderRevenue(order: Order): number {
  const physicalVarieties: Record<string, number> = {};
  Object.entries(order.varieties).forEach(([variety, count]) => {
    if (variety !== COOKIE_TYPE.COOKIE_SHARE && count) {
      physicalVarieties[variety] = count;
    }
  });
  return calculateRevenue(physicalVarieties as Varieties);
}

/** Calculate financial tracking (cash vs electronic payments) */
function calculateFinancialTracking(scout: Scout): void {
  let allCashCollected = 0; // ALL cash from girl orders (scout must turn this in)
  let inventoryElectronic = 0; // Electronic payments for physical inventory orders
  let inventoryCashPhysical = 0; // Cash payments for physical inventory orders

  scout.orders.forEach((order: Order) => {
    if (order.owner !== OWNER.GIRL) return;

    const isElectronic = order.paymentMethod != null && order.paymentMethod !== PAYMENT_METHOD.CASH;

    if (isElectronic) {
      // Only inventory orders reduce what's owed for physical cookies
      if (order.needsInventory) {
        inventoryElectronic += physicalOrderRevenue(order);
      }
    } else {
      // ALL cash must be turned in (delivery, booth, donation — doesn't matter)
      allCashCollected += order.amount;
      // Track physical portion separately for inventory accounting
      if (order.needsInventory) {
        inventoryCashPhysical += physicalOrderRevenue(order);
      }
    }
  });

  // Total value of all inventory picked up (scouts are financially responsible)
  const inventoryValue = calculateRevenue(scout.inventory.varieties);

  // Cash owed = all cash collected + value of any unsold inventory
  // Unsold = inventory value minus everything sold (electronic + cash physical portions)
  const totalInventorySold = inventoryElectronic + inventoryCashPhysical;
  const unsoldValue = Math.max(0, inventoryValue - totalInventorySold);
  const cashOwed = allCashCollected + unsoldValue;

  scout.totals.$financials = {
    cashCollected: allCashCollected,
    electronicPayments: inventoryElectronic,
    inventoryValue: inventoryValue,
    unsoldValue: unsoldValue,
    cashOwed: cashOwed
  };
}

/** Calculate inventory display and detect issues */
function calculateInventoryDisplay(scout: Scout): void {
  // Sales by variety (for net inventory calculation)
  const salesByVariety = calculateSalesByVariety(scout);

  // Net inventory by variety
  scout.totals.$inventoryDisplay = {};
  let inventoryTotal = 0;
  PHYSICAL_COOKIE_TYPES.forEach((variety) => {
    const inventoryCount = scout.inventory.varieties[variety] || 0;
    const salesCount = salesByVariety[variety] || 0;
    const net = inventoryCount - salesCount;
    scout.totals.$inventoryDisplay[variety] = net;
    // Can't have negative boxes on hand — clamp per variety so one oversold
    // variety doesn't drag down the total (girl just needs more inventory)
    inventoryTotal += Math.max(0, net);
  });
  scout.totals.inventory = inventoryTotal;

  // Detect negative inventory issues
  detectNegativeInventory(scout, salesByVariety);
}

/** Calculate variety totals and financial data for a single scout */
function calculateVarietyTotals(scout: Scout): void {
  calculateOrderTotals(scout);
  calculateCreditedTotals(scout);
  calculateRevenueTotals(scout);
  calculateFinancialTracking(scout);
  calculateInventoryDisplay(scout);
}

/** Calculate totals for all scouts in dataset */
function calculateScoutTotals(scoutDataset: Map<string, Scout>): void {
  scoutDataset.forEach((scout: Scout) => {
    calculateVarietyTotals(scout);
  });
}

/** Calculate aggregate scout counts */
function calculateScoutCounts(scouts: Map<string, Scout>): {
  total: number;
  active: number;
  inactive: number;
  withNegativeInventory: number;
} {
  let totalScouts = 0;
  let activeScouts = 0;
  let inactiveScouts = 0;
  let scoutsWithNegativeInventory = 0;

  scouts.forEach((scout: Scout) => {
    if (scout.isSiteOrder) return; // Exclude site orders from scout counts

    totalScouts++;

    if (scout.totals.totalSold > 0) {
      activeScouts++;
    } else {
      inactiveScouts++;
    }

    if (scout.$issues?.negativeInventory) {
      scoutsWithNegativeInventory++;
    }
  });

  return {
    total: totalScouts,
    active: activeScouts,
    inactive: inactiveScouts,
    withNegativeInventory: scoutsWithNegativeInventory
  };
}

export { calculateScoutTotals };
export { calculateScoutCounts };
