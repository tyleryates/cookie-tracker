import type { ComponentChildren } from 'preact';
import { ORDER_TYPE, PAYMENT_METHOD } from '../../constants';
import { classifyOrderStatus } from '../../order-classification';
import type { Order, Scout, SiteOrderCategory, SiteOrdersDataset, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, formatShortDate } from '../format-utils';

const ORDER_TYPE_LABELS: Record<string, string> = {
  [ORDER_TYPE.DELIVERY]: 'Girl Delivery',
  [ORDER_TYPE.DIRECT_SHIP]: 'Direct Ship',
  [ORDER_TYPE.BOOTH]: 'Booth Sale',
  [ORDER_TYPE.IN_HAND]: 'In Person',
  [ORDER_TYPE.DONATION]: 'Donation'
};

// ============================================================================
// Site order warning
// ============================================================================

function SiteOrderWarning({ siteOrders }: { siteOrders: SiteOrdersDataset }) {
  const { directShip, girlDelivery } = siteOrders;
  const hasUnallocated = directShip.hasWarning || girlDelivery.hasWarning;
  if (!hasUnallocated) return null;

  return (
    <div class="info-box info-box-warning">
      <p>
        <strong>Unallocated Troop Orders</strong>
      </p>
      <ul class="list-none">
        {girlDelivery.hasWarning && (
          <li>
            <strong>Girl Delivery:</strong> {girlDelivery.unallocated} of {girlDelivery.total} packages — use{' '}
            <strong>Virtual Booth Divider</strong> (Booth &rarr; My Reservations &rarr; "Virtual Delivery" row &rarr; "...")
          </li>
        )}
        {directShip.hasWarning && (
          <li>
            <strong>Direct Ship:</strong> {directShip.unallocated} of {directShip.total} packages — use{' '}
            <strong>Troop Direct Ship Orders Divider</strong> (Orders &rarr; Troop Direct Ship Orders &rarr; "Distribute orders to girls")
          </li>
        )}
      </ul>
    </div>
  );
}

// ============================================================================
// Status helpers
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

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildOrderTooltip(order: Order): string {
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

// ============================================================================
// Combined orders table (girl delivery + direct ship)
// ============================================================================

function OrderScoutAllocations({
  orderNumber,
  orderType,
  scouts
}: {
  orderNumber: string;
  orderType: string | null;
  scouts: Record<string, Scout>;
}) {
  const scoutCredits: Array<{ name: string; total: number }> = [];

  if (orderType === ORDER_TYPE.DIRECT_SHIP) {
    // Try exact per-order match first (available when SC provides orderId)
    for (const [name, scout] of Object.entries(scouts)) {
      if (scout.isSiteOrder) continue;
      const matching = scout.$allocationsByChannel.directShip
        .filter((a) => a.orderId === orderNumber || a.orderId === `D${orderNumber}`)
        .reduce((sum, a) => sum + a.packages + a.donations, 0);
      if (matching > 0) scoutCredits.push({ name, total: matching });
    }

    // Fallback: SC API returns a single divider blob without per-order orderId.
    // Show each scout's total direct ship allocation instead.
    if (scoutCredits.length === 0) {
      for (const [name, scout] of Object.entries(scouts)) {
        if (scout.isSiteOrder) continue;
        const total = scout.$allocationsByChannel.directShip.reduce((sum, a) => sum + a.packages + a.donations, 0);
        if (total > 0) scoutCredits.push({ name, total });
      }
    }
  } else {
    // Girl delivery orders (DELIVERY + IN_HAND) are allocated via virtual booth T2G transfers.
    // SC stores order numbers with a "D" prefix (e.g. "D1001") while DC strips it ("1001").
    for (const [name, scout] of Object.entries(scouts)) {
      if (scout.isSiteOrder) continue;
      const matching = scout.$allocationsByChannel.virtualBooth
        .filter((a) => a.orderNumber === orderNumber || a.orderNumber === `D${orderNumber}`)
        .reduce((sum, a) => sum + a.packages + a.donations, 0);
      if (matching > 0) scoutCredits.push({ name, total: matching });
    }

    // Fallback: virtual booth divider doesn't always track per-order.
    // Show each scout's total virtual booth allocation instead.
    if (scoutCredits.length === 0) {
      for (const [name, scout] of Object.entries(scouts)) {
        if (scout.isSiteOrder) continue;
        const total = scout.$allocationsByChannel.virtualBooth.reduce((sum, a) => sum + a.packages + a.donations, 0);
        if (total > 0) scoutCredits.push({ name, total });
      }
    }
  }

  if (scoutCredits.length === 0) {
    return (
      <div class="booth-detail-content muted-text">No scout allocations yet. Distribute in Smart Cookie to see per-scout breakdown.</div>
    );
  }

  scoutCredits.sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div class="booth-detail-content">
      {scoutCredits.map(({ name, total }) => (
        <div key={name} class="booth-allocation-chip">
          <strong>{name}</strong>
          <span class="booth-allocation-credit">{total} credited</span>
        </div>
      ))}
    </div>
  );
}

