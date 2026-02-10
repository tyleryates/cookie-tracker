// Cookie Share Tracking
// Tracks Cookie Share donations across DC and SC for reconciliation

import { DC_COLUMNS, DC_ORDER_TYPE_STRINGS, DC_PAYMENT_STATUS, SPECIAL_IDENTIFIERS, TRANSFER_CATEGORY } from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { CookieShareTracking, IDataReconciler, Transfer } from '../../types';

/** Build Cookie Share reconciliation tracking */
export function buildCookieShareTracking(reconciler: IDataReconciler): CookieShareTracking {
  const rawDCData = reconciler.metadata.rawDCData || [];

  let dcTotal = 0;
  let dcAutoSync = 0;
  let dcManualEntry = 0;

  // Process Digital Cookie data
  // Skip site orders — booth sale donations are handled by the booth divider
  rawDCData.forEach((row: Record<string, any>) => {
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    if (lastName === SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME) return;

    const orderType = row[DC_COLUMNS.ORDER_TYPE] || '';
    const paymentStatus = row[DC_COLUMNS.PAYMENT_STATUS] || '';
    const donations = parseInt(row[DC_COLUMNS.DONATION], 10) || 0;

    if (donations > 0) {
      dcTotal += donations;

      // Determine if auto-sync or manual entry
      // Auto-sync: Shipped orders OR donation-only with credit card
      // Manual entry: CASH payments OR girl delivery with donation
      const isCreditCard = paymentStatus === DC_PAYMENT_STATUS.CAPTURED;
      const isAutoSync =
        (orderType.includes(DC_ORDER_TYPE_STRINGS.SHIPPED) || orderType === DC_ORDER_TYPE_STRINGS.DONATION) && isCreditCard;

      if (isAutoSync) {
        dcAutoSync += donations;
      } else {
        dcManualEntry += donations;
      }
    }
  });

  // Process Smart Cookie data
  let scTotal = 0;
  let scManualEntries = 0;

  reconciler.transfers.forEach((transfer: Transfer) => {
    // Count all Cookie Share in SC (DC-synced + manual + booth divider)
    if (transfer.varieties?.[COOKIE_TYPE.COOKIE_SHARE]) {
      scTotal += Math.abs(transfer.varieties[COOKIE_TYPE.COOKIE_SHARE]);
    }

    // Track manually-entered COOKIE_SHARE (for reconciliation)
    // Exclude DC-synced (order number starts with 'D') and booth divider generated
    if (
      transfer.type?.includes('COOKIE_SHARE') &&
      !String(transfer.orderNumber || '').startsWith('D') &&
      transfer.category !== TRANSFER_CATEGORY.BOOTH_COOKIE_SHARE
    ) {
      scManualEntries += Math.abs(transfer.packages || 0);
    }
  });

  return {
    digitalCookie: {
      total: dcTotal,
      autoSync: dcAutoSync,
      manualEntry: dcManualEntry
    },
    smartCookie: {
      total: scTotal,
      manualEntries: scManualEntries
    },
    // Reconciled when manual entries match
    reconciled: dcManualEntry === scManualEntries
  };
}
