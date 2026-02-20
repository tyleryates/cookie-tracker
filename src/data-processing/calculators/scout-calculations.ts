// Scout-Level Calculations
// Handles all per-scout totals, variety calculations, and financial tracking

import { ALLOCATION_CHANNEL, ORDER_STATUS_CLASS, ORDER_TYPE, OWNER, PAYMENT_METHOD } from '../../constants';
import { calculateRevenue, PHYSICAL_COOKIE_TYPES } from '../../cookie-constants';
import { classifyOrderStatus } from '../../order-classification';
import type { CookieType, Order, Scout, Varieties } from '../../types';
import { buildPhysicalVarieties } from '../utils';
import { calculateSalesByVariety, channelTotals, needsInventory, totalCredited } from './helpers';

/** Compute net inventory balance per physical variety: inventory - sales */
function computeInventoryBalances(scout: Scout, salesByVariety: Varieties): Varieties {
  const balances: Varieties = {};
  for (const variety of PHYSICAL_COOKIE_TYPES) {
    const inventoryCount = scout.inventory.varieties[variety] || 0;
    const salesCount = salesByVariety[variety] || 0;
    balances[variety] = inventoryCount - salesCount;
  }
  return balances;
}

/** Detect negative inventory issues from pre-computed balances */
function detectNegativeInventory(scout: Scout, balances: Varieties, salesByVariety: Varieties): void {
  const negativeVarieties: Array<{ variety: CookieType; inventory: number; sales: number; shortfall: number }> = [];

  for (const variety of PHYSICAL_COOKIE_TYPES) {
    const net = balances[variety] || 0;
    if (net < 0) {
      negativeVarieties.push({
        variety,
        inventory: scout.inventory.varieties[variety] || 0,
        sales: salesByVariety[variety] || 0,
        shortfall: Math.abs(net)
      });
    }
  }

  if (negativeVarieties.length === 0) return;
  scout.$issues = scout.$issues || {};
  scout.$issues.negativeInventory = negativeVarieties;
}

/** Calculate order totals from scout's orders */
function calculateOrderTotals(scout: Scout): void {
  scout.totals.orders = scout.orders.length;

  for (const order of scout.orders) {
    // Physical packages by delivery method
    if (needsInventory(order)) {
      scout.totals.delivered += order.physicalPackages;
    } else if (order.orderType === ORDER_TYPE.DIRECT_SHIP) {
      scout.totals.shipped += order.physicalPackages;
    }

    // Donations
    scout.totals.donations += order.donations;
  }
}

/** Calculate credited totals from allocations */
function calculateCreditedTotals(scout: Scout): void {
  scout.totals.credited = totalCredited(scout.allocations);
}

/** Calculate sold totals */
function calculateRevenueTotals(scout: Scout): void {
  // Total sold across all channels
  scout.totals.totalSold = scout.totals.delivered + scout.totals.shipped + scout.totals.donations + scout.totals.credited;
}

/** Calculate physical revenue from order varieties (excludes Cookie Share) */
function physicalOrderRevenue(order: Order): number {
  return calculateRevenue(buildPhysicalVarieties(order.varieties));
}

/** Calculate financial tracking (cash vs electronic payments) */
function calculateFinancialTracking(scout: Scout): void {
  let allCashCollected = 0; // ALL cash from girl orders (scout must turn this in)
  let inventoryElectronic = 0; // Electronic payments for physical inventory orders
  let inventoryCashPhysical = 0; // Cash payments for physical inventory orders

  for (const order of scout.orders) {
    if (order.owner !== OWNER.GIRL) continue;

    const isElectronic = order.paymentMethod != null && order.paymentMethod !== PAYMENT_METHOD.CASH;

    if (isElectronic) {
      // Only inventory orders reduce what's owed for physical cookies
      if (needsInventory(order)) {
        inventoryElectronic += physicalOrderRevenue(order);
      }
    } else {
      // ALL cash must be turned in (delivery, booth, donation — doesn't matter)
      allCashCollected += order.amount;
      // Track physical portion separately for inventory accounting
      if (needsInventory(order)) {
        inventoryCashPhysical += physicalOrderRevenue(order);
      }
    }
  }

  // Total value of all inventory picked up (scouts are financially responsible)
  const inventoryValue = calculateRevenue(scout.inventory.varieties);

  // Cash owed = all cash collected + value of any unsold inventory
  // Unsold = inventory value minus everything sold (electronic + cash physical portions)
  const totalInventorySold = inventoryElectronic + inventoryCashPhysical;
  const unsoldValue = Math.max(0, inventoryValue - totalInventorySold);
  const cashOwed = allCashCollected + unsoldValue;

  // Payments already turned in to the troop
  const paymentsTurnedIn = scout.payments.reduce((sum, p) => sum + p.amount, 0);
  const cashDue = cashOwed - paymentsTurnedIn;

  scout.totals.$financials = {
    cashCollected: allCashCollected,
    electronicPayments: inventoryElectronic,
    inventoryValue: inventoryValue,
    unsoldValue: unsoldValue,
    cashOwed: cashOwed,
    paymentsTurnedIn: paymentsTurnedIn,
    cashDue: cashDue
  };
}

