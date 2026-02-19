import type { ComponentChildren } from 'preact';
import { ORDER_TYPE, PAYMENT_METHOD } from '../../constants';
import type { Order, Scout, SiteOrderCategory, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ScoutCreditChips } from '../components/scout-credit-chips';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, formatShortDate } from '../format-utils';
import { buildOrderTooltip, getStatusStyle, isActionRequired } from '../order-helpers';

const ORDER_TYPE_LABELS: Record<string, string> = {
  [ORDER_TYPE.DELIVERY]: 'Girl Delivery',
  [ORDER_TYPE.DIRECT_SHIP]: 'Direct Ship',
  [ORDER_TYPE.BOOTH]: 'Booth Sale',
  [ORDER_TYPE.IN_HAND]: 'In Person',
  [ORDER_TYPE.DONATION]: 'Donation'
};

// ============================================================================
// Section-based layout (Girl Delivery + Direct Ship)
// ============================================================================

function SectionAllocations({ channel, scouts }: { channel: 'directShip' | 'virtualBooth'; scouts: Record<string, Scout> }) {
  const scoutCredits: Array<{ name: string; total: number }> = [];
  for (const [name, scout] of Object.entries(scouts)) {
    if (scout.isSiteOrder) continue;
    const total = scout.$allocationsByChannel[channel].reduce((sum, a) => sum + a.packages + a.donations, 0);
    if (total > 0) scoutCredits.push({ name, total });
  }
  return <ScoutCreditChips credits={scoutCredits} unit="credit" />;
}

function OrderSection({
  title,
  category,
  channel,
  helpText,
  orderLookup,
  scouts
}: {
  title: string;
  category: SiteOrderCategory;
  channel: 'directShip' | 'virtualBooth';
  helpText?: string;
  orderLookup: Map<string, Order>;
  scouts: Record<string, Scout>;
}) {
  if (category.orders.length === 0 && category.allocated === 0) return null;

  const rows = [...category.orders].sort((a, b) => {
    const dateA = orderLookup.get(a.orderNumber)?.date || '1970-01-01';
    const dateB = orderLookup.get(b.orderNumber)?.date || '1970-01-01';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return (
    <div>
      <div class="report-header-row" style={{ marginTop: '20px', marginBottom: '8px' }}>
        <h4>{title}</h4>
        {category.hasWarning && (
          <span class="report-status-badge report-status-warning">
            {category.unallocated} undistributed package{category.unallocated === 1 ? '' : 's'}
            {helpText && (
              <TooltipCell tooltip={helpText} tag="span" className="help-circle">
                ?
              </TooltipCell>
            )}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          columns={['Date', 'Order #', 'Type', 'Packages', 'Donations', 'Amount', 'Payment', 'Status']}
          columnAligns={[undefined, undefined, undefined, 'center', 'center', 'center', 'center', 'center']}
          className="table-normal"
        >
          {rows.map((entry) => {
            const original = orderLookup.get(entry.orderNumber);
            const varieties = original?.varieties;
            const tip = varieties ? buildVarietyTooltip(varieties) : '';
            const isCash = original?.paymentMethod === PAYMENT_METHOD.CASH;
            const isDigital = original?.paymentMethod && original.paymentMethod !== PAYMENT_METHOD.CASH;
            const amountClass = isCash ? 'cash-amount' : isDigital ? 'digital-amount' : undefined;
            const paymentPillClass = isCash
              ? 'payment-pill payment-pill-cash'
              : isDigital
                ? 'payment-pill payment-pill-digital'
                : undefined;
            const { className: statusClass, text: statusText } = original?.status
              ? getStatusStyle(original.status)
              : { className: '', text: '' };

            return (
              <tr key={entry.orderNumber}>
                <td>{formatShortDate(original?.date)}</td>
                <td>
                  {entry.orderNumber}
                  {isActionRequired(original?.status) && <span class="inline-alert-pill">{'\u26A0'}</span>}
                </td>
                <td>
                  {(() => {
                    const typeText = entry.orderType ? (ORDER_TYPE_LABELS[entry.orderType] ?? entry.orderType) : '\u2014';
                    const orderTip = original ? buildOrderTooltip(original) : '';
                    return orderTip ? (
                      <TooltipCell tooltip={orderTip} tag="span">
                        {typeText}
                      </TooltipCell>
                    ) : (
                      typeText
                    );
                  })()}
                </td>
                <td class="text-center">
                  {tip ? (
                    <TooltipCell tooltip={tip} tag="span">
                      {entry.packages}
                    </TooltipCell>
                  ) : (
                    entry.packages
                  )}
                </td>
                <td class="text-center">{original?.donations || '\u2014'}</td>
                <td class="text-center">
                  <span class={amountClass}>{original ? `$${Math.round(original.amount)}` : '\u2014'}</span>
                </td>
                <td class="text-center">
                  {paymentPillClass ? <span class={paymentPillClass}>{isCash ? 'Cash' : 'Digital'}</span> : '\u2014'}
                </td>
                <td class="text-center">
                  <span class={statusClass}>{statusText}</span>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <SectionAllocations channel={channel} scouts={scouts} />
    </div>
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
      description: `${totalAllocated} distributed, ${totalUnallocated} undistributed`,
      color: STAT_COLORS.GREEN,
      operator: '=',
      highlight: true
    }
  ];

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Troop Online Orders</h3>
        <span class={`report-status-badge ${hasUnallocated ? 'report-status-warning' : 'report-status-ok'}`}>
          {hasUnallocated ? 'Action Required' : 'Fully Distributed'}
        </span>
      </div>
      {banner}
      {!data.metadata.lastImportDC && (
        <div class="info-box info-box-warning">
          <p>Digital Cookie data was not loaded. Online order details may be incomplete.</p>
        </div>
      )}
      <StatCards stats={stats} />
      <OrderSection
        title="Girl Delivery"
        category={girlDelivery}
        channel="virtualBooth"
        helpText={
          'Use Virtual Booth Divider in Smart Cookie\n(My Troop \u2192 Booth \u2192 My Reservations \u2192 select booth \u2192 "...")'
        }
        orderLookup={orderLookup}
        scouts={data.scouts}
      />
      <OrderSection
        title="Direct Ship"
        category={directShip}
        channel="directShip"
        helpText={'Use Troop Direct Ship Orders Divider in Smart Cookie\n(My Troop \u2192 Booth \u2192 Troop Direct Ship Orders)'}
        orderLookup={orderLookup}
        scouts={data.scouts}
      />
    </div>
  );
}
