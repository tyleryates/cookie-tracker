import type { ComponentChildren } from 'preact';
import { ALLOCATION_METHOD, DISPLAY_STRINGS, ORDER_TYPE, OWNER } from '../../constants';
import { isDCAutoSync } from '../../order-classification';
import type { Order, Scout, UnifiedDataset } from '../../types';
import { DataTable } from '../components/data-table';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';
import { TooltipCell } from '../components/tooltip-cell';

interface ScoutDonationRow {
  name: string;
  dcAutoSync: number;
  manualNeeded: number;
  dcTotal: number;
  manualEntered: number;
  boothCS: number;
  siteCS: number;
  credits: number;
  totalCS: number;
  adjustment: number;
}

function buildCreditTooltip(row: ScoutDonationRow): string {
  const parts: string[] = [];
  if (row.boothCS > 0) parts.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${row.boothCS}`);
  if (row.siteCS > 0) parts.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${row.siteCS}`);
  return parts.join('\n');
}

function StatusBanner({ scoutRows }: { scoutRows: ScoutDonationRow[] }) {
  const needsAdd = scoutRows.filter((r) => r.adjustment > 0);
  const needsRemove = scoutRows.filter((r) => r.adjustment < 0);
  if (needsAdd.length === 0 && needsRemove.length === 0) return null;

  const lines: string[] = [];
  for (const r of needsAdd) {
    lines.push(`Add ${r.adjustment} for ${r.name}`);
  }
  for (const r of needsRemove) {
    lines.push(`Remove ${Math.abs(r.adjustment)} for ${r.name}`);
  }

  const isError = needsRemove.length > 0 && needsAdd.length === 0;
  return (
    <div class={`info-box ${isError ? 'info-box-error' : 'info-box-warning'}`}>
      <p>Adjust Cookie Share in Smart Cookie (Orders → Virtual Cookie Share):</p>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
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
    const siteCS = scout.totals.$allocationSummary.virtualBooth.donations;
    const credits = boothCS + siteCS;
    const totalCS = dcTotal + credits;
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
      siteCS,
      credits,
      totalCS,
      adjustment: manualNeeded - manualEntered
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function AdjustmentCell({ adjustment }: { adjustment: number }) {
  if (adjustment > 0)
    return (
      <td class="text-center">
        <span class="inline-alert-anchor status-error">
          +{adjustment}
          <span class="inline-alert-pill">{'\u26A0'}</span>
        </span>
      </td>
    );
  if (adjustment < 0)
    return (
      <td class="text-center">
        <span class="inline-alert-anchor status-error">
          {adjustment}
          <span class="inline-alert-pill">{'\u26A0'}</span>
        </span>
      </td>
    );
  return <td class="status-success text-center">—</td>;
}

export function DonationAlertReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
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

  const stats: Stat[] = [
    {
      label: 'Girl Donations',
      value: totalGirlDonations,
      description: `${girlInPerson} in person + ${girlDC} online`,
      color: STAT_COLORS.TEAL
    }
  ];
  if (totalTroopDonations > 0) {
    stats.push({
      label: 'Troop Donations',
      value: totalTroopDonations,
      description: `${totalBoothCookieShare} booth + ${siteDonations} online`,
      color: STAT_COLORS.PURPLE,
      operator: '+'
    });
  }
  stats.push({
    label: 'Total Donations',
    value: totalCookieShare,
    description: 'All Cookie Share',
    color: STAT_COLORS.GREEN,
    operator: '=',
    highlight: true
  });

  const scoutRows = buildScoutDonationRows(scouts, data.virtualCookieShareAllocations);
  const hasCredits = scoutRows.some((r) => r.credits > 0);

  const headers = ['Scout', 'Auto-Synced', 'Needs Entry in SC', 'Entered in SC'];
  const aligns: Array<'center' | undefined> = [undefined, 'center', 'center', 'center'];
  if (hasCredits) {
    headers.push('Credits');
    aligns.push('center');
  }
  headers.push('Total', 'Adjustment');
  aligns.push('center', 'center');

  const isReconciled = adjustmentNeeded === 0;

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Donations Report</h3>
        <span class={`report-status-badge ${isReconciled ? 'report-status-ok' : 'report-status-warning'}`}>
          {isReconciled ? 'Reconciled in SC' : 'Action Required'}
        </span>
      </div>
      {banner}
      {!data.metadata.lastImportDC && (
        <div class="info-box info-box-warning">
          <p class="meta-text">
            <strong>No Digital Cookie Data</strong>
          </p>
          <p class="meta-text">
            Donation amounts may be incomplete.
            <br />
            Click the refresh button in the header to download Digital Cookie data.
          </p>
        </div>
      )}

      <StatusBanner scoutRows={scoutRows} />

      <StatCards stats={stats} />

      {scoutRows.length > 0 && (
        <DataTable columns={headers} columnAligns={aligns}>
          {scoutRows.map((row) => {
            const creditTip = buildCreditTooltip(row);
            return (
              <tr key={row.name}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td class="text-center">{row.dcAutoSync || '—'}</td>
                <td class="text-center">{row.manualNeeded || '—'}</td>
                <td class="text-center">{row.manualEntered || '—'}</td>
                {hasCredits &&
                  (row.credits > 0 && creditTip ? (
                    <TooltipCell tooltip={creditTip} className="tooltip-cell text-center">
                      {row.credits}
                    </TooltipCell>
                  ) : (
                    <td class="text-center">{'—'}</td>
                  ))}
                <td class="text-center">
                  <strong>{row.totalCS}</strong>
                </td>
                <AdjustmentCell adjustment={row.adjustment} />
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
