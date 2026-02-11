// Scout detail breakdown — expandable content inside each scout row

import type preact from 'preact';
import { ALLOCATION_METHOD, DISPLAY_STRINGS, ORDER_TYPE, OWNER } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import { calculateSalesByVariety } from '../../data-processing/calculators/helpers';
import type { Order, Scout, ScoutCredited } from '../../types';
import { DataTable } from './data-table';
import { TooltipCell } from './tooltip-cell';
import {
  buildVarietyTooltip,
  formatDate,
  getCompleteVarieties,
  sortVarietiesByOrder
} from '../format-utils';

// ============================================================================
// Shared helpers (also used by scout-summary.tsx)
// ============================================================================

type OrderStatusClass = 'NEEDS_APPROVAL' | 'COMPLETED' | 'PENDING' | 'UNKNOWN';

export function classifyOrderStatus(status: string | undefined): OrderStatusClass {
  if (!status) return 'UNKNOWN';
  if (status.includes('Needs Approval')) return 'NEEDS_APPROVAL';
  if (status === 'Status Delivered' || status.includes('Completed') || status.includes('Delivered') || status.includes('Shipped')) return 'COMPLETED';
  if (status.includes('Pending') || status.includes('Approved for Delivery')) return 'PENDING';
  return 'UNKNOWN';
}

// ============================================================================
// Internal helpers
// ============================================================================

function getStatusStyle(status: string | undefined): { className: string; text: string } {
  const text = status === 'Status Delivered' ? 'Completed' : status || '';
  switch (classifyOrderStatus(status)) {
    case 'NEEDS_APPROVAL': return { className: 'status-error', text: `${text} ⚠️` };
    case 'COMPLETED': return { className: 'status-success', text };
    case 'PENDING': return { className: 'status-warning', text };
    default: return { className: '', text };
  }
}

function calculateVarietyBreakdowns(scout: Scout) {
  const salesVarieties = calculateSalesByVariety(scout) as Record<string, number>;
  const shippedVarieties: Record<string, number> = {};
  let totalDonations = 0;

  scout.orders.forEach((order: Order) => {
    if (order.donations > 0) totalDonations += order.donations;
    if (order.owner === OWNER.GIRL && order.orderType === ORDER_TYPE.DIRECT_SHIP) {
      (Object.entries(order.varieties) as [string, number][]).forEach(([variety, count]) => {
        if (variety !== COOKIE_TYPE.COOKIE_SHARE) shippedVarieties[variety] = (shippedVarieties[variety] || 0) + count;
      });
    }
  });
  return { salesVarieties, shippedVarieties, totalDonations };
}

function formatNetInventory(net: number, isCookieShare: boolean) {
  if (isCookieShare) return { html: <span class="muted-text">N/A</span>, className: '' };
  if (net < 0) return { html: <span class="status-error">{net} ⚠️</span>, className: '' };
  if (net > 0) return { html: <>+{net}</>, className: 'success-text' };
  return { html: <>{'—'}</>, className: '' };
}

