import { ALLOCATION_METHOD, DISPLAY_STRINGS } from '../../constants';
import { getCookieDisplayName, PROCEEDS_EXEMPT_PACKAGES } from '../../cookie-constants';
import type { Scout, SiteOrdersDataset, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { ScoutDetailBreakdown } from '../components/scout-detail';
import { TooltipCell } from '../components/tooltip-cell';

// ============================================================================
// Helper functions
// ============================================================================

function getOrderStatusStyle(scout: Scout): { className: string; icon: string; tooltip: string } {
  const { needsApproval, pending, completed } = scout.totals.$orderStatusCounts;

  if (needsApproval > 0) {
    const parts = [`${needsApproval} need${needsApproval === 1 ? 's' : ''} approval`];
    if (pending > 0) parts.push(`${pending} pending deliver${pending === 1 ? 'y' : 'ies'}`);
    return { className: 'status-error', icon: ' ⚠️', tooltip: parts.join(', ') };
  }
  if (pending > 0) return { className: 'status-warning', icon: '', tooltip: `${pending} pending deliver${pending === 1 ? 'y' : 'ies'}` };
  if (completed === scout.orders.length && scout.orders.length > 0) return { className: 'status-success', icon: '', tooltip: '' };
  return { className: '', icon: '', tooltip: '' };
}

// ============================================================================
// Cell sub-components
// ============================================================================

function InventoryCell({
  netInventory,
  negativeVarieties,
  actualNet
}: {
  netInventory: number;
  negativeVarieties: NonNullable<Scout['$issues']>['negativeInventory'];
  actualNet: number;
}) {
  if (negativeVarieties && negativeVarieties.length > 0) {
    const varietyList = negativeVarieties.map((v) => `${getCookieDisplayName(v.variety)}: -${v.shortfall}`).join('\n');
    const display = netInventory > 0 ? `+${netInventory}` : actualNet;
    return (
      <TooltipCell tooltip={varietyList} tag="span" className="tooltip-cell status-error">
        {display} ⚠️
      </TooltipCell>
    );
  }
  if (netInventory < 0) return <span class="warning-text">{netInventory}</span>;
  if (netInventory > 0) return <span class="success-text">+{netInventory}</span>;
  return <span>—</span>;
}

function CreditedCell({ isSiteRow, scout, siteOrders }: { isSiteRow: boolean; scout: Scout; siteOrders: SiteOrdersDataset }) {
  const total = scout.totals.credited;
  if (total === 0) return <>{'—'}</>;

  const { virtualBooth: vb, directShip: ds, booth: bs } = scout.totals.$allocationSummary;

  const sources: string[] = [];
  // Virtual booth
  if (vb.packages + vb.donations > 0) {
    sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${vb.packages + vb.donations}`);
    scout.$allocationsByChannel.virtualBooth.forEach((a) => {
      const order = a.orderNumber ? `#${a.orderNumber}` : 'Unknown';
      const date = a.date ? ` (${a.date})` : '';
      sources.push(`  ${order}${date}: ${a.packages} pkg`);
    });
  }
  // Direct ship
  if (ds.packages + ds.donations > 0) {
    sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${ds.packages + ds.donations}`);
    const n = scout.$allocationsByChannel.directShip.length;
    if (n > 0) sources.push(`  (${n} allocation${n === 1 ? '' : 's'} from SC divider)`);
  }
  // Booth sales
  if (bs.packages + bs.donations > 0) {
    sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${bs.packages + bs.donations}`);
    scout.$allocationsByChannel.booth.forEach((a) => {
      const store = a.storeName || 'Booth';
      const date = a.date ? ` (${a.date})` : '';
      const parts = [`${a.packages} pkg`];
      if (a.donations > 0) parts.push(`${a.donations} Donations`);
      sources.push(`  ${store}${date}: ${parts.join(', ')}`);
    });
  }

  if (isSiteRow && siteOrders) {
    const hasSiteOrders = (siteOrders.directShip?.orders?.length || 0) > 0 || (siteOrders.girlDelivery?.orders?.length || 0) > 0;
    if (hasSiteOrders) {
      sources.push(
        `\nNote: Troop booth sales and direct ship orders are allocated to scouts in Smart Cookie. See site orders in scout details.`
      );
    }
  }

  return (
    <TooltipCell tooltip={sources.join('\n')} tag="span">
      {total}
    </TooltipCell>
  );
}

function DeliveredCell({
  sales,
  isSiteRow,
  scout,
  siteOrders
}: {
  sales: number;
  isSiteRow: boolean;
  scout: Scout;
  siteOrders: SiteOrdersDataset;
}) {
  if (!isSiteRow || !scout.$hasUnallocatedSiteOrders || !siteOrders) return <>{sales}</>;

  const dsUnalloc = siteOrders.directShip.unallocated || 0;
  const gdUnalloc = siteOrders.girlDelivery.unallocated || 0;
  const bsUnalloc = siteOrders.boothSale.unallocated || 0;
  const parts: string[] = [];
  if (bsUnalloc > 0) parts.push(`Booth Sales: ${bsUnalloc}`);
  if (gdUnalloc > 0) parts.push(`Troop Girl Delivered: ${gdUnalloc}`);
  if (dsUnalloc > 0) parts.push(`Troop Direct Ship: ${dsUnalloc}`);
  parts.push('\nAllocate in Smart Cookie');
  return (
    <TooltipCell tooltip={parts.join('\n')} tag="span" className="tooltip-cell status-warning">
      {sales} ⚠️
    </TooltipCell>
  );
}

