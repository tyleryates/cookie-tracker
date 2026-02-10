// Varieties Calculations
// Aggregates cookie variety counts and calculates troop inventory by variety

import { TRANSFER_CATEGORY } from '../../constants';
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
  const saleCategories: Set<string> = new Set([
    TRANSFER_CATEGORY.GIRL_PICKUP,
    TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION,
    TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION,
    TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION,
    TRANSFER_CATEGORY.DIRECT_SHIP
  ]);

  reconciler.transfers.forEach((transfer: Transfer) => {
    if (!saleCategories.has(transfer.category)) return;
    if (!transfer.packages || transfer.packages <= 0) return;

    Object.entries(transfer.varieties).forEach(([variety, count]) => {
      if (typeof count === 'number' && count > 0) {
        byCookie[variety as keyof Varieties] = (byCookie[variety as keyof Varieties] || 0) + count;
      }
    });
  });

  // Calculate net troop inventory by variety (SC transfer data)
  reconciler.transfers.forEach((transfer: Transfer) => {
    switch (transfer.category) {
      // C2T — Add to inventory (packages received from council)
      case TRANSFER_CATEGORY.COUNCIL_TO_TROOP:
      // G2T — Add back to inventory (packages returned from scout to troop)
      case TRANSFER_CATEGORY.GIRL_RETURN:
        Object.entries(transfer.physicalVarieties).forEach(([variety, count]) => {
          if (typeof count === 'number') {
            inventory[variety as keyof Varieties] = (inventory[variety as keyof Varieties] || 0) + count;
          }
        });
        break;
      // T2G categories — Subtract from inventory (packages that left troop stock)
      case TRANSFER_CATEGORY.GIRL_PICKUP:
      case TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION:
      case TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION:
      case TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION:
        Object.entries(transfer.physicalVarieties).forEach(([variety, count]) => {
          if (typeof count === 'number') {
            inventory[variety as keyof Varieties] = (inventory[variety as keyof Varieties] || 0) - count;
          }
        });
        break;
      // DC_ORDER_RECORD, COOKIE_SHARE_RECORD, DIRECT_SHIP, PLANNED: no inventory impact
    }
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
