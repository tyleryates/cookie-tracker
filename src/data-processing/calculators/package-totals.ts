// Package Totals Calculations
// Calculates troop-wide package totals across all sources

import { DC_COLUMNS, ORDER_TYPE, SALE_CATEGORIES, SPECIAL_IDENTIFIERS, TRANSFER_CATEGORY } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { PackageTotals, Transfer } from '../../types';
import { classifyDCOrder } from './order-processing';

/** Calculate package totals across all transfers and orders */
function calculatePackageTotals(transfers: Transfer[], rawDCData: Record<string, any>[]): PackageTotals {
  let totalSold = 0;
  let totalRevenue = 0;
  let totalOrdered = 0; // C2T pickups (excluding Cookie Share)
  let totalAllocated = 0; // Physical T2G only (scouts physically picked up)
  let totalVirtualBoothT2G = 0; // Virtual booth T2G (site orders allocated to scouts)
  let totalBoothDividerT2G = 0; // Booth divider T2G (booth sales allocated to scouts)
  let totalDirectShipDividerT2G = 0; // Direct ship divider T2G (troop direct ship allocated to scouts)
  let totalDonations = 0; // Cookie Share (virtual donations)
  let totalDirectShip = 0; // Direct ship orders (shipped from supplier, not troop inventory)
  let totalG2T = 0; // Girl to Troop returns (inventory back to troop)

  transfers.forEach((transfer: Transfer) => {
    const packages = transfer.packages || 0;
    const amount = transfer.amount || 0;

    // Per-category counters
    switch (transfer.category) {
      case TRANSFER_CATEGORY.COUNCIL_TO_TROOP:
        totalOrdered += transfer.physicalPackages || 0;
        break;
      case TRANSFER_CATEGORY.GIRL_RETURN:
        totalG2T += transfer.physicalPackages || 0;
        break;
      case TRANSFER_CATEGORY.GIRL_PICKUP:
        totalAllocated += transfer.physicalPackages || 0;
        break;
      case TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION:
        totalVirtualBoothT2G += transfer.physicalPackages || 0;
        break;
      case TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION:
        totalBoothDividerT2G += transfer.physicalPackages || 0;
        break;
      case TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION:
        totalDirectShipDividerT2G += transfer.physicalPackages || 0;
        break;
      case TRANSFER_CATEGORY.DIRECT_SHIP:
        totalDirectShip += packages;
        break;
    }

    // Common: all sale categories contribute to sold and revenue
    if (SALE_CATEGORIES.has(transfer.category)) {
      totalSold += packages;
      totalRevenue += amount;
    }

    // Count Cookie Share donations
    if (transfer.varieties?.[COOKIE_TYPE.COOKIE_SHARE]) {
      totalDonations += transfer.varieties[COOKIE_TYPE.COOKIE_SHARE];
    }
  });

  // Calculate site orders physical packages (booth sales from troop stock)
  const siteOrdersPhysical = calculateSiteOrdersPhysical(rawDCData);

  return {
    sold: totalSold,
    revenue: totalRevenue,
    ordered: totalOrdered,
    allocated: totalAllocated,
    virtualBoothT2G: totalVirtualBoothT2G,
    boothDividerT2G: totalBoothDividerT2G,
    directShipDividerT2G: totalDirectShipDividerT2G,
    donations: totalDonations,
    directShip: totalDirectShip,
    siteOrdersPhysical: siteOrdersPhysical,
    g2t: totalG2T
  };
}

/** Calculate physical packages from site orders */
function calculateSiteOrdersPhysical(rawDCData: Record<string, any>[]): number {
  let total = 0;

  rawDCData.forEach((row: Record<string, any>) => {
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    if (lastName !== SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME) return;

    const dcOrderType = row[DC_COLUMNS.ORDER_TYPE] || '';
    const classified = classifyDCOrder(true, dcOrderType);

    const totalPkgs = parseInt(row[DC_COLUMNS.TOTAL_PACKAGES], 10) || 0;
    const refundedPkgs = parseInt(row[DC_COLUMNS.REFUNDED_PACKAGES], 10) || 0;
    const packages = totalPkgs - refundedPkgs;
    const donations = parseInt(row[DC_COLUMNS.DONATION], 10) || 0;
    const physicalPackages = packages - donations;

    // Only count orders that use troop stock (DELIVERY and BOOTH, not DIRECT_SHIP or DONATION)
    if (classified.orderType === ORDER_TYPE.DELIVERY || classified.orderType === ORDER_TYPE.BOOTH) {
      total += physicalPackages;
    }
  });

  return total;
}

export { calculatePackageTotals };
