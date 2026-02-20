// Shared order display helpers — status styling, tooltips, name formatting

import { ORDER_STATUS_CLASS } from '../constants';
import { classifyOrderStatus } from '../order-classification';
import type { Order } from '../types';

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
  const shipFirst = dc['Shipping First Name'] || '';
  const shipLast = dc['Shipping Last Name'] || '';
  const shipName = `${shipFirst} ${shipLast}`.trim();
  if (shipName) return titleCase(shipName);
  const billFirst = dc['Billing First Name'] || '';
  const billLast = dc['Billing Last Name'] || '';
  const billName = `${billFirst} ${billLast}`.trim();
  return billName ? titleCase(billName) : '';
}
