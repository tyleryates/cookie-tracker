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

  const directShipEntries: SiteOrderEntry[] = [];
  const girlDeliveryEntries: SiteOrderEntry[] = [];
  const boothSaleEntries: SiteOrderEntry[] = [];

  // Classify site orders by type, sorted by date ascending for FIFO allocation
  if (siteScout) {
    const sortedOrders = [...siteScout.orders].sort(
      (a, b) => (a.date || '').localeCompare(b.date || '') || a.orderNumber.localeCompare(b.orderNumber)
    );

    for (const order of sortedOrders) {
      if (order.orderType === ORDER_TYPE.DONATION) continue;

      const entry: SiteOrderEntry = {
        orderNumber: order.orderNumber,
        packages: order.physicalPackages,
        allocated: 0,
        owner: OWNER.TROOP,
        orderType: order.orderType
      };

      if (order.orderType === ORDER_TYPE.DIRECT_SHIP) {
        directShipEntries.push(entry);
      } else if (order.orderType === ORDER_TYPE.BOOTH) {
        boothSaleEntries.push(entry);
      } else {
        girlDeliveryEntries.push(entry);
      }
    }
  }

  // Direct ship: try per-order allocation by matching orderId first
  for (const entry of directShipEntries) {
    for (const alloc of store.allocations) {
      if (alloc.channel !== ALLOCATION_CHANNEL.DIRECT_SHIP) continue;
      if (alloc.orderId === entry.orderNumber || alloc.orderId === `D${entry.orderNumber}`) {
        entry.allocated += alloc.packages || 0;
      }
    }
  }

  // Fallback: SC API often returns a single divider blob without per-order orderId.
  // If no entries got orderId-based allocation, FIFO from total direct ship pool.
  const hasOrderIdMatches = directShipEntries.some((e) => e.allocated > 0);
  if (!hasOrderIdMatches) {
    let dsPool = 0;
    for (const alloc of store.allocations) {
      if (alloc.channel === ALLOCATION_CHANNEL.DIRECT_SHIP) {
        dsPool += alloc.packages || 0;
      }
    }
    for (const entry of directShipEntries) {
      const consumed = Math.min(entry.packages, dsPool);
      entry.allocated = consumed;
      dsPool -= consumed;
    }
  }

  // Girl delivery: FIFO allocation (oldest first, already sorted by date)
  // Virtual booth divider doesn't track per-order, so we consume from the pool
  // starting with the oldest orders until the allocation is exhausted
  let pool = 0;
  for (const transfer of store.transfers) {
    if (transfer.category === TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION) {
      pool += transfer.physicalPackages || 0;
    }
  }
  for (const entry of girlDeliveryEntries) {
    const consumed = Math.min(entry.packages, pool);
    entry.allocated = consumed;
    pool -= consumed;
  }

  // Calculate category-level allocation totals
  const allocations = calculateAllocations(store);

  return {
    directShip: buildCategory(directShipEntries, allocations.directShip),
    girlDelivery: buildCategory(girlDeliveryEntries, allocations.virtualBooth),
    boothSale: buildCategory(boothSaleEntries, allocations.boothSales)
  };
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
