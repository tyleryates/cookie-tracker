// Smart Cookie Allocation Processing
// Handles virtual booth, direct ship, and booth sales allocations

import { ALLOCATION_CHANNEL, ALLOCATION_SOURCE, SCOUT_PHYSICAL_CATEGORIES, TRANSFER_CATEGORY } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { ReadonlyDataStore } from '../../data-store';
import type { Allocation, Scout, Transfer } from '../../types';
import { accumulateVarieties } from '../utils';

import { buildGirlIdToNameMap, findScoutByGirlId } from './helpers';

/** Process virtual booth T2G transfers (Troop girl delivery) */
function processVirtualBoothAllocations(reconciler: ReadonlyDataStore, scoutDataset: Map<string, Scout>): void {
  reconciler.transfers.forEach((transfer: Transfer) => {
    if (transfer.category !== TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION) return;

    const scout = scoutDataset.get(transfer.to);
    if (!scout) return;

    scout.allocations.push({
      channel: ALLOCATION_CHANNEL.VIRTUAL_BOOTH,
      girlId: scout.girlId || 0,
      packages: transfer.physicalPackages || 0,
      donations: transfer.varieties?.[COOKIE_TYPE.COOKIE_SHARE] || 0,
      varieties: { ...transfer.varieties },
      source: ALLOCATION_SOURCE.VIRTUAL_BOOTH_TRANSFER,
      date: transfer.date,
      orderNumber: transfer.orderNumber,
      from: transfer.from,
      amount: transfer.amount || 0
    });
  });
}

/** Process imported allocations (direct ship + booth) from reconciler → scout */
function processImportedAllocations(
  reconciler: ReadonlyDataStore,
  scoutDataset: Map<string, Scout>,
  girlIdToName: Map<number, string>
): void {
  reconciler.allocations.forEach((allocation: Allocation) => {
    const scout = findScoutByGirlId(allocation.girlId, scoutDataset, girlIdToName);
    if (!scout) return;

    scout.allocations.push(allocation);
  });
}

/** Add inventory from Smart Cookie physical transfers (T2G pickup adds, G2T subtracts) */
function addInventory(reconciler: ReadonlyDataStore, scoutDataset: Map<string, Scout>): void {
  reconciler.transfers.forEach((transfer: Transfer) => {
    if (!SCOUT_PHYSICAL_CATEGORIES.has(transfer.category)) return;

    // GIRL_PICKUP: scout picks up from troop (+), GIRL_RETURN: scout returns to troop (-)
    const isPickup = transfer.category === TRANSFER_CATEGORY.GIRL_PICKUP;
    const scout = scoutDataset.get(isPickup ? transfer.to : transfer.from);
    if (!scout) return;

    const sign = isPickup ? 1 : -1;
    scout.inventory.total += sign * (transfer.physicalPackages || 0);
    accumulateVarieties(transfer.physicalVarieties, scout.inventory.varieties, { sign });
  });
}

/** Add all allocations to scout dataset */
function addAllocations(reconciler: ReadonlyDataStore, scoutDataset: Map<string, Scout>): void {
  // Process virtual booth allocations (Type 4: Troop girl delivery)
  processVirtualBoothAllocations(reconciler, scoutDataset);

  // Build girl ID to name mapping (shared by direct ship and booth sales)
  const girlIdToName = buildGirlIdToNameMap(scoutDataset);

  // Process imported allocations (booth + direct ship from divider APIs)
  processImportedAllocations(reconciler, scoutDataset, girlIdToName);
}

export { addInventory };
export { addAllocations };
