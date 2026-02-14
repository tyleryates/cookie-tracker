// Scout detail breakdown — expandable content inside each scout row

import type preact from 'preact';
import { ALLOCATION_METHOD, DC_ORDER_STATUS, DISPLAY_STRINGS, ORDER_TYPE } from '../../constants';
import { COOKIE_TYPE, getCookieColor, getCookieDisplayName } from '../../cookie-constants';
import { classifyOrderStatus } from '../../order-classification';
import type { Order, Scout, Varieties } from '../../types';
import { buildVarietyTooltip, formatDate, formatTimeRange, sortVarietiesByOrder } from '../format-utils';
import { DataTable } from './data-table';
import { TooltipCell } from './tooltip-cell';

// ============================================================================
// Internal helpers
// ============================================================================

function getStatusStyle(status: string | undefined): { className: string; text: string } {
  const text = status === DC_ORDER_STATUS.STATUS_DELIVERED ? 'Completed' : status || '';
  switch (classifyOrderStatus(status)) {
    case 'NEEDS_APPROVAL':
      return { className: 'status-error', text: `${text} ⚠️` };
    case 'COMPLETED':
      return { className: 'status-success', text };
    case 'PENDING':
      return { className: 'status-warning', text };
    default:
      return { className: '', text };
  }
}

function formatOnHand(net: number): preact.JSX.Element {
  if (net < 0) return <span class="status-error">- {Math.abs(net)} ⚠️</span>;
  if (net > 0) return <span class="pkg-in">+ {net}</span>;
  return <span class="muted-text">0</span>;
}

// ============================================================================
// Components
// ============================================================================

function InventoryChips({ scout }: { scout: Scout }) {
  const { inventory } = scout;
  const salesVarieties = scout.totals.$salesByVariety || {};

  const varietyEntries = sortVarietiesByOrder(
    Object.entries(inventory.varieties).filter(([variety, count]) => {
      if (variety === COOKIE_TYPE.COOKIE_SHARE) return false;
      const sold = salesVarieties[variety as keyof Varieties] || 0;
      return count > 0 || sold > 0;
    })
  );

  if (varietyEntries.length === 0) return null;

  return (
    <>
      <h5>Inventory on Hand</h5>
      <DataTable columns={['Variety', 'Picked Up', 'Sold', 'On Hand']} className="table-compact inventory-table">
        {varietyEntries.map(([variety]) => {
          const pickedUp = inventory.varieties[variety as keyof Varieties] || 0;
          const sold = salesVarieties[variety as keyof Varieties] || 0;
          const onHand = pickedUp - sold;
          const color = getCookieColor(variety);

          return (
            <tr key={variety}>
              <td>
                {color && (
                  <span
                    class="inventory-chip-dot"
                    style={{ background: color, display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}
                  />
                )}
                {getCookieDisplayName(variety)}
              </td>
              <td>{pickedUp}</td>
              <td>{sold}</td>
              <td>{formatOnHand(onHand)}</td>
            </tr>
          );
        })}
      </DataTable>
      <AllocationDetails scout={scout} />
    </>
  );
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
    datedRows.push({
      date: a.date || '',
      row: (
        <tr key={`vb-${datedRows.length}`}>
          <td>{formatDate(a.date)}</td>
          <td>{DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}</td>
          <td>{detail}</td>
          <PackagesCell varieties={a.varieties} packages={a.packages} />
          <td>{'—'}</td>
        </tr>
      )
    });
  }

  for (const a of bsAllocs) {
    const time = formatTimeRange(a.startTime, a.endTime);
    const detail = a.storeName ? `${a.storeName} (${time})` : time;
    datedRows.push({
      date: a.date || '',
      row: (
        <tr key={`bs-${datedRows.length}`}>
          <td>{formatDate(a.date)}</td>
          <td>{DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}</td>
          <td>{detail}</td>
          <PackagesCell varieties={a.varieties} packages={a.packages} />
          <td>{a.donations || '—'}</td>
        </tr>
      )
    });
  }

  datedRows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  // DS rows first, then dated rows sorted newest-first
  const rows: preact.JSX.Element[] = dsAllocs.map((a, i) => (
    <tr key={`ds-${i}`}>
      <td class="muted-text">—</td>
      <td>{DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}</td>
      <td>SC direct ship divider allocation</td>
      <PackagesCell varieties={a.varieties} packages={a.packages} />
      <td>{'—'}</td>
    </tr>
  ));
  for (const { row } of datedRows) rows.push(row);

  return (
    <div class="section-break">
      <h5>Credit Details</h5>
      <div class="section-break-sm">
        <DataTable columns={['Date', 'Type', 'Detail', 'Packages', 'Donations']} className="table-compact">
          {rows}
        </DataTable>
      </div>
    </div>
  );
}

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

const PAYMENT_LABELS: Record<string, string> = { CREDIT_CARD: 'Credit Card', VENMO: 'Venmo', CASH: 'Cash' };

function OrdersTable({ scout }: { scout: Scout }) {
  return (
    <div class="section-break">
      <h5>Order Details</h5>
      <div class="section-break-sm">
        <DataTable columns={['Date', 'Order #', 'Packages', 'Amount', 'Type', 'Payment', 'Status']} className="table-compact">
          {scout.orders.map((order: Order) => {
            const tip = buildVarietyTooltip(order.varieties);
            const paymentDisplay = order.paymentMethod
              ? PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod
              : order.paymentStatus || '-';
            const { className: statusClass, text: statusText } = getStatusStyle(order.status);
            const involvesPhysicalCookies = order.orderType !== ORDER_TYPE.DIRECT_SHIP && order.orderType !== ORDER_TYPE.DONATION;
            const totalPackages = order.physicalPackages + order.donations;

            return (
              <tr key={order.orderNumber}>
                <td>{formatDate(order.date)}</td>
                <td>{String(order.orderNumber)}</td>
                {tip ? (
                  <TooltipCell tooltip={tip}>
                    {totalPackages}
                    {!involvesPhysicalCookies && <span class="note-text"> (no inv)</span>}
                  </TooltipCell>
                ) : (
                  <td>
                    {totalPackages}
                    {!involvesPhysicalCookies && <span class="note-text"> (no inv)</span>}
                  </td>
                )}
                <td>${Math.round(order.amount)}</td>
                {(() => {
                  const orderTip = buildOrderTooltip(order);
                  const typeText = String(order.dcOrderType || '-');
                  return orderTip ? <TooltipCell tooltip={orderTip}>{typeText}</TooltipCell> : <td>{typeText}</td>;
                })()}
                <td>{paymentDisplay}</td>
                <td class={statusClass}>{String(statusText)}</td>
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
      {!scout.isSiteOrder && <InventoryChips scout={scout} />}
      <OrdersTable scout={scout} />
    </div>
  );
}
