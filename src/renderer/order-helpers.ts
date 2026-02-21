// Shared order display helpers — status styling, tooltips, name formatting

import { DC_COLUMNS, ORDER_STATUS_CLASS, PAYMENT_METHOD } from '../constants';
import { classifyOrderStatus } from '../order-classification';
import type { Order } from '../types';

export function getPaymentStyles(paymentMethod: string | null | undefined) {
  const isCash = paymentMethod === PAYMENT_METHOD.CASH;
  const isDigital = paymentMethod === PAYMENT_METHOD.CREDIT_CARD || paymentMethod === PAYMENT_METHOD.VENMO;
  return {
    amountClass: isCash ? 'cash-amount' : isDigital ? 'digital-amount' : '',
    pillClass: isCash ? 'payment-pill payment-pill-cash' : isDigital ? 'payment-pill payment-pill-digital' : ''
  };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getStatusStyle(status: string | undefined): { className: string; text: string } {
  switch (classifyOrderStatus(status)) {
    case ORDER_STATUS_CLASS.NEEDS_APPROVAL:
      return { className: 'status-pill status-pill-error', text: 'Awaiting Approval' };
    case ORDER_STATUS_CLASS.COMPLETED:
      return { className: 'status-pill status-pill-success', text: 'Completed' };
    case ORDER_STATUS_CLASS.PENDING:
      return { className: 'status-pill status-pill-warning', text: 'Pending' };
    default:
      return { className: '', text: status || '' };
  }
}

export function isActionRequired(status: string | undefined): boolean {
  const s = classifyOrderStatus(status);
  return s === ORDER_STATUS_CLASS.NEEDS_APPROVAL || s === ORDER_STATUS_CLASS.PENDING;
}

/** Extract customer name from DC metadata for tooltip display */
export function buildOrderTooltip(order: Order): string {
  const dc = order.metadata.dc as Record<string, string> | null;
  if (!dc) return '';
  const shipFirst = dc[DC_COLUMNS.SHIPPING_FIRST_NAME] || '';
  const shipLast = dc[DC_COLUMNS.SHIPPING_LAST_NAME] || '';
  const shipName = `${shipFirst} ${shipLast}`.trim();
  if (shipName) return titleCase(shipName);
  const billFirst = dc[DC_COLUMNS.BILLING_FIRST_NAME] || '';
  const billLast = dc[DC_COLUMNS.BILLING_LAST_NAME] || '';
  const billName = `${billFirst} ${billLast}`.trim();
  return billName ? titleCase(billName) : '';
}
