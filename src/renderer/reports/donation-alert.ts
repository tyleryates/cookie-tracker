import { PAYMENT_METHOD } from '../../constants';
import type { IDataReconciler, Order, Scout } from '../../types';
import { createHorizontalStats, createTableHeader, createTableRow, endTable, escapeHtml, startTable } from '../html-builder';

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

/** Build the colored status banner showing reconciliation state */
function buildStatusBanner(adjustmentNeeded: number): string {
  if (adjustmentNeeded === 0) {
    return '<div style="padding: 12px; background: #C8E6C9; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2E7D32;">'
      + '<p style="margin: 0; color: #2E7D32; font-weight: 600;">Reconciled \u2014 no manual entries needed in Smart Cookie.</p></div>';
  }
  if (adjustmentNeeded > 0) {
    return '<div style="padding: 12px; background: #FFE0B2; border-radius: 8px; margin: 15px 0; border-left: 4px solid #F57F17;">'
      + `<p style="margin: 0; color: #E65100; font-weight: 600;">Add <strong>${adjustmentNeeded}</strong> Cookie Share package${adjustmentNeeded !== 1 ? 's' : ''} in Smart Cookie (Orders \u2192 Virtual Cookie Share).</p></div>`;
  }
  const count = Math.abs(adjustmentNeeded);
  return '<div style="padding: 12px; background: #FFCDD2; border-radius: 8px; margin: 15px 0; border-left: 4px solid #C62828;">'
    + `<p style="margin: 0; color: #C62828; font-weight: 600;">Remove <strong>${count}</strong> Cookie Share package${count !== 1 ? 's' : ''} from Smart Cookie.</p></div>`;
}

/** Calculate per-scout Cookie Share breakdown from orders */
function computeScoutDonations(scout: Scout): { dcTotal: number; dcAutoSync: number } {
  let dcTotal = 0;
  let dcAutoSync = 0;
  scout.orders.forEach((order: Order) => {
    if (order.donations > 0) {
      dcTotal += order.donations;
      const isCreditCard = order.paymentMethod === PAYMENT_METHOD.CREDIT_CARD;
      const dcOrderType = order.dcOrderType || '';
      if ((dcOrderType.includes('Shipped') || dcOrderType === 'Donation') && isCreditCard) {
        dcAutoSync += order.donations;
      }
    }
  });
  return { dcTotal, dcAutoSync };
}

/** Build per-scout donation rows for the reconciliation table */
function buildScoutDonationRows(
  scouts: Map<string, Scout>,
  virtualCSAllocations: Map<number, number> | null
): ScoutDonationRow[] {
  const rows: ScoutDonationRow[] = [];
  scouts.forEach((scout: Scout, scoutName: string) => {
    if (scout.isSiteOrder) return;

    const { dcTotal, dcAutoSync } = computeScoutDonations(scout);
    const manualNeeded = dcTotal - dcAutoSync;
    const boothCS = scout.credited.boothSales.donations || 0;
    const totalCS = dcTotal + boothCS;
    if (totalCS === 0) return;

    let manualEntered = 0;
    if (virtualCSAllocations && scout.girlId && virtualCSAllocations.has(scout.girlId)) {
      manualEntered = virtualCSAllocations.get(scout.girlId);
    }

    rows.push({ name: scoutName, dcAutoSync, manualNeeded, dcTotal, manualEntered, boothCS, totalCS, adjustment: manualNeeded - manualEntered });
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Render the adjustment cell with color coding */
function buildAdjustmentCell(adjustment: number): { cell: string; rowClass: string } {
  if (adjustment > 0) {
    return { cell: `<td style="color: #ff9800; font-weight: 600;"><strong>+${adjustment}</strong></td>`, rowClass: 'style="background: #fff3cd;"' };
  }
  if (adjustment < 0) {
    return { cell: `<td style="color: #f44336; font-weight: 600;"><strong>${adjustment}</strong></td>`, rowClass: 'style="background: #ffcdd2;"' };
  }
  return { cell: '<td style="color: #4CAF50; font-weight: 600;">\u2014</td>', rowClass: '' };
}

function generateDonationAlertReport(reconciler: IDataReconciler): string {
  if (!reconciler.unified || !reconciler.unified.cookieShare) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const cookieShare = reconciler.unified.cookieShare;
  const scouts = reconciler.unified.scouts;

  let html = '<div class="report-visual"><h3>Cookie Share Reconciliation</h3>';

  const totalDCDonations = cookieShare.digitalCookie.total;
  const manualEntryDonations = cookieShare.digitalCookie.manualEntry;
  const manualCookieShareEntries = cookieShare.smartCookie.manualEntries;

  let totalBoothCookieShare = 0;
  scouts.forEach((scout: Scout) => {
    if (!scout.isSiteOrder) totalBoothCookieShare += scout.credited.boothSales.donations || 0;
  });

  const totalCookieShare = totalDCDonations + totalBoothCookieShare;
  const adjustmentNeeded = manualEntryDonations - manualCookieShareEntries;

  // Summary stats
  const stats: Array<{ label: string; value: string | number; description: string; color: string }> = [
    { label: 'DC Donations', value: totalDCDonations, description: 'From online orders', color: '#2196F3' }
  ];
  if (totalBoothCookieShare > 0) {
    stats.push({ label: 'Booth Donations', value: totalBoothCookieShare, description: 'From booth sales', color: '#7B1FA2' });
  }
  stats.push({ label: 'Total Donations', value: totalCookieShare, description: 'All Cookie Share', color: '#00897B' });
  stats.push({
    label: 'Needs Entry',
    value: adjustmentNeeded === 0 ? '\u2014' : adjustmentNeeded > 0 ? `+${adjustmentNeeded}` : `${adjustmentNeeded}`,
    description: 'Manual SC adjustment',
    color: adjustmentNeeded === 0 ? '#4CAF50' : adjustmentNeeded > 0 ? '#ff9800' : '#f44336'
  });
  html += createHorizontalStats(stats);
  html += buildStatusBanner(adjustmentNeeded);

  // Per-scout table
  const hasBoothCS = totalBoothCookieShare > 0;
  const scoutRows = buildScoutDonationRows(scouts, reconciler.virtualCookieShareAllocations);

  if (scoutRows.length > 0) {
    const headers = ['Scout', 'DC Auto', 'DC Manual', 'SC Entered'];
    if (hasBoothCS) headers.push('Booth');
    headers.push('Total', 'Adjustment');

    html += startTable('table-normal');
    html += createTableHeader(headers);

    scoutRows.forEach(({ name, dcAutoSync, manualNeeded, manualEntered, boothCS, totalCS, adjustment }) => {
      const cells = [
        `<td><strong>${escapeHtml(name)}</strong></td>`,
        `<td>${dcAutoSync || '\u2014'}</td>`,
        `<td>${manualNeeded || '\u2014'}</td>`,
        `<td>${manualEntered || '\u2014'}</td>`
      ];
      if (hasBoothCS) cells.push(`<td>${boothCS || '\u2014'}</td>`);
      cells.push(`<td><strong>${totalCS}</strong></td>`);
      const { cell, rowClass } = buildAdjustmentCell(adjustment);
      cells.push(cell);
      html += createTableRow(cells, rowClass);
    });

    html += endTable();
  }

  html += '</div>';
  return html;
}

export { generateDonationAlertReport };
