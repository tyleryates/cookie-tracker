// Site Orders Processing
// Handles troop booth sale orders and allocation tracking

import { ALLOCATION_CHANNEL, ORDER_TYPE, OWNER, TRANSFER_CATEGORY } from '../../constants';
import type { ReadonlyDataStore } from '../../data-store';
import type { Scout, SiteOrderCategory, SiteOrderEntry, SiteOrdersDataset } from '../../types';

/** Build site orders dataset with allocation tracking */
function buildSiteOrdersDataset(store: ReadonlyDataStore, scoutDataset: Record<string, Scout>): SiteOrdersDataset {
  // Find site scout from pre-classified scout data
  let siteScout: Scout | null = null;
  for (const s of Object.values(scoutDataset)) {
    if (s.isSiteOrder) {
      siteScout = s;
      break;
    }
  }

  const siteOrdersByType: { directShip: SiteOrderEntry[]; girlDelivery: SiteOrderEntry[]; boothSale: SiteOrderEntry[] } = {
    directShip: [],
    girlDelivery: [],
    boothSale: []
  };

  // Classify site orders by type
  if (siteScout) {
    for (const order of siteScout.orders) {
      if (order.orderType === ORDER_TYPE.DONATION) continue;

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
    }
  }

  // Calculate allocation totals
  const allocations = calculateAllocations(store);

  // Build site order summary with allocation tracking
  const result: SiteOrdersDataset = {
    directShip: buildCategory(siteOrdersByType.directShip, allocations.directShip),
    girlDelivery: buildCategory(siteOrdersByType.girlDelivery, allocations.virtualBooth),
    boothSale: buildCategory(siteOrdersByType.boothSale, allocations.boothSales)
  };

  return result;
}

function buildCategory(orders: SiteOrderEntry[], allocated: number): SiteOrderCategory {
  const total = orders.reduce((sum, o) => sum + o.packages, 0);
  return {
    orders,
    total,
    allocated,
    unallocated: Math.max(0, total - allocated),
    hasWarning: total > allocated
  };
}

/** Calculate total allocated packages by type */
function calculateAllocations(store: ReadonlyDataStore): { directShip: number; virtualBooth: number; boothSales: number } {
  let directShip = 0;
  let virtualBooth = 0;
  let boothSales = 0;

  // Imported allocations (booth + direct ship from divider APIs)
  for (const allocation of store.allocations) {
    if (allocation.channel === ALLOCATION_CHANNEL.DIRECT_SHIP) {
      directShip += allocation.packages || 0;
    } else if (allocation.channel === ALLOCATION_CHANNEL.BOOTH) {
      boothSales += allocation.packages || 0;
    }
  }

  // Virtual booth allocations (T2G transfers)
  for (const transfer of store.transfers) {
    if (transfer.category === TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION) {
      virtualBooth += transfer.packages || 0;
    }
  }

  return { directShip, virtualBooth, boothSales };
}

export { buildSiteOrdersDataset };