/** Calculate inventory display and detect issues (uses shared balance computation) */
function calculateInventoryDisplay(scout: Scout, salesByVariety: Varieties): void {
  const balances = computeInventoryBalances(scout, salesByVariety);

  // Store net inventory by variety for display
  scout.totals.$inventoryDisplay = balances;
  let inventoryTotal = 0;
  for (const variety of PHYSICAL_COOKIE_TYPES) {
    inventoryTotal += balances[variety] || 0;
  }
  scout.totals.inventory = inventoryTotal;

  // Detect negative inventory issues using same balances
  detectNegativeInventory(scout, balances, salesByVariety);
}

/** Count order statuses for a scout */
function countOrderStatuses(scout: Scout): { needsApproval: number; pending: number; completed: number } {
  let needsApproval = 0;
  let pending = 0;
  let completed = 0;
  for (const order of scout.orders) {
    switch (classifyOrderStatus(order.status)) {
      case ORDER_STATUS_CLASS.NEEDS_APPROVAL:
        needsApproval++;
        break;
      case ORDER_STATUS_CLASS.PENDING:
        pending++;
        break;
      case ORDER_STATUS_CLASS.COMPLETED:
        completed++;
        break;
    }
  }
  return { needsApproval, pending, completed };
}

/** Calculate variety totals and financial data for a single scout */
function calculateVarietyTotals(scout: Scout): void {
  calculateOrderTotals(scout);
  calculateCreditedTotals(scout);
  calculateRevenueTotals(scout);
  calculateFinancialTracking(scout);

  // Pre-compute derived data for renderer consumption
  const salesByVariety = calculateSalesByVariety(scout);
  scout.totals.$salesByVariety = salesByVariety;
  calculateInventoryDisplay(scout, salesByVariety);
  const byChannel: { booth: typeof scout.allocations; directShip: typeof scout.allocations; virtualBooth: typeof scout.allocations } = {
    booth: [],
    directShip: [],
    virtualBooth: []
  };
  for (const a of scout.allocations) {
    if (a.channel === ALLOCATION_CHANNEL.BOOTH) byChannel.booth.push(a);
    else if (a.channel === ALLOCATION_CHANNEL.DIRECT_SHIP) byChannel.directShip.push(a);
    else if (a.channel === ALLOCATION_CHANNEL.VIRTUAL_BOOTH) byChannel.virtualBooth.push(a);
  }
  scout.$allocationsByChannel = byChannel;
  scout.totals.$allocationSummary = {
    booth: channelTotals(scout.$allocationsByChannel.booth),
    directShip: channelTotals(scout.$allocationsByChannel.directShip),
    virtualBooth: channelTotals(scout.$allocationsByChannel.virtualBooth)
  };
  scout.totals.$orderStatusCounts = countOrderStatuses(scout);
}

/** Calculate totals for all scouts in dataset */
function calculateScoutTotals(scoutDataset: Map<string, Scout>): void {
  for (const [, scout] of scoutDataset) {
    calculateVarietyTotals(scout);
  }
}

/** Calculate aggregate scout counts */
function calculateScoutCounts(scouts: Record<string, Scout>): {
  total: number;
  active: number;
  inactive: number;
  withNegativeInventory: number;
} {
  let totalScouts = 0;
  let activeScouts = 0;
  let inactiveScouts = 0;
  let scoutsWithNegativeInventory = 0;

  for (const scout of Object.values(scouts)) {
    if (scout.isSiteOrder) continue; // Exclude site orders from scout counts

    totalScouts++;

    if (scout.totals.totalSold > 0) {
      activeScouts++;
    } else {
      inactiveScouts++;
    }

    if (scout.$issues?.negativeInventory) {
      scoutsWithNegativeInventory++;
    }
  }

  return {
    total: totalScouts,
    active: activeScouts,
    inactive: inactiveScouts,
    withNegativeInventory: scoutsWithNegativeInventory
  };
}

export { calculateScoutTotals, calculateScoutCounts };
