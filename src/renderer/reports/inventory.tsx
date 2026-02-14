import { PACKAGES_PER_CASE, SC_TRANSFER_STATUS, TRANSFER_CATEGORY, TRANSFER_TYPE } from '../../constants';
import { COOKIE_TYPE, getCookieColor, getCookieDisplayName } from '../../cookie-constants';
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

/** Inventory direction from the troop's perspective */
type InventoryDirection = 'in' | 'out';

/** Build a human-readable type label, from/to, and direction for a transfer row */
function describeTransfer(transfer: Transfer): { typeLabel: string; from: string; to: string; direction: InventoryDirection } {
  switch (transfer.category) {
    case TRANSFER_CATEGORY.COUNCIL_TO_TROOP:
      if (transfer.type === TRANSFER_TYPE.T2T) {
        return { typeLabel: 'T2T In', from: `Troop ${transfer.from}`, to: 'Troop', direction: 'in' };
      }
      return { typeLabel: 'C2T', from: transfer.from || 'Council', to: 'Troop', direction: 'in' };
    case TRANSFER_CATEGORY.TROOP_OUTGOING:
      return { typeLabel: 'T2T Out', from: 'Troop', to: `Troop ${transfer.to}`, direction: 'out' };
    case TRANSFER_CATEGORY.GIRL_PICKUP:
      return { typeLabel: 'T2G', from: 'Troop', to: transfer.to || '-', direction: 'out' };
    case TRANSFER_CATEGORY.GIRL_RETURN:
      return { typeLabel: 'G2T', from: transfer.from || '-', to: 'Troop', direction: 'in' };
    case TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION:
      return { typeLabel: 'T2G', from: 'Troop', to: transfer.to || '-', direction: 'out' };
    case TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION:
      return { typeLabel: 'T2G', from: 'Troop', to: transfer.to || '-', direction: 'out' };
    case TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION:
      return { typeLabel: 'T2G', from: 'Troop', to: transfer.to || '-', direction: 'out' };
    default:
      return { typeLabel: transfer.type || '-', from: transfer.from || '-', to: transfer.to || '-', direction: 'out' };
  }
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

  const stats: Array<{ label: string; value: number; description: string; color: string; operator?: string }> = [
    { label: 'Total Packages', value: totalPackages, description: packagesDesc, color: '#1565C0' },
    { label: 'Girl Transfers', value: netT2G, description: t2gDescription, color: '#00838F', operator: '\u2212' },
    {
      label: 'Troop Sales',
      value: troopTotals.boothDividerT2G + troopTotals.virtualBoothT2G,
      description: `${troopTotals.boothDividerT2G} booth + ${troopTotals.virtualBoothT2G} site`,
      color: '#7B1FA2',
      operator: '\u2212'
    },
    { label: 'Troop Inventory', value: netInventory, description: 'Packages on hand', color: '#E65100', operator: '=' }
  ];

  const inventoryRows = sortVarietiesByOrder(Object.entries(getCompleteVarieties(inventoryVarieties))).filter(
    ([variety]) => variety !== COOKIE_TYPE.COOKIE_SHARE
  );

  // Combine all transfers into one sorted list
  const allTransfers = [...c2tTransfers, ...t2tOutTransfers, ...t2gTransfers, ...g2tTransfers].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );

  const hasTransferData = data.hasTransferData;

  return (
    <div class="report-visual">
      <h3>Troop Inventory</h3>

      <StatCards stats={stats} />
      <DataTable columns={['Variety', 'Packages', '']}>
        {inventoryRows.map(([variety, count]) => {
          const cases = Math.floor(count / PACKAGES_PER_CASE);
          const remaining = count % PACKAGES_PER_CASE;
          let breakdown = '';
          if (cases > 0 && remaining > 0)
            breakdown = `${cases} case${cases !== 1 ? 's' : ''} + ${remaining} pkg${remaining !== 1 ? 's' : ''}`;
          else if (cases > 0) breakdown = `${cases} case${cases !== 1 ? 's' : ''}`;
          else breakdown = `${remaining} pkg${remaining !== 1 ? 's' : ''}`;

          const color = getCookieColor(variety);
          return (
            <tr key={variety}>
              <td>
                {color && (
                  <span
                    class="inventory-chip-dot"
                    style={{ background: color, display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }}
                  />
                )}
                {getCookieDisplayName(variety)}
              </td>
              <td>{count}</td>
              <td class="meta-text">{breakdown}</td>
            </tr>
          );
        })}
      </DataTable>

      {allTransfers.length > 0 && (
        <>
          <h4>Transfers</h4>
          <DataTable columns={['Date', 'Type', 'From', 'To', 'Packages', 'Amount', 'Status']}>
            {allTransfers.map((transfer: Transfer, i: number) => {
              const isPending =
                transfer.status === SC_TRANSFER_STATUS.SAVED ||
                (transfer.actions && (transfer.actions.submittable || transfer.actions.approvable));
              const statusText = isPending ? 'Pending' : 'Completed';
              const statusClass = isPending ? 'status-warning' : 'status-success';

              const { typeLabel, from, to, direction } = describeTransfer(transfer);
              const packages = transfer.packages || 0;
              const pkgDisplay = direction === 'out' ? `- ${packages}` : `+ ${packages}`;
              const pkgClass = direction === 'out' ? 'pkg-out' : 'pkg-in';
              const tip = transferTooltip(transfer.varieties);

              return (
                <tr key={i}>
                  <td>{formatDate(transfer.date)}</td>
                  <td>
                    <span class={`transfer-type-label transfer-type-${typeLabel.toLowerCase().replace(/\s+/g, '-')}`}>{typeLabel}</span>
                  </td>
                  <td>{from === 'Troop' ? <span class="troop-pill">Troop</span> : from}</td>
                  <td>{to === 'Troop' ? <span class="troop-pill">Troop</span> : to}</td>
                  {tip ? (
                    <TooltipCell tooltip={tip} className={`tooltip-cell ${pkgClass}`}>
                      {pkgDisplay}
                    </TooltipCell>
                  ) : (
                    <td class={pkgClass}>{pkgDisplay}</td>
                  )}
                  <td>{formatCurrency(transfer.amount ?? 0)}</td>
                  <td class={statusClass}>{statusText}</td>
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
