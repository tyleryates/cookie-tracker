const { PACKAGES_PER_CASE } = require('../../constants.js');
const {
  createHorizontalStats,
  escapeHtml,
  formatDate,
  formatCurrency,
  sortVarietiesByOrder,
  getCompleteVarieties,
  startTable,
  createTableHeader,
  createTableRow,
  endTable
} = require('../html-builder.js');

function generateInventoryReport(reconciler) {
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
  const totalOrdered = transferBreakdowns.totals.c2t;
  const totalAllocated = transferBreakdowns.totals.t2gPhysical;
  const netInventory = troopTotals.inventory;
  const inventoryVarieties = varieties.inventory;

  // Overall inventory stats
  html += createHorizontalStats([
    { label: 'Total Ordered (C2T)', value: totalOrdered, description: 'Picked up from council', color: '#2196F3' },
    { label: 'Allocated to Scouts (T2G)', value: totalAllocated, description: 'Physical packages only', color: '#4CAF50' },
    { label: 'Troop Inventory', value: netInventory, description: 'Packages on hand', color: '#9C27B0' }
  ]);

  // Net inventory by variety (exclude Cookie Share - it's virtual, not physical inventory)
  html += '<h4 style="margin-top: 30px;">Net Troop Inventory by Variety</h4>';
  html += startTable('table-normal');
  html += '<thead><tr><th>Variety</th><th>Packages</th><th></th></tr></thead><tbody>';
  sortVarietiesByOrder(Object.entries(getCompleteVarieties(inventoryVarieties)))
    .filter(([variety]) => variety !== 'Cookie Share')
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
        `<td>${escapeHtml(variety)}</td>`,
        `<td>${count}</td>`,
        `<td style="color: #666; font-size: 0.9em;">${breakdown}</td>`
      ]);
    });
  html += endTable();

  // C2T transfers table
  if (c2tTransfers.length > 0) {
    html += '<h4 style="margin-top: 30px;">Inventory Received from Cookie Cupboard (C2T)</h4>';
    html += `<p style="margin-bottom: 10px; font-size: 0.9em; color: #666;">${totalOrdered} packages received across ${c2tTransfers.length} pickups</p>`;
    html += startTable('table-normal');
    html += createTableHeader(['Date', 'Order #', 'Cases', 'Packages', 'Amount', 'Status']);

    // Transfers are already sorted by date (newest first) in buildTransferBreakdowns()
    c2tTransfers.forEach(transfer => {
      // Determine status: "Pending" for orders with SAVED status or saveable actions, "Completed" otherwise
      const isPending = transfer.status === 'SAVED' ||
                       (transfer.actions && (transfer.actions.saveable || transfer.actions.submittable || transfer.actions.approvable));
      const statusText = isPending ? 'Pending' : 'Completed';
      const statusStyle = isPending ? 'color: #ff9800; font-weight: 600;' : 'color: #4CAF50;';

      // Build tooltip for varieties breakdown (packages)
      let tooltipAttr = '';
      if (transfer.varieties && Object.keys(transfer.varieties).length > 0) {
        const varietyList = sortVarietiesByOrder(Object.entries(transfer.varieties))
          .map(([variety, count]) => `${variety}: ${count}`)
          .join('\n');
        tooltipAttr = ` data-tooltip="${escapeHtml(varietyList)}"`;
      }

      // Build tooltip for cases breakdown
      let casesTooltipAttr = '';
      if (transfer.varieties && Object.keys(transfer.varieties).length > 0) {
        const casesList = sortVarietiesByOrder(Object.entries(transfer.varieties))
          .map(([variety, count]) => `${variety}: ${Math.round(count / PACKAGES_PER_CASE)}`)
          .join('\n');
        casesTooltipAttr = ` data-tooltip="${escapeHtml(casesList)}"`;
      }

      html += createTableRow([
        `<td>${escapeHtml(formatDate(transfer.date))}</td>`,
        `<td>${escapeHtml(String(transfer.orderNumber || '-'))}</td>`,
        `<td class="tooltip-cell"${casesTooltipAttr}>${transfer.cases || 0}</td>`,
        `<td class="tooltip-cell"${tooltipAttr}>${transfer.packages || 0}</td>`,
        `<td>${formatCurrency(transfer.amount)}</td>`,
        `<td style="${statusStyle}">${statusText}</td>`
      ]);
    });
    html += endTable();
  }

  // T2G transfers table
  if (t2gTransfers.length > 0) {
    html += '<h4 style="margin-top: 30px;">Inventory Allocated to Scouts (T2G)</h4>';
    html += `<p style="margin-bottom: 10px; font-size: 0.9em; color: #666;">${totalAllocated} physical packages allocated across ${t2gTransfers.length} transfers</p>`;
    html += startTable('table-normal');
    html += createTableHeader(['Date', 'Scout', 'Packages', 'Amount']);

    // Transfers are already sorted by date (newest first) in buildTransferBreakdowns()
    t2gTransfers.forEach(transfer => {
      // Build tooltip for varieties breakdown
      let tooltipAttr = '';
      if (transfer.varieties && Object.keys(transfer.varieties).length > 0) {
        const varietyList = sortVarietiesByOrder(Object.entries(transfer.varieties))
          .map(([variety, count]) => `${variety}: ${count}`)
          .join('\n');
        tooltipAttr = ` data-tooltip="${escapeHtml(varietyList)}"`;
      }

      html += createTableRow([
        `<td>${escapeHtml(formatDate(transfer.date))}</td>`,
        `<td>${escapeHtml(String(transfer.to || '-'))}</td>`,
        `<td class="tooltip-cell"${tooltipAttr}>${transfer.packages || 0}</td>`,
        `<td>${formatCurrency(transfer.amount)}</td>`
      ]);
    });
    html += endTable();
  }

  // No data messages
  if (c2tTransfers.length === 0) {
    if (reconciler && reconciler.transfers && reconciler.transfers.length > 0) {
      html += '<div style="margin: 30px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">';
      html += '<p style="margin: 0; font-size: 0.9em; color: #666;"><strong>Note:</strong> No C2T (Council to Troop) inventory pickups found in Smart Cookie data. C2T transfers appear after picking up your Initial Order on Delivery Day or Cupboard Orders during the season.</p>';
      html += '</div>';
    } else {
      html += '<div style="margin: 30px 0; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">';
      html += '<p style="margin: 0; font-size: 0.9em;"><strong>ℹ️ No Smart Cookie Data</strong></p>';
      html += '<p style="margin: 10px 0 0 0; font-size: 0.9em;">Inventory pickups (C2T transfers) come from Smart Cookies. Click "Sync from Websites" to download Smart Cookie data including Initial Order and Cupboard Order pickups.</p>';
      html += '</div>';
    }
  }

  html += '</div>';
  return html;
}

module.exports = { generateInventoryReport };
