// Order Classification Functions
// Classifies DC order statuses and identifies auto-syncing order types

import { DC_ORDER_STATUS, DC_ORDER_TYPE_STRINGS, DC_PAYMENT_STATUS } from './constants';

type OrderStatusClass = 'NEEDS_APPROVAL' | 'COMPLETED' | 'PENDING' | 'UNKNOWN';

/** Classify a raw DC order status string into a status category */
export function classifyOrderStatus(status: string | undefined): OrderStatusClass {
  if (!status) return 'UNKNOWN';
  if (status.includes(DC_ORDER_STATUS.NEEDS_APPROVAL)) return 'NEEDS_APPROVAL';
  if (
    status === DC_ORDER_STATUS.STATUS_DELIVERED ||
    status.includes(DC_ORDER_STATUS.COMPLETED) ||
    status.includes(DC_ORDER_STATUS.DELIVERED) ||
    status.includes(DC_ORDER_STATUS.SHIPPED)
  )
    return 'COMPLETED';
  if (status.includes(DC_ORDER_STATUS.PENDING) || status.includes(DC_ORDER_STATUS.APPROVED_FOR_DELIVERY)) return 'PENDING';
  return 'UNKNOWN';
}

/** Detect DC orders that auto-sync to Smart Cookie (no manual entry needed) */
export function isDCAutoSync(dcOrderType: string, paymentStatus: string): boolean {
  return (
    (dcOrderType.includes(DC_ORDER_TYPE_STRINGS.SHIPPED) || dcOrderType === DC_ORDER_TYPE_STRINGS.DONATION) &&
    paymentStatus === DC_PAYMENT_STATUS.CAPTURED
  );
}
