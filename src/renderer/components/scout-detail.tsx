// Scout detail breakdown — expandable content inside each scout row

import type preact from 'preact';
import { ALLOCATION_METHOD, DC_ORDER_STATUS, DISPLAY_STRINGS, ORDER_TYPE } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import { classifyOrderStatus } from '../../order-classification';
import type { Order, Scout, Varieties } from '../../types';
import { buildVarietyTooltip, formatDate, formatTimeRange, getCompleteVarieties, sortVarietiesByOrder } from '../format-utils';
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

function calculateVarietyBreakdowns(scout: Scout) {
  const salesVarieties = scout.totals.$salesByVariety || {};
  const shippedVarieties = scout.totals.$shippedByVariety || {};
  let totalDonations = 0;
  scout.orders.forEach((order: Order) => {
    if (order.donations > 0) totalDonations += order.donations;
  });
  return { salesVarieties, shippedVarieties, totalDonations };
}

function formatNetInventory(net: number, isCookieShare: boolean) {
  if (isCookieShare) return { html: <span class="muted-text">N/A</span>, className: '' };
  if (net < 0) return { html: <span class="status-error">{net} ⚠️</span>, className: '' };
  if (net > 0) return { html: <>+{net}</>, className: 'success-text' };
  return { html: <>{'—'}</>, className: '' };
}

function formatCreditedVariety(variety: string, scout: Scout) {
  const { virtualBooth: vb, directShip: ds, booth: bs } = scout.totals.$allocationSummary;
  const vbCount = vb.varieties[variety as keyof Varieties] || 0;
  const dsCount = ds.varieties[variety as keyof Varieties] || 0;
  const bsCount = bs.varieties[variety as keyof Varieties] || 0;
  const total = vbCount + dsCount + bsCount;
  if (total === 0) return <>{'—'}</>;

  const sources: string[] = [];
  if (vbCount > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${vbCount}`);
  if (dsCount > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${dsCount}`);
  if (bsCount > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${bsCount}`);
  return sources.length > 0 ? (
    <TooltipCell tooltip={sources.join('\n')} tag="span">
      {total}
    </TooltipCell>
  ) : (
    total
  );
}

// ============================================================================
// Components
// ============================================================================

function CookieBreakdownTable({ scout }: { scout: Scout }) {
  const { inventory } = scout;
  const { salesVarieties, shippedVarieties, totalDonations } = calculateVarietyBreakdowns(scout);

  const { virtualBooth: vb, directShip: ds, booth: bs } = scout.totals.$allocationSummary;

  const salesWithDonations = { ...salesVarieties };
  const allCreditedDonations = vb.donations + ds.donations + bs.donations;
  if (totalDonations > 0 || allCreditedDonations > 0) {
    salesWithDonations[COOKIE_TYPE.COOKIE_SHARE] = totalDonations + allCreditedDonations;
  }

  const allVarieties = getCompleteVarieties({
    ...salesWithDonations,
    ...shippedVarieties,
    ...inventory.varieties,
    ...vb.varieties,
    ...ds.varieties,
    ...bs.varieties
  });

  return (
    <>
      <h5>
        Cookie Breakdown <span class="note-text">(Direct sales only — does not include booth sales)</span>
      </h5>
      <DataTable columns={['Variety', 'Inventory', 'Delivered', 'Shipped', 'Credited']} className="table-compact">
        {sortVarietiesByOrder(Object.entries(allVarieties)).map(([variety]) => {
          const pickedUp = inventory.varieties[variety as keyof Varieties] || 0;
          const sold = salesVarieties[variety as keyof Varieties] || 0;
          const shipped = shippedVarieties[variety as keyof Varieties] || 0;
          const isCookieShare = variety === COOKIE_TYPE.COOKIE_SHARE;
          const { html: netHtml, className: netClass } = formatNetInventory(pickedUp - sold, isCookieShare);

          return (
            <tr key={variety}>
              <td>
                <strong>{getCookieDisplayName(variety)}</strong>
              </td>
              <td class={netClass}>{netHtml}</td>
              <td>{sold}</td>
              <td>{shipped > 0 ? shipped : '—'}</td>
              <td>{formatCreditedVariety(variety, scout)}</td>
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
  const { virtualBooth: vbTotals, directShip: dsTotals, booth: bsTotals } = scout.totals.$allocationSummary;
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
      <h5>
        Credit Details —{' '}
        {vbTotals.packages + dsTotals.packages + bsTotals.packages + vbTotals.donations + dsTotals.donations + bsTotals.donations} Credits
      </h5>
      <div class="section-break-sm">
        <DataTable columns={['Date', 'Type', 'Detail', 'Packages', 'Donations']} className="table-compact">
          {rows}
        </DataTable>
      </div>
    </div>
  );
}

const PAYMENT_LABELS: Record<string, string> = { CREDIT_CARD: 'Credit Card', VENMO: 'Venmo', CASH: 'Cash' };

function OrdersTable({ scout }: { scout: Scout }) {
  return (
    <div class="section-break">
      <h5>Order Details — {scout.orders.length} Orders</h5>
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
                <td>{String(order.dcOrderType || '-')}</td>
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
      {!scout.isSiteOrder && <CookieBreakdownTable scout={scout} />}
      <OrdersTable scout={scout} />
    </div>
  );
}
