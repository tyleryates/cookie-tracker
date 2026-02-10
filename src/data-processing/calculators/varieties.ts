// Varieties Calculations
// Aggregates cookie variety counts and calculates troop inventory by variety

import { SALE_CATEGORIES, T2G_CATEGORIES, TROOP_INVENTORY_IN_CATEGORIES } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { IDataReconciler, Transfer, Varieties, VarietiesResult } from '../../types';

/**
 * Build aggregate variety counts across all transfers
 *
 * Calculates:
 * 1. Total packages sold by variety (byCookie) - from SC transfers (source of truth)
 * 2. Net troop inventory by variety (inventory) - from SC transfers
 *
 * INVENTORY CALCULATION (variety-level):
 * - Start with 0 for each variety
 * - Add C2T varieties (packages received from council)
 * - Subtract ALL T2G varieties (physical + virtual booth + booth divider)
 * - Cookie Share excluded (virtual, never in physical inventory)
 */
export function buildVarieties(reconciler: IDataReconciler): VarietiesResult {
  const byCookie: Varieties = {};
  const inventory: Varieties = {};

  // Aggregate varieties from SC transfers that count as sold.
  // Only actual sale categories are counted. DC_ORDER_RECORD and COOKIE_SHARE_RECORD
  // are sync records — counting them would double-count with the T2G allocation.
  reconciler.transfers.forEach((transfer: Transfer) => {
    if (!SALE_CATEGORIES.has(transfer.category)) return;
    if (!transfer.packages || transfer.packages <= 0) return;

    Object.entries(transfer.varieties).forEach(([variety, count]) => {
      if (variety === COOKIE_TYPE.COOKIE_SHARE) return;
      if (typeof count === 'number' && count > 0) {
        byCookie[variety as keyof Varieties] = (byCookie[variety as keyof Varieties] || 0) + count;
      }
    });
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

  // Calculate totals
  const totalPhysical = Object.entries(byCookie)
    .filter(([variety]) => variety !== COOKIE_TYPE.COOKIE_SHARE)
    .reduce((sum, [, count]) => sum + (count || 0), 0);

  const totalAll = Object.values(byCookie).reduce((sum, count) => sum + (count || 0), 0);

  return {
    byCookie,
    inventory,
    totalPhysical,
    totalAll
  };
}
