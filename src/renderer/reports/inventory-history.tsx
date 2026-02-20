import type { ComponentChildren } from 'preact';
import { ALLOCATION_CHANNEL, TRANSFER_TYPE } from '../../constants';
import type { UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { TooltipCell } from '../components/tooltip-cell';
import { formatShortDate, getTransferDisplayInfo, normalizeDate } from '../format-utils';

export function InventoryHistoryReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
  if (!data?.transferBreakdowns) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const { c2t, t2tOut, t2g, g2t } = data.transferBreakdowns;
  const allTransfers = [...c2t, ...t2tOut, ...t2g, ...g2t].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );

  if (allTransfers.length === 0) {
    return (
      <div class="report-visual">
        <p>No transfer data available.</p>
      </div>
    );
  }

  // Compute end-of-day running troop inventory from transfers + booth/virtual booth allocations.
  // Direct ship is excluded (shipped from supplier, never in troop inventory).
  // PLANNED transfers are excluded (pending C2T pickups).
  type DailyChange = { in: number; out: number; inDetails: Map<string, number>; outDetails: Map<string, number> };
  const dailyChanges = new Map<string, DailyChange>();
  const getEntry = (key: string): DailyChange => {
    let entry = dailyChanges.get(key);
    if (!entry) {
      entry = { in: 0, out: 0, inDetails: new Map(), outDetails: new Map() };
      dailyChanges.set(key, entry);
    }
    return entry;
  };
  for (const t of allTransfers) {
    if (!t.date) continue;
    if (t.type === TRANSFER_TYPE.PLANNED) continue;
    const pkg = t.physicalPackages || 0;
    if (pkg === 0) continue;
    const key = normalizeDate(t.date);
    const entry = getEntry(key);
    const { typeLabel, direction } = getTransferDisplayInfo(t);
    if (direction === 'in') {
      entry.in += pkg;
      entry.inDetails.set(typeLabel, (entry.inDetails.get(typeLabel) || 0) + pkg);
    } else {
      entry.out += pkg;
      entry.outDetails.set(typeLabel, (entry.outDetails.get(typeLabel) || 0) + pkg);
    }
  }
  // Include booth and virtual booth allocations (troop package sales not in TransferBreakdowns)
  for (const scout of Object.values(data.scouts)) {
    if (scout.isSiteOrder) continue;
    for (const a of scout.allocations) {
      if (a.channel !== ALLOCATION_CHANNEL.BOOTH && a.channel !== ALLOCATION_CHANNEL.VIRTUAL_BOOTH) continue;
      if (!a.date) continue;
      const pkg = a.packages || 0;
      if (pkg === 0) continue;
      const key = normalizeDate(a.date);
      const entry = getEntry(key);
      const label = a.channel === ALLOCATION_CHANNEL.BOOTH ? 'Booth Sales' : 'Site Sales';
      entry.out += pkg;
      entry.outDetails.set(label, (entry.outDetails.get(label) || 0) + pkg);
    }
  }
  const sortedDays = [...dailyChanges.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let running = 0;
  const rows = sortedDays.map(([date, change]) => {
    const net = change.in - change.out;
    running += net;
    return {
      date,
      in: change.in,
      out: change.out,
      net,
      balance: running,
      inDetails: change.inDetails,
      outDetails: change.outDetails
    };
  });

  const breakdownTip = (details: Map<string, number>): string =>
    [...details.entries()].map(([label, count]) => `${label}: ${count}`).join('\n');

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Inventory History</h3>
      </div>
      {banner}
      <DataTable
        columns={['Date', 'In', 'Out', 'Net', 'Balance']}
        className="table-compact"
        columnAligns={[undefined, 'center', 'center', 'center', 'center']}
      >
        {rows.map((row) => {
          const inTip = breakdownTip(row.inDetails);
          const outTip = breakdownTip(row.outDetails);
          const netParts: string[] = [];
          for (const [label, count] of row.inDetails) netParts.push(`+${count} ${label}`);
          for (const [label, count] of row.outDetails) netParts.push(`\u2212${count} ${label}`);
          const netTip = netParts.join('\n');
          return (
            <tr key={row.date}>
              <td>{formatShortDate(row.date)}</td>
              {inTip ? (
                <TooltipCell tooltip={inTip} className="tooltip-cell pkg-in text-center">
                  +{row.in}
                </TooltipCell>
              ) : (
                <td class="pkg-in text-center">+{row.in}</td>
              )}
              {outTip ? (
                <TooltipCell tooltip={outTip} className="tooltip-cell pkg-out text-center">
                  -{row.out}
                </TooltipCell>
              ) : (
                <td class="pkg-out text-center">-{row.out}</td>
              )}
              {netTip ? (
                <TooltipCell tooltip={netTip} className="tooltip-cell text-center">
                  {row.net >= 0 ? `+${row.net}` : row.net}
                </TooltipCell>
              ) : (
                <td class="text-center">{row.net >= 0 ? `+${row.net}` : row.net}</td>
              )}
              <td class="text-center">
                <strong>{row.balance}</strong>
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
