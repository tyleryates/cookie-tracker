// Scout detail breakdown — expandable content inside each scout row

import type preact from 'preact';
import { useState } from 'preact/hooks';
import { ALLOCATION_METHOD, DISPLAY_STRINGS, ORDER_TYPE, PAYMENT_METHOD } from '../../constants';
import type { Order, Scout, Varieties } from '../../types';
import { buildVarietyTooltip, formatShortDate, formatTimeRange } from '../format-utils';
import { buildOrderTooltip, getStatusStyle, isActionRequired } from '../order-helpers';
import { DataTable } from './data-table';
import { TooltipCell } from './tooltip-cell';

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

  // Dated rows sorted newest-first, then DS rows (no date) at the bottom
  const rows: preact.JSX.Element[] = datedRows.map(({ row }) => row);
  for (const [i, a] of dsAllocs.entries()) {
    const credits = a.packages + (a.donations || 0);
    rows.push(
      <tr key={`ds-${i}`}>
        <td class="muted-text">{'\u2014'}</td>
        <td>{DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}</td>
        <td>SC direct ship divider allocation</td>
        <PackagesCell varieties={a.varieties} packages={credits} />
      </tr>
    );
  }

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

const INITIAL_ORDER_LIMIT = 10;

function renderOrderRow(order: Order) {
  const tip = buildVarietyTooltip(order.varieties);
  const { className: statusClass, text: statusText } = getStatusStyle(order.status);
  const isCash = order.paymentMethod === PAYMENT_METHOD.CASH;
  const isDigital = order.paymentMethod && order.paymentMethod !== PAYMENT_METHOD.CASH;
  const amountClass = isCash ? 'cash-amount' : isDigital ? 'digital-amount' : undefined;
  const paymentPillClass = isCash ? 'payment-pill payment-pill-cash' : isDigital ? 'payment-pill payment-pill-digital' : undefined;

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
}

function OrdersTable({ scout }: { scout: Scout }) {
  const orders = scout.orders.filter((o) => o.orderType !== ORDER_TYPE.DONATION);
  const [expanded, setExpanded] = useState(false);

  if (orders.length === 0) return null;

  // Always show action-required orders; fill remaining slots from the rest
  const required = orders.filter((o) => isActionRequired(o.status));
  const rest = orders.filter((o) => !isActionRequired(o.status));
  const minVisible = Math.max(INITIAL_ORDER_LIMIT, required.length);
  const needsTruncation = orders.length > minVisible;
  const visibleOrders = expanded || !needsTruncation ? orders : [...required, ...rest.slice(0, minVisible - required.length)];
  const hiddenCount = orders.length - visibleOrders.length;

  return (
    <div class="section-break">
      <h5>Order Details</h5>
      <div class="section-break-sm">
        <DataTable columns={['Date', 'Order #', 'Type', 'Packages', 'Donations', 'Amount', 'Payment', 'Status']} className="table-compact">
          {visibleOrders.map(renderOrderRow)}
        </DataTable>
        {needsTruncation && !expanded && (
          <button type="button" class="btn-link" style={{ marginTop: '8px' }} onClick={() => setExpanded(true)}>
            Show {hiddenCount} more order{hiddenCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

export function ScoutDetailBreakdown({ scout }: { scout: Scout }) {
  return (
    <div class="scout-breakdown">
      <OrdersTable scout={scout} />
      <AllocationDetails scout={scout} />
    </div>
  );
}
