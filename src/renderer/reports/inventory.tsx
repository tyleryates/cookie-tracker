import { PACKAGES_PER_CASE, SC_TRANSFER_STATUS, TRANSFER_CATEGORY, TRANSFER_TYPE } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import type { Transfer, UnifiedDataset, Varieties } from '../../types';
import { DataTable } from '../components/data-table';
import { StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, formatCurrency, formatDate, getCompleteVarieties, sortVarietiesByOrder } from '../format-utils';

function transferTooltip(varieties: Varieties | undefined, transform?: (count: number) => number): string {
  if (!varieties || Object.keys(varieties).length === 0) return '';
  const transformed: Varieties = {};
  for (const [variety, count] of Object.entries(varieties)) {
    transformed[variety as keyof Varieties] = transform ? transform(count) : count;
  }
  return buildVarietyTooltip(transformed);
}

export function InventoryReport({ data }: { data: UnifiedDataset }) {
  if (!data?.transferBreakdowns) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const troopTotals = data.troopTotals;
  const transferBreakdowns = data.transferBreakdowns;
  const varieties = data.varieties;

  const c2tTransfers = transferBreakdowns.c2t;
  const t2gTransfers = transferBreakdowns.t2g;
  const g2tTransfers = transferBreakdowns.g2t;
  const totalOrdered = transferBreakdowns.totals.c2t;
  const totalAllocated = transferBreakdowns.totals.t2gPhysical;
  const totalReturned = transferBreakdowns.totals.g2t;
  const netInventory = troopTotals.inventory;
  const inventoryVarieties = varieties.inventory;
  const troopSold = troopTotals.boothDividerT2G + troopTotals.virtualBoothT2G;

  const stats: Array<{ label: string; value: number; description: string; color: string }> = [
    { label: 'Total Received', value: totalOrdered, description: 'C2T and T2T pickups', color: '#2196F3' },
    { label: 'Allocated to Scouts (T2G)', value: totalAllocated, description: 'Physical packages only', color: '#4CAF50' },
    { label: 'Troop Sold', value: troopSold, description: 'Booth & troop delivery', color: '#00897B' }
  ];
  if (totalReturned > 0) {
    stats.push({ label: 'Returns (G2T)', value: totalReturned, description: 'Returned from scouts', color: '#FF9800' });
  }
  stats.push({ label: 'Troop Inventory', value: netInventory, description: 'Packages on hand', color: '#9C27B0' });

  const inventoryRows = sortVarietiesByOrder(Object.entries(getCompleteVarieties(inventoryVarieties))).filter(
    ([variety]) => variety !== COOKIE_TYPE.COOKIE_SHARE
  );

  const allScoutTransfers = [...t2gTransfers, ...g2tTransfers].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );

  const hasTransferData = data.hasTransferData;

  return (
    <div class="report-visual">
      <h3>Inventory Report</h3>
      <p class="meta-text" style={{ marginBottom: '20px' }}>
        Track inventory from Council to Troop to Scouts
      </p>

      <StatCards stats={stats} />

      <h4>Net Troop Inventory by Variety</h4>
      <DataTable columns={['Variety', 'Packages', '']}>
        {inventoryRows.map(([variety, count]) => {
          const cases = Math.floor(count / PACKAGES_PER_CASE);
          const remaining = count % PACKAGES_PER_CASE;
          let breakdown = '';
          if (cases > 0 && remaining > 0)
            breakdown = `${cases} case${cases !== 1 ? 's' : ''} + ${remaining} pkg${remaining !== 1 ? 's' : ''}`;
          else if (cases > 0) breakdown = `${cases} case${cases !== 1 ? 's' : ''}`;
          else breakdown = `${remaining} pkg${remaining !== 1 ? 's' : ''}`;

          return (
            <tr key={variety}>
              <td>{getCookieDisplayName(variety)}</td>
              <td>{count}</td>
              <td class="meta-text">{breakdown}</td>
            </tr>
          );
        })}
      </DataTable>

      {c2tTransfers.length > 0 && (
        <>
          <h4>Inventory Received (C2T / T2T)</h4>
          <p class="meta-text">
            {totalOrdered} packages received across {c2tTransfers.length} pickups
          </p>
          <DataTable columns={['Date', 'From', 'Order #', 'Cases', 'Packages', 'Amount', 'Status']}>
            {c2tTransfers.map((transfer: Transfer, i: number) => {
              const isPending =
                transfer.status === SC_TRANSFER_STATUS.SAVED ||
                (transfer.actions && (transfer.actions.submittable || transfer.actions.approvable));
              const statusText = isPending ? 'Pending' : 'Completed';
              const statusClass = isPending ? 'status-warning' : 'status-success';
              const tip = transferTooltip(transfer.varieties);
              const casesTip = transferTooltip(transfer.varieties, (count) => Math.round(count / PACKAGES_PER_CASE));
              const fromLabel = transfer.type === TRANSFER_TYPE.T2T ? `Troop ${transfer.from}` : transfer.from || 'Council';

              return (
                <tr key={i}>
                  <td>{formatDate(transfer.date)}</td>
                  <td>{fromLabel}</td>
                  <td>{String(transfer.orderNumber || '-')}</td>
                  {casesTip ? <TooltipCell tooltip={casesTip}>{transfer.cases || 0}</TooltipCell> : <td>{transfer.cases || 0}</td>}
                  {tip ? <TooltipCell tooltip={tip}>{transfer.packages || 0}</TooltipCell> : <td>{transfer.packages || 0}</td>}
                  <td>{formatCurrency(transfer.amount ?? 0)}</td>
                  <td class={statusClass}>{statusText}</td>
                </tr>
              );
            })}
          </DataTable>
        </>
      )}

      {allScoutTransfers.length > 0 && (
        <>
          <h4>Scout Transfers (T2G / G2T)</h4>
          <p class="meta-text">
            {totalAllocated} physical packages allocated across {t2gTransfers.length} transfers
            {totalReturned > 0 ? `, ${totalReturned} returned across ${g2tTransfers.length}` : ''}
          </p>
          <DataTable columns={['Date', 'Scout', 'Packages', 'Amount']}>
            {allScoutTransfers.map((transfer: Transfer, i: number) => {
              const isReturn = transfer.category === TRANSFER_CATEGORY.GIRL_RETURN;
              const scoutName = isReturn ? transfer.from : transfer.to;
              const packages = transfer.packages || 0;
              const displayPackages = isReturn ? -packages : packages;
              const tip = transferTooltip(transfer.varieties, isReturn ? (count) => -count : undefined);
              const cellClass = isReturn ? 'status-warning-dark' : '';

              return (
                <tr key={i}>
                  <td>{formatDate(transfer.date)}</td>
                  <td>{String(scoutName || '-')}</td>
                  {tip ? (
                    <TooltipCell tooltip={tip} className={cellClass ? `tooltip-cell ${cellClass}` : undefined}>
                      {displayPackages}
                    </TooltipCell>
                  ) : (
                    <td class={cellClass}>{displayPackages}</td>
                  )}
                  <td class={cellClass}>{formatCurrency(transfer.amount ?? 0)}</td>
                </tr>
              );
            })}
          </DataTable>
        </>
      )}

      {c2tTransfers.length === 0 &&
        (hasTransferData ? (
          <div class="info-box info-box-neutral" style={{ margin: '30px 0' }}>
            <p class="meta-text">
              <strong>Note:</strong> No C2T (Council to Troop) inventory pickups found in Smart Cookie data. C2T transfers appear after
              picking up your Initial Order on Delivery Day or Cupboard Orders during the season.
            </p>
          </div>
        ) : (
          <div class="info-box info-box-warning">
            <p class="meta-text">
              <strong>No Smart Cookie Data</strong>
            </p>
            <p class="meta-text">
              Inventory pickups (C2T transfers) come from Smart Cookies. Click "Sync from Websites" to download Smart Cookie data including
              Initial Order and Cupboard Order pickups.
            </p>
          </div>
        ))}
    </div>
  );
}
