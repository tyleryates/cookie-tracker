import type preact from 'preact';
import type { ComponentChildren } from 'preact';
import { ORDER_TYPE, OWNER } from '../../constants';
import { getCookieColor, getCookieDisplayName } from '../../cookie-constants';
import type { CookieType, Scout, Transfer, TransferBreakdowns, UnifiedDataset, Varieties } from '../../types';
import { DataTable } from '../components/data-table';
import { ExpandableRow } from '../components/expandable-row';
import { STAT_COLORS, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, formatShortDate, isPhysicalVariety, sortVarietiesByOrder } from '../format-utils';

// ============================================================================
// Helpers
// ============================================================================

function formatOnHand(net: number): preact.JSX.Element {
  if (net < 0) return <span class="status-error">- {Math.abs(net)} ⚠️</span>;
  if (net > 0) return <span class="pkg-in">+ {net}</span>;
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

// ============================================================================
// Detail breakdown — variety-level inventory for a single scout
// ============================================================================

/** Split sales by variety into in-person (IN_HAND) vs DC delivery (DELIVERY) */
function splitSalesByType(scout: Scout): { inPerson: Varieties; delivery: Varieties } {
  const inPerson: Varieties = {};
  const delivery: Varieties = {};
  for (const order of scout.orders) {
    if (order.owner !== OWNER.GIRL) continue;
    const target = order.orderType === ORDER_TYPE.IN_HAND ? inPerson : order.orderType === ORDER_TYPE.DELIVERY ? delivery : null;
    if (!target) continue;
    for (const [v, count] of Object.entries(order.varieties)) {
      if (!isPhysicalVariety(v)) continue;
      target[v as CookieType] = (target[v as CookieType] || 0) + count;
    }
  }
  return { inPerson, delivery };
}

function getScoutTransfers(scoutName: string, breakdowns: TransferBreakdowns): Array<Transfer & { direction: 'in' | 'out' }> {
  const transfers: Array<Transfer & { direction: 'in' | 'out' }> = [];
  for (const t of breakdowns.t2g) {
    if (t.to === scoutName) transfers.push({ ...t, direction: 'in' });
  }
  for (const t of breakdowns.g2t) {
    if (t.from === scoutName) transfers.push({ ...t, direction: 'out' });
  }
  transfers.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
  return transfers;
}

function InventoryDetail({ scout, transferBreakdowns }: { scout: Scout; transferBreakdowns: TransferBreakdowns }) {
  const { inventory } = scout;
  const salesVarieties = scout.totals.$salesByVariety || {};
  const { inPerson, delivery } = splitSalesByType(scout);

  const varietyEntries = sortVarietiesByOrder(
    Object.entries(inventory.varieties).filter(([variety, count]) => {
      if (!isPhysicalVariety(variety)) return false;
      const sold = salesVarieties[variety as keyof Varieties] || 0;
      return count > 0 || sold > 0;
    })
  );

  if (varietyEntries.length === 0) {
    return <div class="scout-breakdown muted-text">No inventory activity.</div>;
  }

  const hasDelivery = Object.values(delivery).some((v) => v > 0);
  const hasInPerson = Object.values(inPerson).some((v) => v > 0);
  const showSplitTip = hasDelivery || hasInPerson;

  return (
    <div class="scout-breakdown">
      <DataTable
        columns={['Variety', 'Picked Up', 'Sold', 'On Hand']}
        columnAligns={[undefined, 'center', 'center', 'center']}
        className="table-compact inventory-table"
      >
        {varietyEntries.map(([variety]) => {
          const v = variety as keyof Varieties;
          const pickedUp = inventory.varieties[v] || 0;
          const sold = salesVarieties[v] || 0;
          const onHand = pickedUp - sold;
          const color = getCookieColor(variety);

          const ip = inPerson[v] || 0;
          const dl = delivery[v] || 0;
          const soldTip =
            showSplitTip && (ip > 0 || dl > 0)
              ? [ip > 0 ? `In Person: ${ip}` : '', dl > 0 ? `Delivery: ${dl}` : ''].filter(Boolean).join('\n')
              : '';

          return (
            <tr key={variety}>
              <td>
                {color && <span class="inventory-chip-dot" style={{ background: color }} />}
                {getCookieDisplayName(variety)}
              </td>
              <td class="text-center">{pickedUp}</td>
              {soldTip ? (
                <TooltipCell tooltip={soldTip} className="tooltip-cell text-center">
                  {sold}
                </TooltipCell>
              ) : (
                <td class="text-center">{sold}</td>
              )}
              <td class="text-center">{formatOnHand(onHand)}</td>
            </tr>
          );
        })}
      </DataTable>
      {(() => {
        const transfers = getScoutTransfers(scout.name, transferBreakdowns);
        if (transfers.length === 0) return null;
        return (
          <>
            <h5 style={{ margin: '12px 0 4px' }}>Transfers</h5>
            <DataTable
              columns={['Date', 'Type', 'Packages', 'Varieties']}
              columnAligns={[undefined, undefined, 'center', undefined]}
              className="table-compact"
            >
              {transfers.map((t, i) => {
                const tip = buildVarietyTooltip(t.physicalVarieties || t.varieties);
                return (
                  <tr key={`${t.date}-${t.type}-${i}`}>
                    <td>{formatShortDate(t.date)}</td>
                    <td>{t.direction === 'in' ? <span class="pkg-in">Pickup</span> : <span class="pkg-out">Return</span>}</td>
                    <td class="text-center">
                      <span class={t.direction === 'in' ? 'pkg-in' : 'pkg-out'}>
                        {t.direction === 'in' ? '+' : '\u2212'}
                        {t.physicalPackages || t.packages}
                      </span>
                    </td>
                    {tip ? (
                      <TooltipCell tooltip={tip} className="tooltip-cell">
                        {Object.keys(t.physicalVarieties || t.varieties || {}).length} varieties
                      </TooltipCell>
                    ) : (
                      <td class="muted-text">—</td>
                    )}
                  </tr>
                );
              })}
            </DataTable>
          </>
        );
      })()}
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

  const sortedScouts = Object.entries(data.scouts)
    .filter(([_name, scout]) => !scout.isSiteOrder && scout.inventory.total > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

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
    { label: 'Packages Sold', value: totalSold, description: 'Packages sold by scouts', color: STAT_COLORS.GREEN, operator: '\u2212' },
    {
      label: 'Girl Inventory',
      value: totalOnHand,
      description: 'Packages with scouts',
      color: totalOnHand > 0 ? STAT_COLORS.ORANGE : STAT_COLORS.GREEN,
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
          {hasNegativeInventory ? 'Needs Attention' : 'All OK'}
        </span>
      </div>
      {banner}

      {hasNegativeInventory && <div class="info-box info-box-warning">Scouts are missing cookies for placed orders.</div>}

      <StatCards stats={stats} />

      <DataTable
        columns={['Scout', 'Picked Up', 'Packages Sold', 'On Hand']}
        columnAligns={[undefined, 'center', 'center', 'center']}
        className="table-normal scout-table"
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
