// Scout detail breakdown — expandable content inside each scout row

import type preact from 'preact';
import { ALLOCATION_METHOD, DISPLAY_STRINGS, ORDER_TYPE, PAYMENT_METHOD } from '../../constants';
import { classifyOrderStatus } from '../../order-classification';
import type { Order, Scout, Varieties } from '../../types';
import { buildVarietyTooltip, formatShortDate, formatTimeRange } from '../format-utils';
import { DataTable } from './data-table';
import { TooltipCell } from './tooltip-cell';

// ============================================================================
// Internal helpers
// ============================================================================

function getStatusStyle(status: string | undefined): { className: string; text: string } {
  switch (classifyOrderStatus(status)) {
    case 'NEEDS_APPROVAL':
      return { className: 'status-pill status-pill-error', text: 'Needs Approval ⚠️' };
    case 'COMPLETED':
      return { className: 'status-pill status-pill-success', text: 'Complete' };
    case 'PENDING':
      return { className: 'status-pill status-pill-warning', text: 'Approved' };
    default:
      return { className: '', text: status || '' };
  }
}

// ============================================================================
// Components
// ============================================================================

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildOrderTooltip(order: Order): string {
  const dc = order.metadata.dc as Record<string, string> | null;
  if (!dc) return '';
  const lines: string[] = [];

  const shipFirst = dc['Shipping First Name'] || '';
  const shipLast = dc['Shipping Last Name'] || '';
  const shipName = `${shipFirst} ${shipLast}`.trim();
  if (shipName) lines.push(titleCase(shipName));

  // Fall back to billing name if no shipping name (e.g. donations)
  if (!shipName) {
    const billFirst = dc['Billing First Name'] || '';
    const billLast = dc['Billing Last Name'] || '';
    const billName = `${billFirst} ${billLast}`.trim();
    if (billName) lines.push(titleCase(billName));
  }

  return lines.join('\n');
}

/** Render a packages cell with variety tooltip if available */
function PackagesCell({ varieties, packages }: { varieties: Varieties; packages: number }) {
  const tip = buildVarietyTooltip(varieties);
  return tip ? <TooltipCell tooltip={tip}>{packages}</TooltipCell> : <td>{packages}</td>;
}

function AllocationDetails({ scout }: { scout: Scout }) {
  const vbAllocs = scout.$allocationsByChannel.virtualBooth;
  const dsAllocs = scout.$allocationsByChannel.directShip;
  const bsAllocs = scout.$allocationsByChannel.booth;

  if (vbAllocs.length === 0 && dsAllocs.length === 0 && bsAllocs.length === 0) return null;

  // Collect dated rows (VB + Booth), sort newest first
  const datedRows: Array<{ date: string; row: preact.JSX.Element }> = [];

  for (const a of vbAllocs) {
    const detail = a.orderNumber ? `#${a.orderNumber} from ${a.from || '-'}` : String(a.from || '-');
    const credits = a.packages + (a.donations || 0);
    datedRows.push({
      date: a.date || '',
      row: (
        <tr key={`vb-${datedRows.length}`}>
          <td>{formatShortDate(a.date)}</td>
          <td>{DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}</td>
          <td>{detail}</td>
          <PackagesCell varieties={a.varieties} packages={credits} />
        </tr>
      )
    });
  }

  for (const a of bsAllocs) {
    const time = formatTimeRange(a.startTime, a.endTime);
    const detail = a.storeName ? `${a.storeName} (${time})` : time;
    const credits = a.packages + (a.donations || 0);
    datedRows.push({
      date: a.date || '',
      row: (
        <tr key={`bs-${datedRows.length}`}>
          <td>{formatShortDate(a.date)}</td>
          <td>{DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}</td>
          <td>{detail}</td>
          <PackagesCell varieties={a.varieties} packages={credits} />
        </tr>
      )
    });
  }

  datedRows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  // DS rows first, then dated rows sorted newest-first
  const rows: preact.JSX.Element[] = dsAllocs.map((a, i) => {
    const credits = a.packages + (a.donations || 0);
    return (
      <tr key={`ds-${i}`}>
        <td class="muted-text">{'\u2014'}</td>
        <td>{DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}</td>
        <td>SC direct ship divider allocation</td>
        <PackagesCell varieties={a.varieties} packages={credits} />
      </tr>
    );
  });
  for (const { row } of datedRows) rows.push(row);

  return (
    <div class="section-break">
      <h5>Credit Details</h5>
      <div class="section-break-sm">
        <DataTable columns={['Date', 'Type', 'Detail', 'Credits']} className="table-compact">
          {rows}
        </DataTable>
      </div>
    </div>
  );
}

function OrdersTable({ scout }: { scout: Scout }) {
  const orders = scout.orders.filter((o) => o.orderType !== ORDER_TYPE.DONATION);

  if (orders.length === 0) return null;

  return (
    <div class="section-break">
      <h5>Order Details</h5>
      <div class="section-break-sm">
        <DataTable columns={['Date', 'Order #', 'Type', 'Packages', 'Donations', 'Amount', 'Payment', 'Status']} className="table-compact">
          {orders.map((order: Order) => {
            const tip = buildVarietyTooltip(order.varieties);
            const { className: statusClass, text: statusText } = getStatusStyle(order.status);
            const isCash = order.paymentMethod === PAYMENT_METHOD.CASH;
            const isDigital = order.paymentMethod && order.paymentMethod !== PAYMENT_METHOD.CASH;
            const amountClass = isCash ? 'cash-amount' : isDigital ? 'digital-amount' : undefined;
            const paymentPillClass = isCash
              ? 'payment-pill payment-pill-cash'
              : isDigital
                ? 'payment-pill payment-pill-digital'
                : undefined;

            return (
              <tr key={order.orderNumber}>
                <td>{formatShortDate(order.date)}</td>
                <td>{String(order.orderNumber)}</td>
                {(() => {
                  const orderTip = buildOrderTooltip(order);
                  const typeText = String(order.dcOrderType || '-');
                  return orderTip ? <TooltipCell tooltip={orderTip}>{typeText}</TooltipCell> : <td>{typeText}</td>;
                })()}
                {order.physicalPackages > 0 && tip ? (
                  <TooltipCell tooltip={tip}>{order.physicalPackages}</TooltipCell>
                ) : (
                  <td>{order.physicalPackages || '\u2014'}</td>
                )}
                <td>{order.donations || '\u2014'}</td>
                <td class={amountClass}>${Math.round(order.amount)}</td>
                <td>{paymentPillClass ? <span class={paymentPillClass}>{isCash ? 'Cash' : 'Digital'}</span> : '-'}</td>
                <td>
                  <span class={statusClass}>{statusText}</span>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </div>
    </div>
  );
}

export function ScoutDetailBreakdown({ scout }: { scout: Scout }) {
  return (
    <div class="scout-breakdown">
      <AllocationDetails scout={scout} />
      <OrdersTable scout={scout} />
    </div>
  );
}
