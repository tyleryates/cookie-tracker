// Package Totals Calculations
// Computes transfer-based inventory metrics (C2T pickups, T2G allocations, G2T returns).
// Customer sales totals come from scout data, not from this module.

import { TRANSFER_CATEGORY } from '../../constants';
import type { Transfer } from '../../types';

interface PackageTotals {
  ordered: number;
  allocated: number;
  virtualBoothT2G: number;
  boothDividerT2G: number;
  donations: number;
  directShip: number;
  g2t: number;
}

/** Calculate package totals across all transfers */
function calculatePackageTotals(transfers: Transfer[]): PackageTotals {
  let totalOrdered = 0; // C2T pickups (excluding Cookie Share)
  let totalAllocated = 0; // Physical T2G only (scouts physically picked up)
  let totalVirtualBoothT2G = 0; // Virtual booth T2G (site orders allocated to scouts)
  let totalBoothDividerT2G = 0; // Booth divider T2G (booth sales allocated to scouts)
  let totalDirectShip = 0; // Direct ship orders (shipped from supplier, not troop inventory)
  let totalG2T = 0; // Girl to Troop returns (inventory back to troop)

  transfers.forEach((transfer: Transfer) => {
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
      case TRANSFER_CATEGORY.DIRECT_SHIP:
        totalDirectShip += transfer.physicalPackages || 0;
        break;
    }
  });

  return {
    ordered: totalOrdered,
    allocated: totalAllocated,
    virtualBoothT2G: totalVirtualBoothT2G,
    boothDividerT2G: totalBoothDividerT2G,
    donations: 0, // Computed from scout orders in troop-totals.ts (SC transfers incomplete)
    directShip: totalDirectShip,
    g2t: totalG2T
  };
}

export { calculatePackageTotals };
