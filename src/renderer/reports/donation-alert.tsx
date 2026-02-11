import { isDCAutoSync } from '../../constants';
import { channelTotals } from '../../data-processing/calculators/helpers';
import type { Order, Scout, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { StatCards } from '../components/stat-cards';

interface ScoutDonationRow {
  name: string;
  dcAutoSync: number;
  manualNeeded: number;
  dcTotal: number;
  manualEntered: number;
  boothCS: number;
  totalCS: number;
  adjustment: number;
}

function StatusBanner({ adjustmentNeeded }: { adjustmentNeeded: number }) {
  if (adjustmentNeeded === 0) {
    return (
      <div class="info-box info-box-success">
        <p>
          <strong>Reconciled — no manual entries needed in Smart Cookie.</strong>
        </p>
      </div>
    );
  }
  if (adjustmentNeeded > 0) {
    return (
      <div class="info-box info-box-warning">
        <p>
          <strong>
            Add {adjustmentNeeded} Cookie Share package{adjustmentNeeded !== 1 ? 's' : ''} in Smart Cookie (Orders → Virtual Cookie Share).
          </strong>
        </p>
      </div>
    );
  }
  const count = Math.abs(adjustmentNeeded);
  return (
    <div class="info-box info-box-error">
      <p>
        <strong>
          Remove {count} Cookie Share package{count !== 1 ? 's' : ''} from Smart Cookie.
        </strong>
      </p>
    </div>
  );
}

function computeScoutDonations(scout: Scout): { dcTotal: number; dcAutoSync: number } {
  let dcTotal = 0;
  let dcAutoSync = 0;
  scout.orders.forEach((order: Order) => {
    if (order.donations > 0) {
      dcTotal += order.donations;
      if (isDCAutoSync(order.dcOrderType || '', order.paymentStatus || '')) {
        dcAutoSync += order.donations;
      }
    }
  });
  return { dcTotal, dcAutoSync };
}

function buildScoutDonationRows(scouts: Map<string, Scout>, virtualCSAllocations: Map<number, number> | null): ScoutDonationRow[] {
  const rows: ScoutDonationRow[] = [];
  scouts.forEach((scout: Scout, scoutName: string) => {
    if (scout.isSiteOrder) return;
    const { dcTotal, dcAutoSync } = computeScoutDonations(scout);
    const manualNeeded = dcTotal - dcAutoSync;
    const boothCS = channelTotals(scout.allocations, 'booth').donations;
    const totalCS = dcTotal + boothCS;
    if (totalCS === 0) return;

    let manualEntered = 0;
    if (virtualCSAllocations && scout.girlId && virtualCSAllocations.has(scout.girlId)) {
      manualEntered = virtualCSAllocations.get(scout.girlId);
    }

    rows.push({
      name: scoutName,
      dcAutoSync,
      manualNeeded,
      dcTotal,
      manualEntered,
      boothCS,
      totalCS,
      adjustment: manualNeeded - manualEntered
    });
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function AdjustmentCell({ adjustment }: { adjustment: number }) {
  if (adjustment > 0)
    return (
      <td class="status-warning">
        <strong>+{adjustment}</strong>
      </td>
    );
  if (adjustment < 0)
    return (
      <td class="status-error">
        <strong>{adjustment}</strong>
      </td>
    );
  return <td class="status-success">—</td>;
}

export function DonationAlertReport({
  data,
  virtualCSAllocations
}: {
  data: UnifiedDataset;
  virtualCSAllocations: Map<number, number> | null;
}) {
  if (!data?.cookieShare) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const cookieShare = data.cookieShare;
  const scouts = data.scouts;

  const totalDCDonations = cookieShare.digitalCookie.total;
  const manualEntryDonations = cookieShare.digitalCookie.manualEntry;
  const manualCookieShareEntries = cookieShare.smartCookie.manualEntries;
  const totalBoothCookieShare = data.troopTotals.boothSalesDonations;
  const totalCookieShare = totalDCDonations + totalBoothCookieShare;
  const adjustmentNeeded = manualEntryDonations - manualCookieShareEntries;

  const stats: Array<{ label: string; value: string | number; description: string; color: string }> = [
    { label: 'DC Donations', value: totalDCDonations, description: 'From online orders', color: '#2196F3' }
  ];
  if (totalBoothCookieShare > 0) {
    stats.push({ label: 'Booth Donations', value: totalBoothCookieShare, description: 'From booth sales', color: '#7B1FA2' });
  }
  stats.push({ label: 'Total Donations', value: totalCookieShare, description: 'All Cookie Share', color: '#00897B' });
  stats.push({
    label: 'Needs Entry',
    value: adjustmentNeeded === 0 ? '—' : adjustmentNeeded > 0 ? `+${adjustmentNeeded}` : `${adjustmentNeeded}`,
    description: 'Manual SC adjustment',
    color: adjustmentNeeded === 0 ? '#4CAF50' : adjustmentNeeded > 0 ? '#ff9800' : '#f44336'
  });

  const hasBoothCS = totalBoothCookieShare > 0;
  const scoutRows = buildScoutDonationRows(scouts, virtualCSAllocations);

  const headers = ['Scout', 'DC Auto', 'DC Manual', 'SC Entered'];
  if (hasBoothCS) headers.push('Booth');
  headers.push('Total', 'Adjustment');

  return (
    <div class="report-visual">
      <h3>Cookie Share Reconciliation</h3>
      <StatCards stats={stats} />
      <StatusBanner adjustmentNeeded={adjustmentNeeded} />

      {scoutRows.length > 0 && (
        <DataTable columns={headers}>
          {scoutRows.map(({ name, dcAutoSync, manualNeeded, manualEntered, boothCS, totalCS, adjustment }) => (
            <tr key={name} class={adjustment > 0 ? 'row-highlight-warning' : adjustment < 0 ? 'row-highlight-error' : undefined}>
              <td>
                <strong>{name}</strong>
              </td>
              <td>{dcAutoSync || '—'}</td>
              <td>{manualNeeded || '—'}</td>
              <td>{manualEntered || '—'}</td>
              {hasBoothCS && <td>{boothCS || '—'}</td>}
              <td>
                <strong>{totalCS}</strong>
              </td>
              <AdjustmentCell adjustment={adjustment} />
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
