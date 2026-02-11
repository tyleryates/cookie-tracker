// Scout detail breakdown — expandable content inside each scout row

import type preact from 'preact';
import { ALLOCATION_METHOD, DISPLAY_STRINGS, ORDER_TYPE } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import type { Order, Scout, Varieties } from '../../types';
import { buildVarietyTooltip, classifyOrderStatus, formatDate, getCompleteVarieties, sortVarietiesByOrder } from '../format-utils';
import { DataTable } from './data-table';
import { TooltipCell } from './tooltip-cell';

// ============================================================================
// Internal helpers
// ============================================================================

function getStatusStyle(status: string | undefined): { className: string; text: string } {
  const text = status === 'Status Delivered' ? 'Completed' : status || '';
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
  const salesVarieties = (scout.totals.$salesByVariety || {}) as Record<string, number>;
  const shippedVarieties = (scout.totals.$shippedByVariety || {}) as Record<string, number>;
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
          const sold = salesVarieties[variety] || 0;
          const shipped = shippedVarieties[variety] || 0;
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
function PackagesCell({ varieties, packages }: { varieties: Record<string, number>; packages: number }) {
  const tip = buildVarietyTooltip(varieties);
  return tip ? <TooltipCell tooltip={tip}>{packages}</TooltipCell> : <td>{packages}</td>;
}

function AllocationDetails({ scout }: { scout: Scout }) {
  const { virtualBooth: vbTotals, directShip: dsTotals, booth: bsTotals } = scout.totals.$allocationSummary;
  const sections: preact.JSX.Element[] = [];

  // Virtual booth allocations
  const vbAllocs = scout.$allocationsByChannel.virtualBooth;
  if (vbAllocs.length > 0) {
    sections.push(
      <AllocationSection
        key="vb"
        method={ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER}
        packages={vbTotals.packages}
        donations={vbTotals.donations}
        columns={['Order #', 'Date', 'From', 'Packages', 'Amount']}
      >
        {vbAllocs.map((a, i) => (
          <tr key={i}>
            <td>{String(a.orderNumber || '-')}</td>
            <td>{formatDate(a.date)}</td>
            <td>{String(a.from || '-')}</td>
            <PackagesCell varieties={a.varieties as Record<string, number>} packages={a.packages} />
            <td>${Math.round(a.amount || 0)}</td>
          </tr>
        ))}
      </AllocationSection>
    );
  }

  // Direct ship allocations
  const dsAllocs = scout.$allocationsByChannel.directShip;
  if (dsAllocs.length > 0) {
    sections.push(
      <AllocationSection
        key="ds"
        method={ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER}
        packages={dsTotals.packages}
        donations={dsTotals.donations}
        columns={['Source', 'Packages']}
      >
        {dsAllocs.map((a, i) => (
          <tr key={i}>
            <td>SC Direct Ship Divider</td>
            <PackagesCell varieties={a.varieties as Record<string, number>} packages={a.packages} />
          </tr>
        ))}
        <p class="note-text">Note: The Smart Cookie Direct Ship Divider API does not provide per-order breakdowns.</p>
      </AllocationSection>
    );
  }

  // Booth sales allocations
  const bsAllocs = scout.$allocationsByChannel.booth;
  if (bsAllocs.length > 0) {
    sections.push(
      <AllocationSection
        key="bs"
        method={ALLOCATION_METHOD.BOOTH_SALES_DIVIDER}
        packages={bsTotals.packages}
        donations={bsTotals.donations}
        columns={['Store', 'Date', 'Time', 'Packages', 'Donations']}
      >
        {bsAllocs.map((a, i) => {
          const time = a.startTime && a.endTime ? `${a.startTime} - ${a.endTime}` : a.startTime || '-';
          return (
            <tr key={i}>
              <td>{String(a.storeName || '-')}</td>
              <td>{formatDate(a.date)}</td>
              <td>{time}</td>
              <PackagesCell varieties={a.varieties as Record<string, number>} packages={a.packages} />
              <td>{a.donations || '—'}</td>
            </tr>
          );
        })}
      </AllocationSection>
    );
  }

  if (sections.length === 0) return null;
  return (
    <div class="section-break">
      <h5>Allocation Details</h5>
      {sections}
    </div>
  );
}

/** Shared wrapper for allocation sections — renders header with package/donation counts and a DataTable */
function AllocationSection({
  method,
  packages,
  donations,
  columns,
  children
}: {
  method: string;
  packages: number;
  donations: number;
  columns: string[];
  children: preact.ComponentChildren;
}) {
  const pkg = packages || 0;
  const don = donations || 0;
  const label = don > 0 ? `${pkg} pkg, ${don} Donations` : `${pkg} pkg`;
  return (
    <div class="section-break-sm">
      <h6 class="section-subheader">
        {DISPLAY_STRINGS[method as keyof typeof DISPLAY_STRINGS]} ({label})
      </h6>
      <DataTable columns={columns} className="table-compact">
        {children}
      </DataTable>
    </div>
  );
}

const PAYMENT_LABELS: Record<string, string> = { CREDIT_CARD: 'Credit Card', VENMO: 'Venmo', CASH: 'Cash' };

function OrdersTable({ scout }: { scout: Scout }) {
  return (
    <div class="section-break">
      <h5>Orders ({scout.orders.length})</h5>
      <div class="section-break-sm">
        <DataTable columns={['Order #', 'Date', 'Packages', 'Amount', 'Type', 'Payment', 'Status']} className="table-compact">
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
                <td>{String(order.orderNumber)}</td>
                <td>{formatDate(order.date)}</td>
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
