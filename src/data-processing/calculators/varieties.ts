// Varieties Calculations
// Aggregates cookie variety counts and calculates troop inventory by variety

import { ORDER_TYPE, T2G_CATEGORIES, TROOP_INVENTORY_IN_CATEGORIES } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { DataStore } from '../../data-store';
import type { Scout, Transfer, Varieties, VarietiesResult } from '../../types';
import { needsInventory } from './helpers';

/** Add physical varieties (excluding Cookie Share) to accumulator */
function addVarieties(source: Varieties, target: Varieties): void {
  Object.entries(source).forEach(([variety, count]) => {
    if (variety === COOKIE_TYPE.COOKIE_SHARE) return;
    if (typeof count === 'number' && count > 0) {
      target[variety as keyof Varieties] = (target[variety as keyof Varieties] || 0) + count;
    }
  });
}

/**
 * Build aggregate variety counts from actual customer sales
 *
 * Calculates:
 * 1. Total packages sold by variety (byCookie) - from scout orders + credited allocations
 * 2. Net troop inventory by variety (inventory) - from SC transfers
 *
 * INVENTORY CALCULATION (variety-level):
 * - Start with 0 for each variety
 * - Add C2T varieties (packages received from council)
 * - Subtract ALL T2G varieties (physical + virtual booth + booth divider)
 * - Cookie Share excluded (virtual, never in physical inventory)
 */
export function buildVarieties(reconciler: DataStore, scouts: Map<string, Scout>): VarietiesResult {
  const byCookie: Varieties = {};
  const inventory: Varieties = {};

  // Aggregate varieties from actual customer sales (scout orders + credited allocations)
  scouts.forEach((scout) => {
    // Girl delivery + direct ship orders
    scout.orders.forEach((order) => {
      if (needsInventory(order) || order.orderType === ORDER_TYPE.DIRECT_SHIP) {
        addVarieties(order.varieties, byCookie);
      }
    });
    // Credited allocations (booth sales, virtual booth, direct ship)
    if (!scout.isSiteOrder) {
      addVarieties(scout.credited.boothSales.varieties, byCookie);
      addVarieties(scout.credited.virtualBooth.varieties, byCookie);
      addVarieties(scout.credited.directShip.varieties, byCookie);
    }
  });

  // Calculate net troop inventory by variety (SC transfer data)
  // C2T/G2T add to troop stock, all T2G categories subtract from troop stock
  reconciler.transfers.forEach((transfer: Transfer) => {
    let sign = 0;
    if (TROOP_INVENTORY_IN_CATEGORIES.has(transfer.category)) {
      sign = 1; // Inventory in
    } else if (T2G_CATEGORIES.has(transfer.category)) {
      sign = -1; // Inventory out
    }
    if (sign === 0) return;

    Object.entries(transfer.physicalVarieties).forEach(([variety, count]) => {
      if (typeof count === 'number') {
        inventory[variety as keyof Varieties] = (inventory[variety as keyof Varieties] || 0) + sign * count;
      }
    });
  });

  const total = Object.values(byCookie).reduce((sum, count) => sum + (count || 0), 0);

  return {
    byCookie,
    inventory,
    total
  };
}
