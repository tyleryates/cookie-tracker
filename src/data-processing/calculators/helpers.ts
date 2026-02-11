// Shared Helper Functions for Calculations
// Pure utility functions used across calculator modules

import { ORDER_TYPE, OWNER } from '../../constants';
import type { Allocation, AllocationChannel, Order, Scout, Varieties } from '../../types';
import { accumulateVarieties } from '../utils';

/**
 * Whether an order draws from the scout's physical inventory.
 * True only for GIRL-owned DELIVERY or IN_HAND orders.
 */
export function needsInventory(order: Pick<Order, 'owner' | 'orderType'>): boolean {
  return order.owner === OWNER.GIRL && (order.orderType === ORDER_TYPE.DELIVERY || order.orderType === ORDER_TYPE.IN_HAND);
}

/**
 * Total credited packages + donations across all allocation channels.
 */
export function totalCredited(allocations: Allocation[]): number {
  let total = 0;
  for (const a of allocations) {
    total += a.packages + a.donations;
  }
  return total;
}

/**
 * Get aggregate totals for a specific allocation channel.
 */
export function channelTotals(
  allocations: Allocation[],
  channel: AllocationChannel
): { packages: number; donations: number; varieties: Varieties } {
  let packages = 0;
  let donations = 0;
  const varieties: Varieties = {};
  for (const a of allocations) {
    if (a.channel !== channel) continue;
    packages += a.packages;
    donations += a.donations;
    if (a.varieties) {
      accumulateVarieties(a.varieties, varieties);
    }
  }
  return { packages, donations, varieties };
}

/**
 * Filter allocations by channel.
 */
export function allocationsByChannel(allocations: Allocation[], channel: AllocationChannel): Allocation[] {
  return allocations.filter((a) => a.channel === channel);
}

/**
 * Calculate sales by variety for orders needing inventory
 * @param scout - Scout object
 * @returns Sales by variety (excludes Cookie Share)
 */
export function calculateSalesByVariety(scout: Scout): Varieties {
  const salesByVariety: Varieties = {};

  // Only process orders that need inventory
  const inventoryOrders = scout.orders.filter((order) => needsInventory(order));

  inventoryOrders.forEach((order) => {
    accumulateVarieties(order.varieties, salesByVariety, { excludeCookieShare: true });
  });

  return salesByVariety;
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
