import type preact from 'preact';
import type { ComponentChildren } from 'preact';
import { ORDER_TYPE, OWNER } from '../../constants';
import { COOKIE_ORDER, getCookieAbbreviation, getCookieColor, getCookieDisplayName } from '../../cookie-constants';
import { classifyOrderStatus } from '../../order-classification';
import type { CookieType, Scout, Transfer, TransferBreakdowns, UnifiedDataset, Varieties } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { STAT_COLORS, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, formatShortDate, getActiveScouts, isPhysicalVariety } from '../format-utils';
import { buildOrderTooltip } from '../order-helpers';

// ============================================================================
// Helpers
// ============================================================================

/** Strip trailing status words from dcOrderType (e.g. "Girl Delivery Completed" → "Girl Delivery") */
function stripOrderStatus(dcOrderType: string | undefined): string {
  if (!dcOrderType) return '-';
  return dcOrderType.replace(/\s*(Completed|Complete|Pending|Needs Approval)\s*$/i, '').trim() || dcOrderType;
}

function formatOnHand(net: number): preact.JSX.Element {
  if (net < 0) return <span class="pkg-out">-{Math.abs(net)}</span>;
  if (net > 0) return <span class="pkg-in">+{net}</span>;
  return <span class="muted-text">—</span>;
}

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
    const display = netInventory > 0 ? `+${netInventory}` : `-${Math.abs(actualNet)}`;
    return (
      <>
        <span class="pkg-out">{display}</span>
        <TooltipCell tooltip={varietyList} tag="span" className="inline-alert-pill">
          {'\u26A0'}
        </TooltipCell>
      </>
    );
  }
  if (netInventory < 0) return <span class="pkg-out">-{Math.abs(netInventory)}</span>;
  if (netInventory > 0) return <span class="pkg-in">+{netInventory}</span>;
  return <span>—</span>;
}

// ============================================================================
// Detail breakdown — variety-level inventory for a single scout
// ============================================================================

/** Split sales by variety into in-person vs delivery, and sold vs requested (needs approval) */
function splitSalesByType(scout: Scout): { inPerson: Varieties; delivery: Varieties; requested: Varieties } {
  const inPerson: Varieties = {};
  const delivery: Varieties = {};
  const requested: Varieties = {};
  for (const order of scout.orders) {
    if (order.owner !== OWNER.GIRL) continue;
    if (order.orderType !== ORDER_TYPE.IN_HAND && order.orderType !== ORDER_TYPE.DELIVERY) continue;
    const isRequested = classifyOrderStatus(order.status) === 'NEEDS_APPROVAL';
    const target = isRequested ? requested : order.orderType === ORDER_TYPE.IN_HAND ? inPerson : delivery;
    for (const [v, count] of Object.entries(order.varieties)) {
      if (!isPhysicalVariety(v)) continue;
      target[v as CookieType] = (target[v as CookieType] || 0) + count;
    }
  }
  return { inPerson, delivery, requested };
}

function getScoutTransfers(scoutName: string, breakdowns: TransferBreakdowns): Array<Transfer & { direction: 'in' | 'out' }> {
  const transfers: Array<Transfer & { direction: 'in' | 'out' }> = [];
  for (const t of breakdowns.t2g) {
    if (t.to === scoutName) transfers.push({ ...t, direction: 'in' });
  }
  for (const t of breakdowns.g2t) {
    if (t.from === scoutName) transfers.push({ ...t, direction: 'out' });
  }
  transfers.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  return transfers;
}

