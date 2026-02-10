import { PAYMENT_METHOD } from '../../constants';
import type { IDataReconciler, Order, Scout } from '../../types';
import { createHorizontalStats, createTableHeader, createTableRow, endTable, escapeHtml, startTable } from '../html-builder';

function generateDonationAlertReport(reconciler: IDataReconciler): string {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.cookieShare) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const cookieShare = reconciler.unified.cookieShare;
  const scouts = reconciler.unified.scouts;

  let html = '<div class="report-visual"><h3>Cookie Share</h3>';

  const totalDCDonations = cookieShare.digitalCookie.total;
  const manualEntryDonations = cookieShare.digitalCookie.manualEntry;
  const manualCookieShareEntries = cookieShare.smartCookie.manualEntries;

  // Count booth Cookie Share from scout credited allocations
  let totalBoothCookieShare = 0;
  scouts.forEach((scout: Scout) => {
    if (!scout.isSiteOrder) {
      totalBoothCookieShare += scout.credited.boothSales.donations || 0;
    }
  });

  const totalCookieShare = totalDCDonations + totalBoothCookieShare;
  const adjustmentNeeded = manualEntryDonations - manualCookieShareEntries;

  // Summary stats — show how total is calculated
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

  // Status banner
  if (adjustmentNeeded === 0) {
    html += '<div style="padding: 12px; background: #C8E6C9; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2E7D32;">';
    html += '<p style="margin: 0; color: #2E7D32; font-weight: 600;">Reconciled \u2014 no manual entries needed in Smart Cookie.</p>';
    html += '</div>';
  } else if (adjustmentNeeded > 0) {
    html += '<div style="padding: 12px; background: #FFE0B2; border-radius: 8px; margin: 15px 0; border-left: 4px solid #F57F17;">';
    html += `<p style="margin: 0; color: #E65100; font-weight: 600;">Add <strong>${adjustmentNeeded}</strong> Cookie Share package${adjustmentNeeded !== 1 ? 's' : ''} in Smart Cookie (Orders \u2192 Virtual Cookie Share).</p>`;
    html += '</div>';
  } else {
    html += '<div style="padding: 12px; background: #FFCDD2; border-radius: 8px; margin: 15px 0; border-left: 4px solid #C62828;">';
    html += `<p style="margin: 0; color: #C62828; font-weight: 600;">Remove <strong>${Math.abs(adjustmentNeeded)}</strong> Cookie Share package${Math.abs(adjustmentNeeded) !== 1 ? 's' : ''} from Smart Cookie.</p>`;
    html += '</div>';
  }

  // Build per-scout Cookie Share data (calculate inline from orders)
  const hasBoothCS = totalBoothCookieShare > 0;
  const scoutRows = [];
  scouts.forEach((scout: Scout, scoutName: string) => {
    if (scout.isSiteOrder) return;

    // Calculate Cookie Share breakdown from orders (simple loop)
    let dcTotal = 0;
    let dcAutoSync = 0;
    scout.orders.forEach((order: Order) => {
      if (order.donations > 0) {
        dcTotal += order.donations;

        // Determine if auto-sync or manual entry (use pre-computed paymentMethod)
        const isCreditCard = order.paymentMethod === PAYMENT_METHOD.CREDIT_CARD;
        const dcOrderType = order.dcOrderType || '';
        const isAutoSync = (dcOrderType.includes('Shipped') || dcOrderType === 'Donation') && isCreditCard;

        if (isAutoSync) {
          dcAutoSync += order.donations;
        }
      }
    });

    const manualNeeded = dcTotal - dcAutoSync;
    const boothCS = scout.credited.boothSales.donations || 0;
    const totalCS = dcTotal + boothCS;
    if (totalCS === 0) return;

    let manualEntered = 0;
    if (reconciler.virtualCookieShareAllocations) {
      const girlId = scout.girlId;
      if (girlId && reconciler.virtualCookieShareAllocations.has(girlId)) {
        manualEntered = reconciler.virtualCookieShareAllocations.get(girlId);
      }
    }
    const adjustment = manualNeeded - manualEntered;

    scoutRows.push({ name: scoutName, dcAutoSync, manualNeeded, dcTotal, manualEntered, boothCS, totalCS, adjustment });
  });

  // Per-scout table (always shown if there's donation data)
  if (scoutRows.length > 0) {
    scoutRows.sort((a, b) => a.name.localeCompare(b.name));

    // Build header columns - show auto-sync, manual needed, SC entered, and totals
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

      let adjCell: string;
      let rowClass = '';
      if (adjustment > 0) {
        adjCell = `<td style="color: #ff9800; font-weight: 600;"><strong>+${adjustment}</strong></td>`;
        rowClass = 'style="background: #fff3cd;"';
      } else if (adjustment < 0) {
        adjCell = `<td style="color: #f44336; font-weight: 600;"><strong>${adjustment}</strong></td>`;
        rowClass = 'style="background: #ffcdd2;"';
      } else {
        adjCell = '<td style="color: #4CAF50; font-weight: 600;">\u2014</td>';
      }
      cells.push(adjCell);

      html += createTableRow(cells, rowClass);
    });

    html += endTable();
  }

  html += '</div>';
  return html;
}

export { generateDonationAlertReport };
