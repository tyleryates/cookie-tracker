import { PACKAGES_PER_CASE } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import type { IDataReconciler, Transfer, Varieties } from '../../types';
import {
  buildVarietyTooltipAttr,
  createHorizontalStats,
  createTableHeader,
  createTableRow,
  endTable,
  escapeHtml,
  formatCurrency,
  formatDate,
  getCompleteVarieties,
  sortVarietiesByOrder,
  startTable
} from '../html-builder';

function buildTransferTooltip(varieties: Varieties | undefined, transform?: (count: number) => number): string {
  if (!varieties || Object.keys(varieties).length === 0) return '';
  const transformed: Varieties = {};
  for (const [variety, count] of Object.entries(varieties)) {
    transformed[variety as keyof Varieties] = transform ? transform(count) : count;
  }
  return buildVarietyTooltipAttr(transformed);
}

function generateInventoryReport(reconciler: IDataReconciler): string {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.transferBreakdowns) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const troopTotals = reconciler.unified.troopTotals;
  const transferBreakdowns = reconciler.unified.transferBreakdowns;
  const varieties = reconciler.unified.varieties;

  let html = '<div class="report-visual"><h3>Inventory Report</h3>';
  html += '<p style="margin-bottom: 20px; color: #666;">Track inventory from Council to Troop to Scouts</p>';

  const c2tTransfers = transferBreakdowns.c2t;
  const t2gTransfers = transferBreakdowns.t2g;
  const g2tTransfers = transferBreakdowns.g2t;
  const totalOrdered = transferBreakdowns.totals.c2t;
  const totalAllocated = transferBreakdowns.totals.t2gPhysical;
  const totalReturned = transferBreakdowns.totals.g2t;
  const netInventory = troopTotals.inventory;
  const inventoryVarieties = varieties.inventory;

  // Troop sold = booth + virtual booth physical packages (sold from troop stock, not via girl pickup)
  // Independently computed from SC transfer data so mismatches reveal data errors
  const troopSold = troopTotals.boothDividerT2G + troopTotals.virtualBoothT2G;

  // Overall inventory stats
  const stats = [
    { label: 'Total Received', value: totalOrdered, description: 'C2T and T2T pickups', color: '#2196F3' },
    { label: 'Allocated to Scouts (T2G)', value: totalAllocated, description: 'Physical packages only', color: '#4CAF50' },
    { label: 'Troop Sold', value: troopSold, description: 'Booth & troop delivery', color: '#00897B' }
  ];
  if (totalReturned > 0) {
    stats.push({ label: 'Returns (G2T)', value: totalReturned, description: 'Returned from scouts', color: '#FF9800' });
  }
  stats.push({ label: 'Troop Inventory', value: netInventory, description: 'Packages on hand', color: '#9C27B0' });
  html += createHorizontalStats(stats);

  // Net inventory by variety (exclude Cookie Share - it's virtual, not physical inventory)
  html += '<h4 style="margin-top: 30px;">Net Troop Inventory by Variety</h4>';
  html += startTable('table-normal');
  html += '<thead><tr><th>Variety</th><th>Packages</th><th></th></tr></thead><tbody>';
  sortVarietiesByOrder(Object.entries(getCompleteVarieties(inventoryVarieties)))
    .filter(([variety]) => variety !== COOKIE_TYPE.COOKIE_SHARE)
    .forEach(([variety, count]) => {
      // Calculate cases and remaining packages
      const cases = Math.floor(count / PACKAGES_PER_CASE);
      const remaining = count % PACKAGES_PER_CASE;
      let breakdown = '';
      if (cases > 0 && remaining > 0) {
        breakdown = `${cases} case${cases !== 1 ? 's' : ''} + ${remaining} pkg${remaining !== 1 ? 's' : ''}`;
      } else if (cases > 0) {
        breakdown = `${cases} case${cases !== 1 ? 's' : ''}`;
      } else {
        breakdown = `${remaining} pkg${remaining !== 1 ? 's' : ''}`;
      }

      html += createTableRow([
        `<td>${escapeHtml(getCookieDisplayName(variety))}</td>`,
        `<td>${count}</td>`,
        `<td style="color: #666; font-size: 0.9em;">${breakdown}</td>`
      ]);
    });
  html += endTable();

  // C2T transfers table
  if (c2tTransfers.length > 0) {
    html += '<h4 style="margin-top: 30px;">Inventory Received (C2T / T2T)</h4>';
    html += `<p style="margin-bottom: 10px; font-size: 0.9em; color: #666;">${totalOrdered} packages received across ${c2tTransfers.length} pickups</p>`;
    html += startTable('table-normal');
    html += createTableHeader(['Date', 'From', 'Order #', 'Cases', 'Packages', 'Amount', 'Status']);

    // Transfers are already sorted by date (newest first) in buildTransferBreakdowns()
    c2tTransfers.forEach((transfer: Transfer) => {
      // Determine status: "Pending" only for orders awaiting submission or approval
      // saveable alone just means editable, not pending
      const isPending = transfer.status === 'SAVED' || (transfer.actions && (transfer.actions.submittable || transfer.actions.approvable));
      const statusText = isPending ? 'Pending' : 'Completed';
      const statusStyle = isPending ? 'color: #ff9800; font-weight: 600;' : 'color: #4CAF50;';

      const tooltipAttr = buildTransferTooltip(transfer.varieties);
      const casesTooltipAttr = buildTransferTooltip(transfer.varieties, (count) => Math.round(count / PACKAGES_PER_CASE));

      const fromLabel = transfer.type === 'T2T' ? `Troop ${transfer.from}` : transfer.from || 'Council';
      html += createTableRow([
        `<td>${escapeHtml(formatDate(transfer.date))}</td>`,
        `<td>${escapeHtml(fromLabel)}</td>`,
        `<td>${escapeHtml(String(transfer.orderNumber || '-'))}</td>`,
        `<td class="tooltip-cell"${casesTooltipAttr}>${transfer.cases || 0}</td>`,
        `<td class="tooltip-cell"${tooltipAttr}>${transfer.packages || 0}</td>`,
        `<td>${formatCurrency(transfer.amount)}</td>`,
        `<td style="${statusStyle}">${statusText}</td>`
      ]);
    });
    html += endTable();
  }

  // T2G + G2T transfers table (combined: allocations and returns)
  const allScoutTransfers = [...t2gTransfers, ...g2tTransfers];
  if (allScoutTransfers.length > 0) {
    // Sort combined list by date (newest first)
    allScoutTransfers.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    let subtitle = `${totalAllocated} physical packages allocated across ${t2gTransfers.length} transfers`;
    if (totalReturned > 0) {
      subtitle += `, ${totalReturned} returned across ${g2tTransfers.length}`;
    }

    html += '<h4 style="margin-top: 30px;">Scout Transfers (T2G / G2T)</h4>';
    html += `<p style="margin-bottom: 10px; font-size: 0.9em; color: #666;">${subtitle}</p>`;
    html += startTable('table-normal');
    html += createTableHeader(['Date', 'Scout', 'Packages', 'Amount']);

    allScoutTransfers.forEach((transfer: Transfer) => {
      const isReturn = transfer.type === 'G2T';
      const scoutName = isReturn ? transfer.from : transfer.to;
      const packages = transfer.packages || 0;
      const displayPackages = isReturn ? -packages : packages;
      const tooltipAttr = buildTransferTooltip(transfer.varieties, isReturn ? (count) => -count : undefined);
      const style = isReturn ? ' style="color: #e65100;"' : '';

      html += createTableRow([
        `<td>${escapeHtml(formatDate(transfer.date))}</td>`,
        `<td>${escapeHtml(String(scoutName || '-'))}</td>`,
        `<td class="tooltip-cell"${tooltipAttr}${style}>${displayPackages}</td>`,
        `<td${style}>${formatCurrency(transfer.amount)}</td>`
      ]);
    });
    html += endTable();
  }

  // No data messages
  if (c2tTransfers.length === 0) {
    if (reconciler?.transfers && reconciler.transfers.length > 0) {
      html += '<div style="margin: 30px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">';
      html +=
        '<p style="margin: 0; font-size: 0.9em; color: #666;"><strong>Note:</strong> No C2T (Council to Troop) inventory pickups found in Smart Cookie data. C2T transfers appear after picking up your Initial Order on Delivery Day or Cupboard Orders during the season.</p>';
      html += '</div>';
    } else {
      html += '<div style="margin: 30px 0; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">';
      html += '<p style="margin: 0; font-size: 0.9em;"><strong>ℹ️ No Smart Cookie Data</strong></p>';
      html +=
        '<p style="margin: 10px 0 0 0; font-size: 0.9em;">Inventory pickups (C2T transfers) come from Smart Cookies. Click "Sync from Websites" to download Smart Cookie data including Initial Order and Cupboard Order pickups.</p>';
      html += '</div>';
    }
  }

  html += '</div>';
  return html;
}

export { generateInventoryReport };