function ProceedsCell({ isSiteRow, totals, proceedsRate }: { isSiteRow: boolean; totals: Scout['totals']; proceedsRate: number }) {
  if (isSiteRow) return <>-</>;
  const totalSold = totals.totalSold || 0;
  const exemptPackages = totalSold > 0 ? Math.min(totalSold, PROCEEDS_EXEMPT_PACKAGES) : 0;
  const deduction = exemptPackages * proceedsRate;
  const proceeds = totalSold * proceedsRate - deduction;
  const proceedsRounded = Math.round(proceeds);
  const deductionRounded = Math.round(deduction);
  const className = proceedsRounded > 0 ? 'status-success' : '';
  if (deductionRounded > 0) {
    const tip = `First ${PROCEEDS_EXEMPT_PACKAGES} pkg exempt: -$${deductionRounded}\nGross: $${Math.round(totalSold * proceedsRate)}`;
    return (
      <TooltipCell tooltip={tip} tag="span" className={className ? `tooltip-cell ${className}` : undefined}>
        ${proceedsRounded}
      </TooltipCell>
    );
  }
  return <span class={className}>{proceedsRounded > 0 ? `$${proceedsRounded}` : '$0'}</span>;
}

function CashOwedCell({ isSiteRow, totals }: { isSiteRow: boolean; totals: Scout['totals'] }) {
  if (isSiteRow) return <>-</>;
  const financials = totals.$financials;
  const cashOwed = Math.round(financials?.cashOwed || 0);
  const className = cashOwed > 0 ? 'status-error-dark' : 'success-text';
  const inventoryValue = Math.round(financials?.inventoryValue || 0);
  const electronic = Math.round(financials?.electronicPayments || 0);
  const salesCash = Math.round(financials?.cashCollected || 0);
  const unsold = Math.round(financials?.unsoldValue || 0);
  const tooltipParts = [`Pickup value: $${inventoryValue}`];
  if (electronic > 0) tooltipParts.push(`Digital payments: -$${electronic}`);
  if (salesCash > 0) tooltipParts.push(`Sales cash: $${salesCash}`);
  if (unsold > 0) tooltipParts.push(`Unsold inventory: $${unsold}`);
  return (
    <TooltipCell tooltip={tooltipParts.join('\n')} tag="span" className={`tooltip-cell ${className}`}>
      {cashOwed > 0 ? `$${cashOwed}` : '$0'}
    </TooltipCell>
  );
}

// ============================================================================
// Main report component
// ============================================================================

export function ScoutSummaryReport({ data }: { data: UnifiedDataset }) {
  if (!data?.scouts) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const scouts = data.scouts;
  const siteOrders = data.siteOrders;
  const proceedsRate = data.troopTotals.proceedsRate;

  const sortedScouts = Array.from(scouts.entries())
    .filter(([_name, scout]) => (scout.isSiteOrder ? scout.$hasUnallocatedSiteOrders : (scout.totals.totalSold || 0) > 0))
    .sort((a, b) => a[0].localeCompare(b[0]));

  const COLUMN_COUNT = 10;

  return (
    <div class="report-visual">
      <h3>Scout Summary</h3>
      <p class="table-hint">
        Click on any scout to see detailed breakdown. <strong>Delivered</strong> = packages for in-person delivery.{' '}
        <strong>Inventory</strong> = net on hand. <strong>Credited</strong> = troop booth sales + direct ship allocated to scout.{' '}
        <strong>Shipped</strong> = scout's own direct ship orders. <strong>Proceeds</strong> = ${proceedsRate.toFixed(2)}/pkg after first 50
        exempt. <strong>Cash Due</strong> = pickup value minus electronic DC payments.
      </p>
      <DataTable
        columns={['Scout', 'Orders', 'Inventory', 'Delivered', 'Shipped', 'Donations', 'Credited', 'Total Sold', 'Proceeds', 'Cash Due']}
        className="table-normal scout-table"
      >
        {sortedScouts.map(([name, scout]) => {
          const isSiteRow = name.endsWith(' Site');
          const { totals } = scout;
          const sales = totals.delivered || 0;
          const totalCreditedCount = totals.credited;
          const { className: orderClass, icon: orderIcon, tooltip: orderTooltip } = getOrderStatusStyle(scout);
          const totalSold = totals.totalSold || 0;
          const directSales = sales + (totals.shipped || 0) + (totals.donations || 0);
          const soldTooltip = `Direct: ${directSales}\nCredited: ${totalCreditedCount}`;

          return (
            <ExpandableRow
              key={name}
              rowClass="scout-row"
              firstCell={<strong>{name}</strong>}
              cells={[
                orderTooltip ? (
                  <TooltipCell tooltip={orderTooltip} tag="span">
                    <span class={orderClass}>
                      {scout.orders.length}
                      {orderIcon}
                    </span>
                  </TooltipCell>
                ) : (
                  <span class={orderClass}>
                    {scout.orders.length}
                    {orderIcon}
                  </span>
                ),
                <InventoryCell
                  netInventory={totals.inventory}
                  negativeVarieties={scout.$issues?.negativeInventory}
                  actualNet={totals.inventory || 0}
                />,
                <DeliveredCell sales={sales} isSiteRow={isSiteRow} scout={scout} siteOrders={siteOrders} />,
                totals.shipped || 0,
                totals.donations || 0,
                <CreditedCell isSiteRow={isSiteRow} scout={scout} siteOrders={siteOrders} />,
                <TooltipCell tooltip={soldTooltip} tag="span">
                  {totalSold}
                </TooltipCell>,
                <ProceedsCell isSiteRow={isSiteRow} totals={totals} proceedsRate={proceedsRate} />,
                <CashOwedCell isSiteRow={isSiteRow} totals={totals} />
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
