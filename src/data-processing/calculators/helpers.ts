// Shared Helper Functions for Calculations
// Pure utility functions used across calculator modules

import { COOKIE_TYPE } from '../../cookie-constants';
import type { Scout, ScoutCredited, Varieties } from '../../types';

/**
 * Calculate total credited packages (all 6 fields) for a scout.
 * Single source of truth for the credited total.
 */
export function totalCredited(credited: ScoutCredited): number {
  return (
    credited.virtualBooth.packages +
    credited.virtualBooth.donations +
    credited.directShip.packages +
    credited.directShip.donations +
    credited.boothSales.packages +
    credited.boothSales.donations
  );
}

/**
 * Add varieties from source to target object
 * Eliminates duplicate variety accumulation logic
 *
 * @param target - Target varieties object to update
 * @param sourceVarieties - Source varieties to add
 */
export function addVarietiesToTarget(target: Varieties, sourceVarieties?: Varieties): void {
  if (!sourceVarieties) return;

  Object.entries(sourceVarieties).forEach(([variety, count]) => {
    if (count !== undefined) {
      target[variety as keyof Varieties] = (target[variety as keyof Varieties] || 0) + count;
    }
  });
}

/**
 * Calculate sales by variety for orders needing inventory
 * @param scout - Scout object
 * @returns Sales by variety (excludes Cookie Share)
 */
export function calculateSalesByVariety(scout: Scout): Varieties {
  const salesByVariety: Varieties = {};

  // Only process orders that need inventory
  const inventoryOrders = scout.orders.filter((order) => order.needsInventory);

  inventoryOrders.forEach((order) => {
    addPhysicalVarietiesToSales(order.varieties, salesByVariety);
  });

  return salesByVariety;
}

/**
 * Add physical varieties (excluding Cookie Share) to sales totals
 * @param varieties - Varieties from order
 * @param salesByVariety - Sales accumulator
 */
function addPhysicalVarietiesToSales(varieties: Varieties, salesByVariety: Varieties): void {
  Object.entries(varieties).forEach(([variety, count]) => {
    if (variety !== COOKIE_TYPE.COOKIE_SHARE && count !== undefined) {
      salesByVariety[variety as keyof Varieties] = (salesByVariety[variety as keyof Varieties] || 0) + count;
    }
  });
}

/**
 * Find scout by girl ID using lookup map
 * @param girlId - Girl ID to find
 * @param scoutDataset - Scout dataset
 * @param girlIdToName - Girl ID to name mapping
 * @returns Scout object or null
 */
export function findScoutByGirlId(girlId: number, scoutDataset: Map<string, Scout>, girlIdToName: Map<number, string>): Scout | null {
  const scoutName = girlIdToName.get(girlId);
  if (!scoutName) return null;
  return scoutDataset.get(scoutName) || null;
}

/**
 * Build girl ID to name mapping from scout dataset
 * @param scoutDataset - Scout dataset
 * @returns Girl ID to name mapping
 */
export function buildGirlIdToNameMap(scoutDataset: Map<string, Scout>): Map<number, string> {
  const girlIdToName = new Map<number, string>();
  scoutDataset.forEach((scout) => {
    if (scout.girlId) {
      girlIdToName.set(scout.girlId, scout.name);
    }
  });
  return girlIdToName;
}
