// Cookie Share Tracking
// Tracks Cookie Share donations across DC and SC for reconciliation

import { DC_COLUMNS, SPECIAL_IDENTIFIERS, TRANSFER_CATEGORY } from '../../constants';
import type { ReadonlyDataStore } from '../../data-store';
import { isDCAutoSync } from '../../order-classification';
import type { CookieShareTracking } from '../../types';

/** Build Cookie Share reconciliation tracking */
function buildCookieShareTracking(store: ReadonlyDataStore): CookieShareTracking {
  const rawDCData = store.rawDCData;

  let dcTotal = 0;
  let dcManualEntry = 0;

  // Process Digital Cookie data
  // Skip site orders — booth sale donations are handled by the booth divider
  for (const row of rawDCData) {
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    if (lastName === SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME) continue;

    const orderType = row[DC_COLUMNS.ORDER_TYPE] || '';
    const paymentStatus = row[DC_COLUMNS.PAYMENT_STATUS] || '';
    const donations = parseInt(row[DC_COLUMNS.DONATION], 10) || 0;

    if (donations > 0) {
      dcTotal += donations;

      // Auto-sync: Shipped orders OR donation-only with credit card — these sync automatically, not manual
      if (!isDCAutoSync(orderType, paymentStatus)) {
        dcManualEntry += donations;
      }
    }
  }

  // Process Smart Cookie data — only track manually-entered COOKIE_SHARE (for reconciliation)
  let scManualEntries = 0;

  for (const transfer of store.transfers) {
    // Only count manually-entered COOKIE_SHARE records (exclude DC-synced and booth divider)
    if (
      transfer.category === TRANSFER_CATEGORY.COOKIE_SHARE_RECORD &&
      !String(transfer.orderNumber || '').startsWith(SPECIAL_IDENTIFIERS.DC_ORDER_PREFIX)
    ) {
      scManualEntries += Math.abs(transfer.packages || 0);
    }
  }

  return {
    digitalCookie: {
      total: dcTotal,
      manualEntry: dcManualEntry
    },
    smartCookie: {
      manualEntries: scManualEntries
    },
    // Reconciled when manual entries match
    reconciled: dcManualEntry === scManualEntries
  };
}

export { buildCookieShareTracking };