function InventoryDetail({ scout, transferBreakdowns }: { scout: Scout; transferBreakdowns: TransferBreakdowns }) {
  const { inventory } = scout;
  const allSalesVarieties = scout.totals.$salesByVariety || {};
  const physicalVarieties = COOKIE_ORDER.filter(isPhysicalVariety);

  const hasActivity = Object.entries(inventory.varieties).some(
    ([variety, count]) => isPhysicalVariety(variety) && (count > 0 || (allSalesVarieties[variety as keyof Varieties] || 0) > 0)
  );

  if (!hasActivity) {
    return <div class="scout-breakdown muted-text">No inventory activity.</div>;
  }

  const varietyHeaderStyle = { fontSize: '0.75em', whiteSpace: 'nowrap' };
  const totalShares = physicalVarieties.length + 2;
  const twoShare = `${(2 * 100) / totalShares}%`;
  const oneShare = `${100 / totalShares}%`;

  const renderCookieCols = () => physicalVarieties.map((v) => <col key={v} style={{ width: oneShare }} />);
  const renderCookieHeaders = () =>
    physicalVarieties.map((v) => {
      const color = getCookieColor(v);
      return (
        <th key={v} class="text-center" style={varietyHeaderStyle}>
          {color && <span class="inventory-chip-dot" style={{ background: color }} />}
          {getCookieAbbreviation(v)}
        </th>
      );
    });

  // Girl's delivery/in-hand orders split by status
  const girlOrders = scout.orders.filter(
    (o) => o.owner === OWNER.GIRL && (o.orderType === ORDER_TYPE.DELIVERY || o.orderType === ORDER_TYPE.IN_HAND)
  );
  const completeOrders = girlOrders.filter((o) => classifyOrderStatus(o.status) === 'COMPLETED');
  const pendingOrders = girlOrders.filter((o) => classifyOrderStatus(o.status) === 'PENDING');
  const requestedOrders = girlOrders.filter((o) => classifyOrderStatus(o.status) === 'NEEDS_APPROVAL');

  // Complete varieties + in-person/delivery split for tooltip
  const completeVarieties: Varieties = {};
  const completeInPerson: Varieties = {};
  const completeDelivery: Varieties = {};
  for (const o of completeOrders) {
    const target = o.orderType === ORDER_TYPE.IN_HAND ? completeInPerson : completeDelivery;
    for (const [v, count] of Object.entries(o.varieties)) {
      if (!isPhysicalVariety(v)) continue;
      const key = v as CookieType;
      completeVarieties[key] = (completeVarieties[key] || 0) + count;
      target[key] = (target[key] || 0) + count;
    }
  }
  const hasCompleteDelivery = Object.values(completeDelivery).some((v) => v > 0);
  const hasCompleteInPerson = Object.values(completeInPerson).some((v) => v > 0);
  const showCompleteTip = hasCompleteDelivery || hasCompleteInPerson;

  // Requested variety totals (for Order Requests total row)
  const requestedVarieties: Varieties = {};
  for (const o of requestedOrders) {
    for (const [v, count] of Object.entries(o.varieties)) {
      if (!isPhysicalVariety(v)) continue;
      requestedVarieties[v as CookieType] = (requestedVarieties[v as CookieType] || 0) + count;
    }
  }

  // Sold = all sales minus needs-approval (for Remaining Inventory)
  const soldVarieties: Varieties = {};
  for (const v of COOKIE_ORDER) {
    if (!isPhysicalVariety(v)) continue;
    const total = allSalesVarieties[v as keyof Varieties] || 0;
    const req = requestedVarieties[v as keyof Varieties] || 0;
    if (total - req > 0) soldVarieties[v as keyof Varieties] = total - req;
  }

  const transfers = getScoutTransfers(scout.name, transferBreakdowns);

  return (
    <div class="scout-breakdown">
      {/* Summary table */}
      <table class="table-compact">
        <colgroup>
          <col style={{ width: twoShare }} />
          {renderCookieCols()}
        </colgroup>
        <thead>
          <tr>
            <th />
            {renderCookieHeaders()}
          </tr>
        </thead>
        <tbody>
          {/* Picked Up */}
          <tr>
            <td>Picked Up</td>
            {physicalVarieties.map((v) => {
              const count = inventory.varieties[v as keyof Varieties] || 0;
              return (
                <td key={v} class="text-center">
                  {count > 0 ? count : <span class="muted-text">—</span>}
                </td>
              );
            })}
          </tr>

          {/* Sold (Complete) */}
          <tr>
            <td>
              <span class="status-pill status-pill-success">Complete</span> Orders
            </td>
            {physicalVarieties.map((v) => {
              const count = completeVarieties[v as keyof Varieties] || 0;
              const ip = completeInPerson[v as keyof Varieties] || 0;
              const dl = completeDelivery[v as keyof Varieties] || 0;
              const tip =
                showCompleteTip && (ip > 0 || dl > 0)
                  ? [ip > 0 ? `In Person: ${ip}` : '', dl > 0 ? `Delivery: ${dl}` : ''].filter(Boolean).join('\n')
                  : '';
              return tip ? (
                <TooltipCell key={v} tooltip={tip} className="tooltip-cell text-center">
                  {count}
                </TooltipCell>
              ) : (
                <td key={v} class="text-center">
                  {count > 0 ? count : <span class="muted-text">—</span>}
                </td>
              );
            })}
          </tr>

          {/* Pending orders — one row each */}
          {pendingOrders.map((o) => {
            const orderTip = buildOrderTooltip(o);
            const typeText = stripOrderStatus(o.dcOrderType);
            return (
              <tr key={o.orderNumber}>
                <td>
                  <span class="status-pill status-pill-warning">Pending</span>{' '}
                  {orderTip ? (
                    <TooltipCell tooltip={orderTip} tag="span" className="tooltip-cell">
                      {typeText}
                    </TooltipCell>
                  ) : (
                    typeText
                  )}
                </td>
                {physicalVarieties.map((v) => {
                  const count = o.varieties[v as keyof Varieties] || 0;
                  return (
                    <td key={v} class="text-center">
                      {count > 0 ? count : <span class="muted-text">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* Needs Approval orders — one row each */}
          {requestedOrders.map((o) => {
            const orderTip = buildOrderTooltip(o);
            const typeText = stripOrderStatus(o.dcOrderType);
            return (
              <tr key={o.orderNumber}>
                <td>
                  <span class="status-pill status-pill-error">Needs Approval</span>{' '}
                  {orderTip ? (
                    <TooltipCell tooltip={orderTip} tag="span" className="tooltip-cell">
                      {typeText}
                    </TooltipCell>
                  ) : (
                    typeText
                  )}
                </td>
                {physicalVarieties.map((v) => {
                  const count = o.varieties[v as keyof Varieties] || 0;
                  return (
                    <td key={v} class="text-center">
                      {count > 0 ? count : <span class="muted-text">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* Remaining Inventory */}
          <tr>
            <td>Remaining Inventory</td>
            {physicalVarieties.map((v) => {
              const pickedUp = inventory.varieties[v as keyof Varieties] || 0;
              const sold = soldVarieties[v as keyof Varieties] || 0;
              const onHand = pickedUp - sold;
              return (
                <td key={v} class="text-center">
                  {formatOnHand(onHand)}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {/* Transfers table */}
      {transfers.length > 0 && (
        <>
          <h5 style={{ margin: '12px 0 4px' }}>Transfers</h5>
          <table class="table-compact">
            <colgroup>
              <col style={{ width: oneShare }} />
              <col style={{ width: oneShare }} />
              {renderCookieCols()}
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th class="text-center">Type</th>
                {renderCookieHeaders()}
              </tr>
            </thead>
            <tbody>
              {transfers.map((t, i) => {
                const varieties = t.physicalVarieties || t.varieties || {};
                const sign = t.direction === 'in' ? '+' : '\u2212';
                const cls = t.direction === 'in' ? 'pkg-in' : 'pkg-out';
                return (
                  <tr key={`${t.date}-${t.type}-${i}`}>
                    <td>{formatShortDate(t.date)}</td>
                    <td class="text-center">
                      <span class={`transfer-type-label ${t.direction === 'in' ? 'transfer-type-t2g' : 'transfer-type-g2t'}`}>
                        {t.direction === 'in' ? 'Pickup' : 'Return'}
                      </span>
                    </td>
                    {physicalVarieties.map((v) => {
                      const count = varieties[v] || 0;
                      return (
                        <td key={v} class="text-center">
                          {count > 0 ? <span class={cls}>{`${sign}${count}`}</span> : <span class="muted-text">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Main report component
// ============================================================================

export function ScoutInventoryReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
  if (!data?.scouts) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const hasNegativeInventory = (data.troopTotals.scouts.withNegativeInventory ?? 0) > 0;

  const sortedScouts = getActiveScouts(data.scouts).filter(([, scout]) => scout.inventory.total > 0);

  let totalSold = 0;
  let totalOnHand = 0;
  for (const [, scout] of sortedScouts) {
    totalSold += scout.totals.delivered || 0;
    totalOnHand += scout.totals.inventory;
  }

  const totalAllocated = data.transferBreakdowns.totals.t2gPhysical;
  const totalReturned = data.transferBreakdowns.totals.g2t;
  const netT2G = totalAllocated - totalReturned;
  const t2gDescription = totalReturned > 0 ? `${totalAllocated} out \u2212 ${totalReturned} returned` : 'Allocated to scouts';

  const stats = [
    { label: 'Transfers to Girls', value: netT2G, description: t2gDescription, color: STAT_COLORS.TEAL },
    { label: 'Packages Sold', value: totalSold, description: 'Packages sold by scouts', color: STAT_COLORS.BLUE, operator: '\u2212' },
    {
      label: 'Girl Inventory',
      value: totalOnHand,
      description: 'Packages with scouts',
      color: STAT_COLORS.GREEN,
      operator: '=',
      highlight: true
    }
  ];

  const COLUMN_COUNT = 4;

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Scout Inventory</h3>
        <span class={`report-status-badge ${hasNegativeInventory ? 'report-status-warning' : 'report-status-ok'}`}>
          {hasNegativeInventory ? 'Needs Attention' : 'No Errors'}
        </span>
      </div>
      {banner}
      <StatCards stats={stats} />

      <DataTable
        columns={['Scout', 'Picked Up', 'Packages Sold', 'Inventory']}
        columnAligns={[undefined, 'center', 'center', 'center']}
        className="table-normal scout-table"
        hint="Click a row to see inventory breakdown and transfers."
      >
        {sortedScouts.map(([name, scout]) => {
          const { totals, inventory } = scout;
          const pickedUp = inventory.total;
          const sold = totals.delivered || 0;
          const onHand = totals.inventory;

          const pickedUpTip = buildVarietyTooltip(inventory.varieties);
          const { inPerson, delivery } = splitSalesByType(scout);
          const ipTotal = Object.values(inPerson).reduce((s, n) => s + n, 0);
          const dlTotal = Object.values(delivery).reduce((s, n) => s + n, 0);
          const soldParts: string[] = [];
          if (ipTotal > 0) soldParts.push(`In Person: ${ipTotal}`);
          if (dlTotal > 0) soldParts.push(`Delivery: ${dlTotal}`);
          const soldTip = soldParts.join('\n');

          return (
            <ExpandableRow
              key={name}
              rowClass="scout-row"
              firstCell={<strong>{name}</strong>}
              cells={[
                pickedUpTip ? (
                  <TooltipCell tooltip={pickedUpTip} tag="span" className="tooltip-cell">
                    {pickedUp}
                  </TooltipCell>
                ) : (
                  pickedUp
                ),
                soldTip ? (
                  <TooltipCell tooltip={soldTip} tag="span" className="tooltip-cell">
                    {sold}
                  </TooltipCell>
                ) : (
                  sold
                ),
                <InventoryCell netInventory={onHand} negativeVarieties={scout.$issues?.negativeInventory} actualNet={onHand} />
              ]}
              cellAligns={['center', 'center', 'center']}
              detail={<InventoryDetail scout={scout} transferBreakdowns={data.transferBreakdowns} />}
              colSpan={COLUMN_COUNT}
              detailClass="scout-detail"
            />
          );
        })}
      </DataTable>
    </div>
  );
}
