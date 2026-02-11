// Site Orders Processing
// Handles troop booth sale orders and allocation tracking

import { ORDER_TYPE, OWNER, TRANSFER_CATEGORY } from '../../constants';
import type { Order, Scout, SiteOrderEntry, SiteOrdersDataset, Transfer } from '../../types';
import type { DataStore } from '../../data-store';

/** Build site orders dataset with allocation tracking */
function buildSiteOrdersDataset(reconciler: DataStore, scoutDataset: Map<string, Scout>): SiteOrdersDataset {
  // Find site scout from pre-classified scout data
  let siteScout: Scout | null = null;
  scoutDataset.forEach((s: Scout) => {
    if (s.isSiteOrder) siteScout = s;
  });

  const siteOrdersByType: { directShip: SiteOrderEntry[]; girlDelivery: SiteOrderEntry[]; boothSale: SiteOrderEntry[] } = {
    directShip: [],
    girlDelivery: [],
    boothSale: []
  };

  // Classify site orders by type
  if (siteScout) {
    siteScout.orders.forEach((order: Order) => {
      if (order.orderType === ORDER_TYPE.DONATION) return;

      const entry = {
        orderNumber: order.orderNumber,
        packages: order.physicalPackages,
        owner: OWNER.TROOP,
        orderType: order.orderType
      };

      if (order.orderType === ORDER_TYPE.DIRECT_SHIP) {
        siteOrdersByType.directShip.push(entry);
      } else if (order.orderType === ORDER_TYPE.BOOTH) {
        siteOrdersByType.boothSale.push(entry);
      } else {
        siteOrdersByType.girlDelivery.push(entry);
      }
    });
  }

  // Calculate allocation totals
  const allocations = calculateAllocations(reconciler);

  // Build site order summary with allocation tracking
  const totalDirectShip = siteOrdersByType.directShip.reduce((sum: number, o: SiteOrderEntry) => sum + o.packages, 0);
  const totalGirlDelivery = siteOrdersByType.girlDelivery.reduce((sum: number, o: SiteOrderEntry) => sum + o.packages, 0);
  const totalBoothSale = siteOrdersByType.boothSale.reduce((sum: number, o: SiteOrderEntry) => sum + o.packages, 0);

  const result: SiteOrdersDataset = {
    directShip: {
      orders: siteOrdersByType.directShip,
      total: totalDirectShip,
      allocated: allocations.directShip,
      unallocated: Math.max(0, totalDirectShip - allocations.directShip),
      hasWarning: totalDirectShip - allocations.directShip > 0
    },
    girlDelivery: {
      orders: siteOrdersByType.girlDelivery,
      total: totalGirlDelivery,
      allocated: allocations.virtualBooth,
      unallocated: Math.max(0, totalGirlDelivery - allocations.virtualBooth),
      hasWarning: totalGirlDelivery - allocations.virtualBooth > 0
    },
    boothSale: {
      orders: siteOrdersByType.boothSale,
      total: totalBoothSale,
      allocated: allocations.boothSales,
      unallocated: Math.max(0, totalBoothSale - allocations.boothSales),
      hasWarning: totalBoothSale - allocations.boothSales > 0
    }
  };

  // Set flag for scout-summary to control site row display and warning
  if (siteScout) {
    siteScout.$hasUnallocatedSiteOrders = result.directShip.hasWarning || result.girlDelivery.hasWarning || result.boothSale.hasWarning;
  }

  return result;
}

/** Calculate total allocated packages by type */
function calculateAllocations(reconciler: DataStore): { directShip: number; virtualBooth: number; boothSales: number } {
  let directShip = 0;
  let virtualBooth = 0;
  let boothSales = 0;

  // Direct ship allocations
  if (reconciler.directShipAllocations) {
    reconciler.directShipAllocations.forEach((allocation) => {
      directShip += allocation.packages || 0;
    });
  }

  // Virtual booth allocations (T2G transfers)
  reconciler.transfers.forEach((transfer: Transfer) => {
    if (transfer.category === TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION) {
      virtualBooth += transfer.packages || 0;
    }
  });

  // Booth sales allocations
  if (reconciler.boothSalesAllocations) {
    reconciler.boothSalesAllocations.forEach((allocation) => {
      boothSales += allocation.packages || 0;
    });
  }

  return { directShip, virtualBooth, boothSales };
}

export { buildSiteOrdersDataset };
