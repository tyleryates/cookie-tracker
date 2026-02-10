// Smart Cookie Allocation Processing
// Handles virtual booth, direct ship, and booth sales allocations

import { SCOUT_PHYSICAL_CATEGORIES, TRANSFER_CATEGORY } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { BoothSalesAllocation, DirectShipAllocation, IDataReconciler, Scout, Transfer } from '../../types';
import { sumPhysicalPackages } from '../utils';
import { addVarietiesToTarget, buildGirlIdToNameMap, findScoutByGirlId } from './helpers';

/** Process virtual booth T2G transfers (Troop girl delivery) */
function processVirtualBoothAllocations(reconciler: IDataReconciler, scoutDataset: Map<string, Scout>): void {
  reconciler.transfers.forEach((transfer: Transfer) => {
    if (transfer.category !== TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION) return;

    const scout = scoutDataset.get(transfer.to);
    if (!scout) return;

    scout.credited.virtualBooth.packages += transfer.physicalPackages || 0;
    scout.credited.virtualBooth.donations += transfer.varieties?.[COOKIE_TYPE.COOKIE_SHARE] || 0;
    addVarietiesToTarget(scout.credited.virtualBooth.varieties, transfer.varieties);

    // Preserve individual allocation record for traceability
    scout.credited.virtualBooth.allocations.push({
      orderNumber: transfer.orderNumber,
      date: transfer.date,
      from: transfer.from,
      packages: transfer.physicalPackages || 0,
      varieties: { ...transfer.varieties },
      amount: transfer.amount || 0
    });
  });
}

/** Process direct ship divider allocations */
function processDirectShipAllocations(
  reconciler: IDataReconciler,
  scoutDataset: Map<string, Scout>,
  girlIdToName: Map<number, string>
): void {
  if (!reconciler.directShipAllocations) return;

  reconciler.directShipAllocations.forEach((allocation: DirectShipAllocation) => {
    const scout = findScoutByGirlId(allocation.girlId, scoutDataset, girlIdToName);
    if (!scout) return;

    const physicalPkgs = sumPhysicalPackages(allocation.varieties);
    const donationCount = allocation.trackedCookieShare || allocation.varieties?.[COOKIE_TYPE.COOKIE_SHARE] || 0;
    scout.credited.directShip.packages += physicalPkgs;
    scout.credited.directShip.donations += donationCount;
    addVarietiesToTarget(scout.credited.directShip.varieties, allocation.varieties);

    // Preserve individual allocation record
    scout.credited.directShip.allocations.push({
      packages: physicalPkgs,
      varieties: { ...allocation.varieties },
      source: 'DirectShipDivider'
    });
  });
}

/** Process booth sales divider allocations */
function processBoothSalesAllocations(
  reconciler: IDataReconciler,
  scoutDataset: Map<string, Scout>,
  girlIdToName: Map<number, string>
): void {
  if (!reconciler.boothSalesAllocations) return;

  reconciler.boothSalesAllocations.forEach((allocation: BoothSalesAllocation) => {
    const scout = findScoutByGirlId(allocation.girlId, scoutDataset, girlIdToName);
    if (!scout) return;

    const cookieShareCount = allocation.trackedCookieShare || allocation.varieties?.[COOKIE_TYPE.COOKIE_SHARE] || 0;
    const physicalPackages = sumPhysicalPackages(allocation.varieties);

    scout.credited.boothSales.packages += physicalPackages;
    scout.credited.boothSales.donations += cookieShareCount;
    addVarietiesToTarget(scout.credited.boothSales.varieties, allocation.varieties);

    // Preserve individual allocation record with booth details
    scout.credited.boothSales.allocations.push({
      reservationId: allocation.reservationId,
      storeName: allocation.booth?.storeName || '',
      date: allocation.timeslot?.date || '',
      startTime: allocation.timeslot?.startTime || '',
      endTime: allocation.timeslot?.endTime || '',
      packages: physicalPackages,
      donations: cookieShareCount,
      varieties: { ...allocation.varieties },
      source: 'SmartBoothDivider'
    });
  });
}

/** Add inventory from Smart Cookie physical transfers (T2G pickup adds, G2T subtracts) */
function addInventory(reconciler: IDataReconciler, scoutDataset: Map<string, Scout>): void {
  reconciler.transfers.forEach((transfer: Transfer) => {
    if (!SCOUT_PHYSICAL_CATEGORIES.has(transfer.category)) return;

    // GIRL_PICKUP: scout picks up from troop (+), GIRL_RETURN: scout returns to troop (-)
    const isPickup = transfer.category === TRANSFER_CATEGORY.GIRL_PICKUP;
    const scout = scoutDataset.get(isPickup ? transfer.to : transfer.from);
    if (!scout) return;

    const sign = isPickup ? 1 : -1;
    scout.inventory.total += sign * (transfer.physicalPackages || 0);
    Object.entries(transfer.physicalVarieties).forEach(([variety, count]) => {
      scout.inventory.varieties[variety] = (scout.inventory.varieties[variety] || 0) + sign * count;
    });
  });
}

/** Add all allocations to scout dataset */
function addAllocations(reconciler: IDataReconciler, scoutDataset: Map<string, Scout>): void {
  // Process virtual booth allocations (Type 4: Troop girl delivery)
  processVirtualBoothAllocations(reconciler, scoutDataset);

  // Build girl ID to name mapping (shared by direct ship and booth sales)
  const girlIdToName = buildGirlIdToNameMap(scoutDataset);

  // Process direct ship allocations (Type 3: Troop direct ship)
  processDirectShipAllocations(reconciler, scoutDataset, girlIdToName);

  // Process booth sales allocations (from Smart Booth Divider API)
  processBoothSalesAllocations(reconciler, scoutDataset, girlIdToName);
}

export { addInventory };
export { addAllocations };
