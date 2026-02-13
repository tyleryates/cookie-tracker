// Varieties Calculations
// Aggregates cookie variety counts and calculates troop inventory by variety

import { ORDER_TYPE, T2G_CATEGORIES, TRANSFER_CATEGORY, TROOP_INVENTORY_IN_CATEGORIES } from '../../constants';
import type { ReadonlyDataStore } from '../../data-store';
import type { Scout, Varieties, VarietiesResult } from '../../types';
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
 * - Add C2T/G2T varieties (packages received from council or returned by scouts)
 * - Subtract ALL T2G varieties (physical + virtual booth + booth divider)
 * - Subtract outgoing T2T (packages sent to other troops)
 * - Cookie Share excluded (virtual, never in physical inventory)
 */
function buildVarieties(store: ReadonlyDataStore, scouts: Record<string, Scout>): VarietiesResult {
  const byCookie: Varieties = {};
  const inventory: Varieties = {};

  // Aggregate varieties from actual customer sales (scout orders + credited allocations)
  for (const scout of Object.values(scouts)) {
    // Girl delivery + direct ship orders
    for (const order of scout.orders) {
      if (needsInventory(order) || order.orderType === ORDER_TYPE.DIRECT_SHIP) {
        accumulateVarieties(order.varieties, byCookie, { excludeCookieShare: true });
      }
    }
    // Credited allocations (booth sales, virtual booth, direct ship)
    if (!scout.isSiteOrder) {
      for (const alloc of scout.allocations) {
        accumulateVarieties(alloc.varieties, byCookie, { excludeCookieShare: true });
      }
    }
  }

  // Calculate net troop inventory by variety (SC transfer data)
  // C2T/G2T add to troop stock; T2G + outgoing T2T subtract from troop stock
  for (const transfer of store.transfers) {
    if (TROOP_INVENTORY_IN_CATEGORIES.has(transfer.category)) {
      accumulateVarieties(transfer.physicalVarieties, inventory);
    } else if (T2G_CATEGORIES.has(transfer.category) || transfer.category === TRANSFER_CATEGORY.TROOP_OUTGOING) {
      accumulateVarieties(transfer.physicalVarieties, inventory, { sign: -1 });
    }
  }

  const total = Object.values(byCookie).reduce((sum, count) => sum + (count || 0), 0);

  return {
    byCookie,
    inventory,
    total
  };
}

export { buildVarieties };
