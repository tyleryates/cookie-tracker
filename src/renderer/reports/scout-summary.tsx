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
    const varietyList = negativeVarieties.map((v) => `${getCookieDisplayName(v.variety)}: - ${v.shortfall}`).join('\n');
    const display = netInventory > 0 ? `+ ${netInventory}` : `- ${Math.abs(actualNet)}`;
    return (
      <TooltipCell tooltip={varietyList} tag="span" className="tooltip-cell status-error">
        {display} ⚠️
      </TooltipCell>
    );
  }
  if (netInventory < 0) return <span class="status-error">- {Math.abs(netInventory)}</span>;
  if (netInventory > 0) return <span class="pkg-in">+ {netInventory}</span>;
  return <span>—</span>;
}

function CreditedCell({ scout }: { scout: Scout }) {
  const total = scout.totals.credited;
  if (total === 0) return <>{'—'}</>;

  const { virtualBooth: vb, directShip: ds, booth: bs } = scout.totals.$allocationSummary;

  const sources: string[] = [];
  if (vb.packages > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${vb.packages} pkg`);
  if (vb.donations > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${vb.donations} donations`);
  if (ds.packages > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${ds.packages} pkg`);
  if (ds.donations > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${ds.donations} donations`);
  if (bs.packages > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${bs.packages} pkg`);
  if (bs.donations > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${bs.donations} donations`);

  return (
    <TooltipCell tooltip={sources.join('\n')} tag="span">
      {total}
    </TooltipCell>
  );
}

function ProceedsCell({ totals, proceedsRate }: { totals: Scout['totals']; proceedsRate: number }) {
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

function CashOwedCell({ totals }: { totals: Scout['totals'] }) {
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
// Troop site order warning banner
// ============================================================================

function SiteOrderWarning({ siteOrders }: { siteOrders: SiteOrdersDataset }) {
  const { directShip, girlDelivery, boothSale } = siteOrders;
  const hasUnallocated = directShip.hasWarning || girlDelivery.hasWarning || boothSale.hasWarning;
  if (!hasUnallocated) return null;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        background: '#FFF8E1',
        borderLeft: '4px solid #F57F17',
        marginBottom: '16px'
      }}
    >
      <strong style={{ color: '#E65100' }}>Unallocated Troop Orders</strong>
      <ul style={{ margin: '8px 0 0', paddingLeft: '20px', listStyle: 'none' }}>
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
        {boothSale.hasWarning && (
          <li>
            <strong>Booth Sale:</strong> {boothSale.unallocated} of {boothSale.total} packages — use <strong>Booth Divider</strong> (Booth
            &rarr; My Reservations &rarr; booth row &rarr; "...")
          </li>
        )}
      </ul>
    </div>
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

  const sortedScouts = Object.entries(scouts)
    .filter(([_name, scout]) => !scout.isSiteOrder && (scout.totals.totalSold || 0) > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const COLUMN_COUNT = 10;

  return (
    <div class="report-visual">
      <h3>Scout Summary</h3>
      <SiteOrderWarning siteOrders={siteOrders} />
      <p class="table-hint">
        Click on any scout to see detailed breakdown. <strong>Inventory</strong> = net packages on hand (picked up minus sold).{' '}
        <strong>Delivered</strong> = in-person delivery orders. <strong>Shipped</strong> = direct ship orders. <strong>Credited</strong> =
        troop booth sales + direct ship allocated to scout via SC dividers. <strong>Total</strong> = delivered + shipped + donations +
        credited. <strong>Proceeds</strong> = ${proceedsRate.toFixed(2)}/pkg after first {PROCEEDS_EXEMPT_PACKAGES} exempt.{' '}
        <strong>Cash Due</strong> = pickup value minus electronic payments.
      </p>
      <DataTable
        columns={['Scout', 'Orders', 'Inventory', 'Delivered', 'Shipped', 'Donations', 'Credited', 'Total', 'Proceeds', 'Cash Due']}
        className="table-normal scout-table"
      >
        {sortedScouts.map(([name, scout]) => {
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
                sales,
                totals.shipped || 0,
                totals.donations || 0,
                <CreditedCell scout={scout} />,
                <TooltipCell tooltip={soldTooltip} tag="span">
                  {totalSold}
                </TooltipCell>,
                <ProceedsCell totals={totals} proceedsRate={proceedsRate} />,
                <CashOwedCell totals={totals} />
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
