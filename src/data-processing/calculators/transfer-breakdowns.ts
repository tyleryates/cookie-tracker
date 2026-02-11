// Transfer Breakdowns
// Pre-classifies transfers into categories (C2T, T2G, G2T) with totals

import { TRANSFER_CATEGORY } from '../../constants';
import type { ReadonlyDataStore } from '../../data-store';
import Logger from '../../logger';
import type { Transfer, TransferBreakdowns, Warning } from '../../types';
import { isKnownTransferType } from '../utils';

/** Build pre-classified transfer lists with totals */
export function buildTransferBreakdowns(reconciler: ReadonlyDataStore, warnings: Warning[]): TransferBreakdowns {
  const seenUnknownTypes = new Set<string>();
  const c2t: Transfer[] = [];
  const t2g: Transfer[] = [];
  const g2t: Transfer[] = [];

  let c2tTotal = 0;
  let t2gPhysicalTotal = 0;
  let g2tTotal = 0;

  reconciler.transfers.forEach((transfer: Transfer) => {
    // Warn on unknown transfer types (deduplicated by type string)
    if (transfer.type && !isKnownTransferType(transfer.type) && !seenUnknownTypes.has(transfer.type)) {
      seenUnknownTypes.add(transfer.type);
      Logger.warn(`Unknown Smart Cookie transfer type "${transfer.type}" — update TRANSFER_TYPE in constants.ts`);
      warnings.push({
        type: 'UNKNOWN_TRANSFER_TYPE',
        message: `Unknown transfer type "${transfer.type}"`,
        orderNumber: transfer.orderNumber,
        reason: transfer.type
      });
    }

    // Classify into lists using central category groups
    if (transfer.category === TRANSFER_CATEGORY.COUNCIL_TO_TROOP) {
      c2t.push(transfer);
      c2tTotal += transfer.physicalPackages || 0;
    } else if (transfer.category === TRANSFER_CATEGORY.GIRL_RETURN) {
      g2t.push(transfer);
      g2tTotal += transfer.physicalPackages || 0;
    }
    if (transfer.category === TRANSFER_CATEGORY.GIRL_PICKUP) {
      t2g.push(transfer);
      t2gPhysicalTotal += transfer.physicalPackages || 0;
    }
  });

  // Sort transfers by date (newest first)
  const sortByDate = (a: Transfer, b: Transfer) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateB.getTime() - dateA.getTime();
  };

  c2t.sort(sortByDate);
  t2g.sort(sortByDate);
  g2t.sort(sortByDate);

  return {
    c2t,
    t2g,
    g2t,
    totals: {
      c2t: c2tTotal,
      t2gPhysical: t2gPhysicalTotal,
      g2t: g2tTotal
    }
  };
}
