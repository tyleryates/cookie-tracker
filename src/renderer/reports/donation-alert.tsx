import { ORDER_TYPE, OWNER } from '../../constants';
import { isDCAutoSync } from '../../order-classification';
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

function buildScoutDonationRows(scouts: Record<string, Scout>, virtualCSAllocations: Record<string, number> | null): ScoutDonationRow[] {
  const rows: ScoutDonationRow[] = [];
  for (const [scoutName, scout] of Object.entries(scouts)) {
    if (scout.isSiteOrder) continue;
    const { dcTotal, dcAutoSync } = computeScoutDonations(scout);
    const manualNeeded = dcTotal - dcAutoSync;
    const boothCS = scout.totals.$allocationSummary.booth.donations;
    const totalCS = dcTotal + boothCS;
    if (totalCS === 0) continue;

    let manualEntered = 0;
    const girlIdKey = scout.girlId != null ? String(scout.girlId) : null;
    if (virtualCSAllocations && girlIdKey && girlIdKey in virtualCSAllocations) {
      manualEntered = virtualCSAllocations[girlIdKey] ?? 0;
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
  }
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

export function DonationAlertReport({ data }: { data: UnifiedDataset }) {
  if (!data?.cookieShare) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const cookieShare = data.cookieShare;
  const scouts = data.scouts;

  const manualEntryDonations = cookieShare.digitalCookie.manualEntry;
  const manualCookieShareEntries = cookieShare.smartCookie.manualEntries;
  const totalBoothCookieShare = data.troopTotals.boothSalesDonations;
  const adjustmentNeeded = manualEntryDonations - manualCookieShareEntries;

  // Compute girl donations split by DC vs in-person
  let girlDC = 0;
  let girlInPerson = 0;
  let siteDonations = 0;
  for (const scout of Object.values(scouts)) {
    for (const order of scout.orders) {
      if (order.donations <= 0 || order.owner !== OWNER.GIRL) continue;
      if (scout.isSiteOrder) {
        siteDonations += order.donations;
      } else if (
        order.orderType === ORDER_TYPE.DELIVERY ||
        order.orderType === ORDER_TYPE.DIRECT_SHIP ||
        order.orderType === ORDER_TYPE.DONATION
      ) {
        girlDC += order.donations;
      } else if (order.orderType === ORDER_TYPE.IN_HAND) {
        girlInPerson += order.donations;
      }
    }
  }
  const totalGirlDonations = girlDC + girlInPerson;
  const totalTroopDonations = totalBoothCookieShare + siteDonations;
  const totalCookieShare = totalGirlDonations + totalTroopDonations;

  const stats: Array<{ label: string; value: string | number; description: string; color: string }> = [
    { label: 'Girl Donations', value: totalGirlDonations, description: `${girlDC} DC + ${girlInPerson} in person`, color: '#00838F' }
  ];
  if (totalTroopDonations > 0) {
    stats.push({
      label: 'Troop Donations',
      value: totalTroopDonations,
      description: `${totalBoothCookieShare} booth + ${siteDonations} site`,
      color: '#7B1FA2'
    });
  }
  stats.push({ label: 'Total Donations', value: totalCookieShare, description: 'All Cookie Share', color: '#1565C0' });
  stats.push({
    label: 'Needs Entry',
    value: adjustmentNeeded === 0 ? '—' : adjustmentNeeded > 0 ? `+${adjustmentNeeded}` : `${adjustmentNeeded}`,
    description: 'Manual SC adjustment',
    color: adjustmentNeeded === 0 ? '#4CAF50' : adjustmentNeeded > 0 ? '#ff9800' : '#f44336'
  });

  const hasBoothCS = totalBoothCookieShare > 0;
  const scoutRows = buildScoutDonationRows(scouts, data.virtualCookieShareAllocations);

  const headers = ['Scout', 'Auto-Synced', 'Needs Entry', 'Entered in SC'];
  if (hasBoothCS) headers.push('Booth');
  headers.push('Total', 'Adjustment');

  return (
    <div class="report-visual">
      <h3>Donation Report & Reconciliation</h3>
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
