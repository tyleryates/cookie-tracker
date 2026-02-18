import type { ComponentChildren } from 'preact';
import { SC_TRANSFER_STATUS, TRANSFER_CATEGORY, TRANSFER_TYPE } from '../../constants';
import { COOKIE_ORDER, getCookieAbbreviation, getCookieColor } from '../../cookie-constants';
import type { Transfer, UnifiedDataset, Varieties } from '../../types';
import { DataTable } from '../components/data-table';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';
import { buildVarietyTooltip, formatShortDate, isPhysicalVariety } from '../format-utils';

/** Normalize date strings to YYYY-MM-DD for consistent grouping and sorting */
export function normalizeDate(dateStr: string): string {
  const iso = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return dateStr;
}

/** Inventory direction from the troop's perspective */
type InventoryDirection = 'in' | 'out';

/** Build a human-readable type label, from/to, and direction for a transfer row */
export function describeTransfer(transfer: Transfer): { typeLabel: string; from: string; to: string; direction: InventoryDirection } {
  switch (transfer.category) {
    case TRANSFER_CATEGORY.COUNCIL_TO_TROOP:
      if (transfer.type === TRANSFER_TYPE.T2T) {
        return { typeLabel: 'T2T In', from: `Troop ${transfer.from}`, to: 'Troop', direction: 'in' };
      }
      return { typeLabel: 'C2T', from: transfer.from || 'Council', to: 'Troop', direction: 'in' };
    case TRANSFER_CATEGORY.TROOP_OUTGOING:
      return { typeLabel: 'T2T Out', from: 'Troop', to: `Troop ${transfer.to}`, direction: 'out' };
    case TRANSFER_CATEGORY.GIRL_PICKUP:
    case TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION:
    case TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION:
    case TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION:
      return { typeLabel: 'T2G', from: 'Troop', to: transfer.to || '-', direction: 'out' };
    case TRANSFER_CATEGORY.GIRL_RETURN:
      return { typeLabel: 'G2T', from: transfer.from || '-', to: 'Troop', direction: 'in' };
    default:
      return { typeLabel: transfer.type || '-', from: transfer.from || '-', to: transfer.to || '-', direction: 'out' };
  }
}

export function InventoryReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
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
  const t2tOutTransfers = transferBreakdowns.t2tOut;
  const t2gTransfers = transferBreakdowns.t2g;
  const g2tTransfers = transferBreakdowns.g2t;
  const totalOrdered = transferBreakdowns.totals.c2t;
  const totalT2TOut = transferBreakdowns.totals.t2tOut;
  const totalAllocated = transferBreakdowns.totals.t2gPhysical;
  const totalReturned = transferBreakdowns.totals.g2t;
  const netInventory = troopTotals.inventory;
  const inventoryVarieties = varieties.inventory;

  // Split C2T vs T2T In for the description
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
  const allTransfers = [...c2tTransfers, ...t2tOutTransfers, ...t2gTransfers, ...g2tTransfers].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );

  const hasTransferData = data.hasTransferData;

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Troop Inventory & Transfers</h3>
      </div>
      {banner}

      <StatCards stats={stats} />
      <table class="table-normal" style={{ marginTop: '20px' }}>
        <thead>
          <tr>
            {physicalVarieties.map((v) => {
              const color = getCookieColor(v);
              return (
                <th key={v} class="text-center" style={{ fontSize: '0.85em', whiteSpace: 'nowrap' }}>
                  {color && <span class="inventory-chip-dot" style={{ background: color }} />}
                  {getCookieAbbreviation(v)}
                </th>
              );
            })}
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

              const { typeLabel, from, to, direction } = describeTransfer(transfer);
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
