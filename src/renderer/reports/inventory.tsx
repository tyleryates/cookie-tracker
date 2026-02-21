import { SC_TRANSFER_STATUS, TRANSFER_TYPE } from '../../constants';
import { COOKIE_ORDER } from '../../cookie-constants';
import type { Transfer, UnifiedDataset, Varieties } from '../../types';
import { CookieLabel } from '../components/cookie-label';
import { DataTable } from '../components/data-table';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, compareDateDesc, formatShortDate, getTransferDisplayInfo, isPhysicalVariety } from '../format-utils';
export function InventoryReport({ data }: { data: UnifiedDataset }) {
  const troopTotals = data.troopTotals;
  const transferBreakdowns = data.transferBreakdowns;
  const varieties = data.varieties;

  const c2tTransfers = transferBreakdowns.c2t;
  const t2tOutTransfers = transferBreakdowns.t2tOut;
  const t2gTransfers = transferBreakdowns.t2g;
  const g2tTransfers = transferBreakdowns.g2t;
  const totalOrdered = transferBreakdowns.totals.c2t;
  const totalT2TOut = transferBreakdowns.totals.t2tOut;
  const totalAllocated = transferBreakdowns.totals.t2gPhysical;
  const totalReturned = transferBreakdowns.totals.g2t;
  const netInventory = troopTotals.inventory;
  const inventoryVarieties = varieties.inventory;

  // Split C2T vs T2T In for the description (transferBreakdowns.totals doesn't have
  // a separate t2tIn field, so we filter from c2tTransfers which includes both)
  const t2tInTotal = c2tTransfers.filter((t) => t.type === TRANSFER_TYPE.T2T).reduce((sum, t) => sum + (t.physicalPackages || 0), 0);
  const pureC2T = totalOrdered - t2tInTotal;
  const totalPackages = totalOrdered - totalT2TOut;
  const descParts = [`${pureC2T} C2T`];
  if (t2tInTotal > 0) descParts.push(`+ ${t2tInTotal} T2T In`);
  if (totalT2TOut > 0) descParts.push(`− ${totalT2TOut} T2T Out`);
  const packagesDesc = descParts.join(' ');

  // T2G net of returns
  const netT2G = totalAllocated - totalReturned;
  const t2gDescription = totalReturned > 0 ? `${totalAllocated} out − ${totalReturned} returned` : 'Allocated to scouts';

  const stats: Stat[] = [
    { label: 'Physical Packages', value: totalPackages, description: packagesDesc, color: STAT_COLORS.BLUE },
    { label: 'Transfers to Girls', value: netT2G, description: t2gDescription, color: STAT_COLORS.TEAL, operator: '\u2212' },
    {
      label: 'Troop Package Sales',
      value: troopTotals.boothDividerT2G + troopTotals.virtualBoothT2G,
      description: `${troopTotals.boothDividerT2G} booth + ${troopTotals.virtualBoothT2G} online`,
      color: STAT_COLORS.PURPLE,
      operator: '\u2212'
    },
    {
      label: 'Troop Inventory',
      value: netInventory,
      description: 'Packages on hand',
      color: STAT_COLORS.GREEN,
      operator: '=',
      highlight: true
    }
  ];

  const physicalVarieties = COOKIE_ORDER.filter(isPhysicalVariety);

  // Combine all transfers into one sorted list
  const allTransfers = [...c2tTransfers, ...t2tOutTransfers, ...t2gTransfers, ...g2tTransfers].sort((a, b) =>
    compareDateDesc(a.date, b.date)
  );

  const hasTransferData = data.hasTransferData;

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Troop Inventory & Transfers</h3>
      </div>

      {!hasTransferData && (
        <div class="info-box info-box-warning">
          <p class="meta-text">
            <strong>No Smart Cookie Data</strong>
          </p>
          <p class="meta-text">
            Inventory pickups (C2T transfers) come from Smart Cookies.
            <br />
            Click the refresh button in the header to download Smart Cookie data including Initial Order and Cupboard Order pickups.
          </p>
        </div>
      )}

      <StatCards stats={stats} />
      <table class="table-normal">
        <thead>
          <tr>
            {physicalVarieties.map((v) => (
              <th key={v} class="text-center" style={{ fontSize: '0.85em', whiteSpace: 'nowrap' }}>
                <CookieLabel variety={v} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {physicalVarieties.map((v) => {
              const count = (inventoryVarieties as Varieties)?.[v as keyof Varieties] || 0;
              return (
                <td key={v} class="text-center">
                  <strong>{count}</strong>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {allTransfers.length > 0 && (
        <>
          <h4>Transfers</h4>
          <DataTable
            columns={['Date', 'Type', 'From', 'To', 'Packages', 'Status']}
            columnAligns={[undefined, 'center', undefined, undefined, 'center', 'center']}
          >
            {allTransfers.map((transfer: Transfer, i: number) => {
              const isPending =
                transfer.status === SC_TRANSFER_STATUS.SAVED ||
                (transfer.actions && (transfer.actions.submittable || transfer.actions.approvable));
              const statusText = isPending ? 'Pending' : 'Completed';
              const statusClass = isPending ? 'status-pill status-pill-warning' : 'status-pill status-pill-success';

              const { typeLabel, from, to, direction } = getTransferDisplayInfo(transfer);
              const packages = transfer.packages || 0;
              const pkgDisplay = direction === 'out' ? `-${packages}` : `+${packages}`;
              const pkgClass = direction === 'out' ? 'pkg-out' : 'pkg-in';
              const tip = buildVarietyTooltip(transfer.varieties);

              return (
                <tr key={i}>
                  <td>{formatShortDate(transfer.date)}</td>
                  <td class="text-center">
                    <span class={`transfer-type-label transfer-type-${typeLabel.toLowerCase().replace(/\s+/g, '-')}`}>{typeLabel}</span>
                  </td>
                  <td>{from === 'Troop' ? <span class="troop-pill">Troop</span> : from}</td>
                  <td>{to === 'Troop' ? <span class="troop-pill">Troop</span> : to}</td>
                  {tip ? (
                    <TooltipCell tooltip={tip} className={`tooltip-cell ${pkgClass} text-center`}>
                      {pkgDisplay}
                    </TooltipCell>
                  ) : (
                    <td class={`${pkgClass} text-center`}>{pkgDisplay}</td>
                  )}
                  <td class="text-center">
                    <span class={statusClass}>{statusText}</span>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </>
      )}

      {c2tTransfers.length === 0 && hasTransferData && (
        <div class="info-box info-box-neutral" style={{ margin: '30px 0' }}>
          <p class="meta-text">
            <strong>Note:</strong> No C2T (Council to Troop) inventory pickups found in Smart Cookie data. C2T transfers appear after
            picking up your Initial Order on Delivery Day or Cupboard Orders during the season.
          </p>
        </div>
      )}
    </div>
  );
}
