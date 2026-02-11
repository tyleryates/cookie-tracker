// Varieties Calculations
// Aggregates cookie variety counts and calculates troop inventory by variety

import { ORDER_TYPE, T2G_CATEGORIES, TROOP_INVENTORY_IN_CATEGORIES } from '../../constants';
import type { ReadonlyDataStore } from '../../data-store';
import type { Scout, Transfer, Varieties, VarietiesResult } from '../../types';
import { accumulateVarieties } from '../utils';
import { needsInventory } from './helpers';

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
export function buildVarieties(reconciler: ReadonlyDataStore, scouts: Map<string, Scout>): VarietiesResult {
  const byCookie: Varieties = {};
  const inventory: Varieties = {};

  // Aggregate varieties from actual customer sales (scout orders + credited allocations)
  scouts.forEach((scout) => {
    // Girl delivery + direct ship orders
    scout.orders.forEach((order) => {
      if (needsInventory(order) || order.orderType === ORDER_TYPE.DIRECT_SHIP) {
        accumulateVarieties(order.varieties, byCookie, { excludeCookieShare: true });
      }
    });
    // Credited allocations (booth sales, virtual booth, direct ship)
    if (!scout.isSiteOrder) {
      scout.allocations.forEach((alloc) => {
        accumulateVarieties(alloc.varieties, byCookie, { excludeCookieShare: true });
      });
    }
  });

  // Calculate net troop inventory by variety (SC transfer data)
  // C2T/G2T add to troop stock, all T2G categories subtract from troop stock
  reconciler.transfers.forEach((transfer: Transfer) => {
    if (TROOP_INVENTORY_IN_CATEGORIES.has(transfer.category)) {
      accumulateVarieties(transfer.physicalVarieties, inventory);
    } else if (T2G_CATEGORIES.has(transfer.category)) {
      accumulateVarieties(transfer.physicalVarieties, inventory, { sign: -1 });
    }
  });

  const total = Object.values(byCookie).reduce((sum, count) => sum + (count || 0), 0);

  return {
    byCookie,
    inventory,
    total
  };
}
