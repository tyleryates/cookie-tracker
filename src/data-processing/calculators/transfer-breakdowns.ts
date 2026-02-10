// Transfer Breakdowns
// Pre-classifies transfers into categories (C2T, T2G, sold) with totals

import { TRANSFER_CATEGORY } from '../../constants';
import Logger from '../../logger';
import type { IDataReconciler, Transfer, TransferBreakdowns, Warning } from '../../types';
import { isKnownTransferType } from '../utils';

/** Build pre-classified transfer lists with totals */
export function buildTransferBreakdowns(reconciler: IDataReconciler, warnings: Warning[]): TransferBreakdowns {
  const seenUnknownTypes = new Set<string>();
  const c2t: Transfer[] = [];
  const t2g: Transfer[] = [];
  const g2t: Transfer[] = [];
  const sold: Transfer[] = [];

  let c2tTotal = 0;
  let t2gPhysicalTotal = 0;
  let g2tTotal = 0;
  let soldTotal = 0;

  reconciler.transfers.forEach((transfer: Transfer) => {
    const packages = transfer.packages || 0;

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

    switch (transfer.category) {
      case TRANSFER_CATEGORY.COUNCIL_TO_TROOP:
        c2t.push(transfer);
        c2tTotal += packages;
        break;

      case TRANSFER_CATEGORY.GIRL_RETURN:
        g2t.push(transfer);
        g2tTotal += transfer.physicalPackages || 0;
        break;

      // T2G categories — all go into t2g list; sale categories also go into sold
      case TRANSFER_CATEGORY.GIRL_PICKUP:
        t2g.push(transfer);
        t2gPhysicalTotal += transfer.physicalPackages || 0;
        sold.push(transfer);
        soldTotal += packages;
        break;

      case TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION:
      case TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION:
      case TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION:
        t2g.push(transfer);
        sold.push(transfer);
        soldTotal += packages;
        break;

      case TRANSFER_CATEGORY.DIRECT_SHIP:
        sold.push(transfer);
        soldTotal += packages;
        break;

      // DC_ORDER_RECORD, COOKIE_SHARE_RECORD: sync records, NOT counted as sold
      // PLANNED: future orders, NOT counted as sold
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
  sold.sort(sortByDate);

  return {
    c2t,
    t2g,
    g2t,
    sold,
    totals: {
      c2t: c2tTotal,
      t2gPhysical: t2gPhysicalTotal,
      g2t: g2tTotal,
      sold: soldTotal
    }
  };
}
