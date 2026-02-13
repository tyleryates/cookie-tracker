// Package Totals Calculations
// Computes transfer-based inventory metrics (C2T pickups, T2G allocations, G2T returns).
// Customer sales totals come from scout data, not from this module.

import { TRANSFER_CATEGORY, TRANSFER_TYPE } from '../../constants';
import type { Transfer } from '../../types';

interface PackageTotals {
  c2tReceived: number;
  t2tOut: number;
  allocated: number;
  virtualBoothT2G: number;
  boothDividerT2G: number;
  directShip: number;
  g2t: number;
}

/** Maps transfer categories to the PackageTotals field they accumulate into */
const CATEGORY_TO_FIELD: Partial<Record<string, keyof PackageTotals>> = {
  [TRANSFER_CATEGORY.COUNCIL_TO_TROOP]: 'c2tReceived',
  [TRANSFER_CATEGORY.TROOP_OUTGOING]: 't2tOut',
  [TRANSFER_CATEGORY.GIRL_RETURN]: 'g2t',
  [TRANSFER_CATEGORY.GIRL_PICKUP]: 'allocated',
  [TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION]: 'virtualBoothT2G',
  [TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION]: 'boothDividerT2G',
  [TRANSFER_CATEGORY.DIRECT_SHIP]: 'directShip'
};

/** Calculate package totals across all transfers */
function calculatePackageTotals(transfers: Transfer[]): PackageTotals {
  const totals: PackageTotals = {
    c2tReceived: 0,
    t2tOut: 0,
    allocated: 0,
    virtualBoothT2G: 0,
    boothDividerT2G: 0,
    directShip: 0,
    g2t: 0
  };

  for (const transfer of transfers) {
    // PLANNED transfers are pending C2T pickups — don't count toward inventory
    if (transfer.type === TRANSFER_TYPE.PLANNED) continue;
    const field = CATEGORY_TO_FIELD[transfer.category];
    if (field) {
      totals[field] += transfer.physicalPackages || 0;
    }
  }

  return totals;
}

export { calculatePackageTotals };
export type { PackageTotals };