function OrdersTable({
  girlDelivery,
  directShip,
  orderLookup,
  scouts
}: {
  girlDelivery: SiteOrderCategory;
  directShip: SiteOrderCategory;
  orderLookup: Map<string, Order>;
  scouts: Record<string, Scout>;
}) {
  const totalOrders = girlDelivery.orders.length + directShip.orders.length;
  if (totalOrders === 0) return null;

  // Sort newest first; per-order allocation status is pre-computed in the data layer
  const rows = [...girlDelivery.orders.map((e) => ({ entry: e })), ...directShip.orders.map((e) => ({ entry: e }))].sort((a, b) => {
    const dateA = orderLookup.get(a.entry.orderNumber)?.date || '';
    const dateB = orderLookup.get(b.entry.orderNumber)?.date || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const COLUMN_COUNT = 8;

  return (
    <>
      <h4 style={{ margin: '20px 0 8px' }}>Orders</h4>
      <DataTable
        columns={['Date', 'Order #', 'Type', 'Packages', 'Donations', 'Amount', 'Payment', 'Status']}
        columnAligns={[undefined, undefined, undefined, 'center', 'center', 'center', 'center', 'center']}
        className="table-normal"
        hint="Click an order to see scout allocations for that order."
      >
        {rows.map(({ entry }) => {
          const original = orderLookup.get(entry.orderNumber);
          const varieties = original?.varieties;
          const tip = varieties ? buildVarietyTooltip(varieties) : '';
          const isCash = original?.paymentMethod === PAYMENT_METHOD.CASH;
          const isDigital = original?.paymentMethod && original.paymentMethod !== PAYMENT_METHOD.CASH;
          const amountClass = isCash ? 'cash-amount' : isDigital ? 'digital-amount' : undefined;
          const paymentPillClass = isCash ? 'payment-pill payment-pill-cash' : isDigital ? 'payment-pill payment-pill-digital' : undefined;
          const isAllocated = entry.allocated >= entry.packages;
          const { className: statusClass, text: statusText } = original?.status
            ? getStatusStyle(original.status)
            : {
                className: `status-pill ${isAllocated ? 'status-pill-success' : 'status-pill-warning'}`,
                text: isAllocated ? 'Allocated' : 'Unallocated'
              };

          return (
            <ExpandableRow
              key={entry.orderNumber}
              rowClass="booth-row"
              firstCell={formatShortDate(original?.date)}
              cells={[
                entry.orderNumber,
                (() => {
                  const typeText = entry.orderType ? (ORDER_TYPE_LABELS[entry.orderType] ?? entry.orderType) : '—';
                  const orderTip = original ? buildOrderTooltip(original) : '';
                  return orderTip ? (
                    <TooltipCell tooltip={orderTip} tag="span">
                      {typeText}
                    </TooltipCell>
                  ) : (
                    typeText
                  );
                })(),
                tip ? (
                  <TooltipCell tooltip={tip} tag="span">
                    {entry.packages}
                  </TooltipCell>
                ) : (
                  entry.packages
                ),
                original?.donations || '\u2014',
                <span class={amountClass}>{original ? `$${Math.round(original.amount)}` : '\u2014'}</span>,
                paymentPillClass ? <span class={paymentPillClass}>{isCash ? 'Cash' : 'Digital'}</span> : '\u2014',
                <span class={statusClass}>{statusText}</span>
              ]}
              cellAligns={[undefined, undefined, 'center', 'center', 'center', 'center', 'center']}
              detail={<OrderScoutAllocations orderNumber={entry.orderNumber} orderType={entry.orderType} scouts={scouts} />}
              colSpan={COLUMN_COUNT}
              detailClass="detail-row"
            />
          );
        })}
      </DataTable>
    </>
  );
}

// ============================================================================
// Main report
// ============================================================================

export function TroopSalesReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
  const siteOrders = data.siteOrders;
  const { directShip, girlDelivery } = siteOrders;

  const totalPackages = girlDelivery.total + directShip.total;
  const totalAllocated = girlDelivery.allocated + directShip.allocated;
  const totalUnallocated = girlDelivery.unallocated + directShip.unallocated;

  const hasUnallocated = directShip.hasWarning || girlDelivery.hasWarning;

  // Build order lookup for variety tooltips (site scout orders keyed by order number)
  const orderLookup = new Map<string, Order>();
  for (const scout of Object.values(data.scouts)) {
    if (!scout.isSiteOrder) continue;
    for (const order of scout.orders) {
      orderLookup.set(order.orderNumber, order);
    }
  }

  // Compute packages vs donations breakdown for Girl Delivery and Direct Ship
  const gdDonations = girlDelivery.orders.reduce((sum, e) => sum + (orderLookup.get(e.orderNumber)?.donations || 0), 0);
  const gdPackages = girlDelivery.total - gdDonations;
  const gdDesc = gdDonations > 0 ? `${gdPackages} packages + ${gdDonations} donations` : 'Online orders for local delivery';

  const dsDonations = directShip.orders.reduce((sum, e) => sum + (orderLookup.get(e.orderNumber)?.donations || 0), 0);
  const dsPackages = directShip.total - dsDonations;
  const dsDesc = dsDonations > 0 ? `${dsPackages} packages + ${dsDonations} donations` : 'Shipped by supplier';

  const stats: Stat[] = [
    { label: 'Girl Delivery', value: girlDelivery.total, description: gdDesc, color: STAT_COLORS.BLUE },
    { label: 'Direct Ship', value: directShip.total, description: dsDesc, color: STAT_COLORS.TEAL, operator: '+' },
    {
      label: 'Total',
      value: totalPackages,
      description: `${totalAllocated} allocated, ${totalUnallocated} unallocated`,
      color: STAT_COLORS.ORANGE,
      operator: '=',
      highlight: true
    }
  ];

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Troop Site Orders</h3>
        <span class={`report-status-badge ${hasUnallocated ? 'report-status-warning' : 'report-status-ok'}`}>
          {hasUnallocated ? 'Needs Attention' : 'All Distributed'}
        </span>
      </div>
      {banner}
      <SiteOrderWarning siteOrders={siteOrders} />
      <StatCards stats={stats} />
      <OrdersTable girlDelivery={girlDelivery} directShip={directShip} orderLookup={orderLookup} scouts={data.scouts} />
    </div>
  );
}