function formatCreditedVariety(variety: string, credited: ScoutCredited) {
  const vb = credited.virtualBooth.varieties[variety] || 0;
  const ds = credited.directShip.varieties[variety] || 0;
  const bs = credited.boothSales.varieties[variety] || 0;
  const total = vb + ds + bs;
  if (total === 0) return <>{'—'}</>;

  const sources: string[] = [];
  if (vb > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${vb}`);
  if (ds > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${ds}`);
  if (bs > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${bs}`);
  return sources.length > 0 ? <TooltipCell tooltip={sources.join('\n')} tag="span">{total}</TooltipCell> : <>{total}</>;
}

// ============================================================================
// Components
// ============================================================================

function CookieBreakdownTable({ scout }: { scout: Scout }) {
  const { inventory, credited } = scout;
  const { salesVarieties, shippedVarieties, totalDonations } = calculateVarietyBreakdowns(scout);

  const salesWithDonations = { ...salesVarieties };
  const allCreditedDonations = (credited.virtualBooth.donations || 0) + (credited.directShip.donations || 0) + (credited.boothSales.donations || 0);
  if (totalDonations > 0 || allCreditedDonations > 0) {
    salesWithDonations[COOKIE_TYPE.COOKIE_SHARE] = totalDonations + allCreditedDonations;
  }

  const allVarieties = getCompleteVarieties({
    ...salesWithDonations, ...shippedVarieties, ...inventory.varieties,
    ...credited.virtualBooth.varieties, ...credited.directShip.varieties, ...credited.boothSales.varieties
  });

  return (
    <>
      <h5>Cookie Breakdown <span class="note-text">(Direct sales only — does not include booth sales)</span></h5>
      <DataTable columns={['Variety', 'Inventory', 'Delivered', 'Shipped', 'Credited']} className="table-compact">
        {sortVarietiesByOrder(Object.entries(allVarieties)).map(([variety]) => {
          const pickedUp = inventory.varieties[variety] || 0;
          const sold = salesVarieties[variety] || 0;
          const shipped = shippedVarieties[variety] || 0;
          const isCookieShare = variety === COOKIE_TYPE.COOKIE_SHARE;
          const { html: netHtml, className: netClass } = formatNetInventory(pickedUp - sold, isCookieShare);

          return (
            <tr key={variety}>
              <td><strong>{getCookieDisplayName(variety)}</strong></td>
              <td class={netClass}>{netHtml}</td>
              <td>{sold}</td>
              <td>{shipped > 0 ? shipped : '—'}</td>
              <td>{formatCreditedVariety(variety, credited)}</td>
            </tr>
          );
        })}
      </DataTable>
      <AllocationDetails credited={credited} />
    </>
  );
}

function AllocationDetails({ credited }: { credited: ScoutCredited }) {
  const sections: preact.JSX.Element[] = [];

  // Virtual booth allocations
  const vbAllocs = credited.virtualBooth.allocations || [];
  if (vbAllocs.length > 0) {
    const pkg = credited.virtualBooth.packages || 0;
    const don = credited.virtualBooth.donations || 0;
    const label = don > 0 ? `${pkg} pkg, ${don} Donations` : `${pkg} pkg`;
    sections.push(
      <div class="section-break-sm" key="vb">
        <h6 class="section-subheader">{DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]} ({label})</h6>
        <DataTable columns={['Order #', 'Date', 'From', 'Packages', 'Amount']} className="table-compact">
          {vbAllocs.map((a, i) => (
            <tr key={i}>
              <td>{String(a.orderNumber || '-')}</td>
              <td>{formatDate(a.date)}</td>
              <td>{String(a.from || '-')}</td>
              {buildVarietyTooltip(a.varieties) ? <TooltipCell tooltip={buildVarietyTooltip(a.varieties)}>{a.packages}</TooltipCell> : <td>{a.packages}</td>}
              <td>${Math.round(a.amount || 0)}</td>
            </tr>
          ))}
        </DataTable>
      </div>
    );
  }

  // Direct ship allocations
  const dsAllocs = credited.directShip.allocations || [];
  if (dsAllocs.length > 0) {
    const pkg = credited.directShip.packages || 0;
    const don = credited.directShip.donations || 0;
    const label = don > 0 ? `${pkg} pkg, ${don} Donations` : `${pkg} pkg`;
    sections.push(
      <div class="section-break-sm" key="ds">
        <h6 class="section-subheader">{DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]} ({label})</h6>
        <DataTable columns={['Source', 'Packages']} className="table-compact">
          {dsAllocs.map((a, i) => (
            <tr key={i}>
              <td>SC Direct Ship Divider</td>
              {buildVarietyTooltip(a.varieties) ? <TooltipCell tooltip={buildVarietyTooltip(a.varieties)}>{a.packages}</TooltipCell> : <td>{a.packages}</td>}
            </tr>
          ))}
        </DataTable>
        <p class="note-text">Note: The Smart Cookie Direct Ship Divider API does not provide per-order breakdowns.</p>
      </div>
    );
  }

  // Booth sales allocations
  const bsAllocs = credited.boothSales.allocations || [];
  if (bsAllocs.length > 0) {
    const pkg = credited.boothSales.packages || 0;
    const don = credited.boothSales.donations || 0;
    const label = don > 0 ? `${pkg} pkg, ${don} Donations` : `${pkg + don} pkg`;
    sections.push(
      <div class="section-break-sm" key="bs">
        <h6 class="section-subheader">{DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]} ({label})</h6>
        <DataTable columns={['Store', 'Date', 'Time', 'Packages', 'Donations']} className="table-compact">
          {bsAllocs.map((a, i) => {
            const time = a.startTime && a.endTime ? `${a.startTime} - ${a.endTime}` : a.startTime || '-';
            return (
              <tr key={i}>
                <td>{String(a.storeName || '-')}</td>
                <td>{formatDate(a.date)}</td>
                <td>{time}</td>
                {buildVarietyTooltip(a.varieties) ? <TooltipCell tooltip={buildVarietyTooltip(a.varieties)}>{a.packages}</TooltipCell> : <td>{a.packages}</td>}
                <td>{a.donations || '—'}</td>
              </tr>
            );
          })}
        </DataTable>
      </div>
    );
  }

  if (sections.length === 0) return null;
  return <div class="section-break"><h5>Allocation Details</h5>{sections}</div>;
}

function OrdersTable({ scout }: { scout: Scout }) {
  const PAYMENT_LABELS: Record<string, string> = { CREDIT_CARD: 'Credit Card', VENMO: 'Venmo', CASH: 'Cash' };

  return (
    <div class="section-break">
      <h5>Orders ({scout.orders.length})</h5>
      <div class="section-break-sm">
        <DataTable columns={['Order #', 'Date', 'Packages', 'Amount', 'Type', 'Payment', 'Status']} className="table-compact">
          {scout.orders.map((order: Order) => {
            const tip = buildVarietyTooltip(order.varieties);
            const paymentDisplay = order.paymentMethod ? PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod : order.paymentStatus || '-';
            const { className: statusClass, text: statusText } = getStatusStyle(order.status);
            const involvesPhysicalCookies = order.orderType !== ORDER_TYPE.DIRECT_SHIP && order.orderType !== ORDER_TYPE.DONATION;
            const totalPackages = order.physicalPackages + order.donations;

            return (
              <tr key={order.orderNumber}>
                <td>{String(order.orderNumber)}</td>
                <td>{formatDate(order.date)}</td>
                {tip ? (
                  <TooltipCell tooltip={tip}>
                    {totalPackages}{!involvesPhysicalCookies && <span class="note-text"> (no inv)</span>}
                  </TooltipCell>
                ) : (
                  <td>{totalPackages}{!involvesPhysicalCookies && <span class="note-text"> (no inv)</span>}</td>
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
