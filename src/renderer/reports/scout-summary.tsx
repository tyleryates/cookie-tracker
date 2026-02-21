import { ALLOCATION_METHOD, DISPLAY_STRINGS, ORDER_TYPE, OWNER } from '../../constants';
import type { Order, Scout, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { NoDCDataWarning } from '../components/no-dc-data-warning';
import { ScoutDetailBreakdown } from '../components/scout-detail';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { getActiveScouts } from '../format-utils';

// ============================================================================
// Helper functions
// ============================================================================

function getOrderStatusStyle(scout: Scout): { className: string; tooltip: string } {
  const { needsApproval, pending, completed } = scout.totals.$orderStatusCounts;

  if (needsApproval > 0) {
    const parts = [`${needsApproval} need${needsApproval === 1 ? 's' : ''} approval`];
    if (pending > 0) parts.push(`${pending} pending deliver${pending === 1 ? 'y' : 'ies'}`);
    return { className: 'status-error', tooltip: parts.join(', ') };
  }
  if (pending > 0) return { className: 'status-warning', tooltip: `${pending} pending deliver${pending === 1 ? 'y' : 'ies'}` };
  if (completed === scout.orders.length && scout.orders.length > 0) return { className: 'status-success', tooltip: '' };
  return { className: '', tooltip: '' };
}

/** Tally packages + donations per order type for a scout */
function tallyByType(orders: Order[]): {
  inHand: { pkg: number; don: number };
  delivery: { pkg: number; don: number };
  shipped: { pkg: number; don: number };
} {
  const inHand = { pkg: 0, don: 0 };
  const delivery = { pkg: 0, don: 0 };
  const shipped = { pkg: 0, don: 0 };
  for (const o of orders) {
    if (o.owner !== OWNER.GIRL) continue;
    if (o.orderType === ORDER_TYPE.IN_HAND) {
      inHand.pkg += o.physicalPackages;
      inHand.don += o.donations;
    } else if (o.orderType === ORDER_TYPE.DELIVERY) {
      delivery.pkg += o.physicalPackages;
      delivery.don += o.donations;
    } else if (o.orderType === ORDER_TYPE.DIRECT_SHIP) {
      shipped.pkg += o.physicalPackages;
      shipped.don += o.donations;
    } else if (o.orderType === ORDER_TYPE.DONATION) {
      delivery.don += o.donations;
    }
  }
  return { inHand, delivery, shipped };
}

function TypeCell({ pkg, don }: { pkg: number; don: number }) {
  const total = pkg + don;
  if (total === 0) return <>{'—'}</>;
  if (don === 0) return <>{total}</>;
  const tip = `${pkg} packages + ${don} donations`;
  return (
    <TooltipCell tooltip={tip} tag="span">
      {total}
    </TooltipCell>
  );
}

// ============================================================================
// Cell sub-components
// ============================================================================

function CreditedCell({ scout }: { scout: Scout }) {
  const total = scout.totals.credited;
  if (total === 0) return <>{'—'}</>;

  const { virtualBooth: vb, directShip: ds, booth: bs } = scout.totals.$allocationSummary;

  const sources: string[] = [];
  const vbTotal = vb.packages + vb.donations;
  const dsTotal = ds.packages + ds.donations;
  const bsTotal = bs.packages + bs.donations;
  if (vbTotal > 0)
    sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${vbTotal} credit${vbTotal !== 1 ? 's' : ''}`);
  if (dsTotal > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${dsTotal} credit${dsTotal !== 1 ? 's' : ''}`);
  if (bsTotal > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${bsTotal} credit${bsTotal !== 1 ? 's' : ''}`);

  return (
    <TooltipCell tooltip={sources.join('\n')} tag="span">
      {total}
    </TooltipCell>
  );
}

// ============================================================================
// Main report component
// ============================================================================

export function ScoutSummaryReport({ data }: { data: UnifiedDataset }) {
  const sortedScouts = getActiveScouts(data.scouts).filter(([, scout]) => (scout.totals.totalSold || 0) > 0);

  // tallyByType splits by in-hand vs delivery vs shipped WITH donations included,
  // which scout.totals.delivered/shipped don't provide (they only count physicalPackages)
  let totalDelivered = 0;
  let totalShipped = 0;
  let totalInHand = 0;
  let totalCredits = 0;
  let totalSoldAll = 0;
  for (const [, scout] of sortedScouts) {
    const tally = tallyByType(scout.orders);
    totalDelivered += tally.delivery.pkg + tally.delivery.don;
    totalShipped += tally.shipped.pkg + tally.shipped.don;
    totalInHand += tally.inHand.pkg + tally.inHand.don;
    totalCredits += scout.totals.credited;
    totalSoldAll += scout.totals.totalSold || 0;
  }

  const stats: Stat[] = [
    { label: 'Delivered', value: totalDelivered, description: 'DC orders delivered by scouts', color: STAT_COLORS.BLUE },
    { label: 'In Person', value: totalInHand, description: 'Door-to-door sales', color: STAT_COLORS.PINK, operator: '+' },
    { label: 'Shipped', value: totalShipped, description: 'Direct ship orders', color: STAT_COLORS.TEAL, operator: '+' },
    { label: 'Credits', value: totalCredits, description: 'Booth + troop online', color: STAT_COLORS.PURPLE, operator: '+' },
    { label: 'Total Sales', value: totalSoldAll, description: 'All scout sales', color: STAT_COLORS.GREEN, operator: '=', highlight: true }
  ];

  const COLUMN_COUNT = 9;

  let totalNeedsApproval = 0;
  for (const [, scout] of sortedScouts) {
    totalNeedsApproval += scout.totals.$orderStatusCounts.needsApproval;
  }

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Scout Sales Summary</h3>
        {totalNeedsApproval > 0 && (
          <span class="report-status-badge report-status-info">
            {`${totalNeedsApproval} order${totalNeedsApproval === 1 ? ' needs' : 's need'} approval`}
          </span>
        )}
      </div>
      {!data.metadata.lastImportDC && <NoDCDataWarning>Scout sales data may be incomplete.</NoDCDataWarning>}
      <StatCards stats={stats} />
      <DataTable
        columns={['Scout', 'Orders', 'Delivered', 'In Person', 'Shipped', 'Credits', 'Total', 'Cash Collected', 'Digital Payments']}
        className="table-normal scout-table"
        hint="Click a row to see order details and credit breakdown."
      >
        {sortedScouts.map(([name, scout]) => {
          const { totals } = scout;
          const { className: orderClass, tooltip: orderTooltip } = getOrderStatusStyle(scout);
          const totalSold = totals.totalSold || 0;
          const tally = tallyByType(scout.orders);

          return (
            <ExpandableRow
              key={name}
              rowClass="scout-row"
              firstCell={<strong>{name}</strong>}
              cells={[
                orderTooltip ? (
                  <TooltipCell tooltip={orderTooltip} tag="span">
                    <span class={`inline-alert-anchor ${orderClass}`}>
                      {scout.orders.length}
                      {scout.totals.$orderStatusCounts.needsApproval > 0 && <span class="inline-alert-pill">{'\u26A0'}</span>}
                    </span>
                  </TooltipCell>
                ) : (
                  <span class={orderClass}>{scout.orders.length}</span>
                ),
                <TypeCell pkg={tally.delivery.pkg} don={tally.delivery.don} />,
                <TypeCell pkg={tally.inHand.pkg} don={tally.inHand.don} />,
                <TypeCell pkg={tally.shipped.pkg} don={tally.shipped.don} />,
                <CreditedCell scout={scout} />,
                totalSold,
                totals.$financials.cashCollected > 0 ? (
                  <span class="cash-amount">${Math.round(totals.$financials.cashCollected)}</span>
                ) : (
                  '\u2014'
                ),
                totals.$financials.electronicPayments > 0 ? (
                  <span class="digital-amount">${Math.round(totals.$financials.electronicPayments)}</span>
                ) : (
                  '\u2014'
                )
              ]}
              detail={<ScoutDetailBreakdown scout={scout} />}
              colSpan={COLUMN_COUNT}
              detailClass="scout-detail"
            />
          );
        })}
      </DataTable>
    </div>
  );
}
