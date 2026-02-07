const { ORDER_TYPES, DISPLAY_STRINGS } = require('../../constants.js');
const {
  sortVarietiesByOrder,
  getCompleteVarieties,
  formatDate,
  escapeHtml,
  startTable,
  createTableHeader,
  createTableRow,
  endTable
} = require('../html-builder.js');

// Helper: Build inventory cell with warning if any variety is negative
function buildInventoryCell(netInventory, negativeVarieties, actualNet) {
  if (negativeVarieties.length > 0) {
    const varietyList = negativeVarieties
      .map(v => `${v.variety}: ${v.count}`)
      .join('\n');

    // If netInventory is positive, show with + sign
    // If netInventory is 0 (only negatives), show actual negative total
    let display;
    if (netInventory > 0) {
      display = `+${netInventory}`;
    } else {
      display = actualNet; // Show actual negative value
    }

    return `<span class="tooltip-cell" data-tooltip="${escapeHtml(varietyList)}" style="color: #f44336; font-weight: 600;">${display} ⚠️</span>`;
  }

  // Determine styling and display value
  let className = '';
  let display;

  if (netInventory < 0) {
    className = 'warning-text';
    display = netInventory;
  } else if (netInventory > 0) {
    className = 'success-text';
    display = `+${netInventory}`;
  } else {
    display = '—';
  }

  return `<span class="${className}">${display}</span>`;
}

// Helper: Build credited cell with tooltip
function buildCreditedCell(isSiteRow, totalCredited, siteOrders, creditedBoothPackages, creditedDirectShipPackages) {
  if (totalCredited === 0) {
    return '—';
  }

  // Build tooltip breakdown
  const sources = [];
  if (creditedBoothPackages > 0) {
    sources.push(`${DISPLAY_STRINGS.TROOP_GIRL_DELIVERED}: ${creditedBoothPackages}`);
  }
  if (creditedDirectShipPackages > 0) {
    sources.push(`${DISPLAY_STRINGS.TROOP_DIRECT_SHIP}: ${creditedDirectShipPackages}`);
  }

  // If this is the Site row (troop-level orders), add context to tooltip about site orders
  if (isSiteRow && siteOrders) {
    const hasSiteOrders =
      (siteOrders.directShip?.orders?.length || 0) > 0 ||
      (siteOrders.girlDelivery?.orders?.length || 0) > 0;
    if (hasSiteOrders) {
      sources.push(`\nNote: Troop booth sales and direct ship orders are allocated to scouts in Smart Cookie. See site orders in scout details.`);
    }
  }

  const tooltipText = sources.join('\n');
  return `<span class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}">${totalCredited}</span>`;
}

// Helper: Build cookie breakdown table showing varieties, sales, inventory, and credited amounts
function buildCookieBreakdownTable(scout) {
  const { inventory, credited, $varietyBreakdowns: varietyBreakdowns, $cookieShare } = scout;
  const salesVarieties = varietyBreakdowns.fromSales;
  const shippedVarieties = varietyBreakdowns.fromShipped;

  let html = '<h5>Cookie Breakdown</h5>';
  html += startTable('table-compact');
  html += createTableHeader(['Variety', 'Sales', 'Picked Up', 'Inventory', 'Shipped', 'Credited']);

  // Add Cookie Share to sales varieties
  const salesWithDonations = { ...salesVarieties };
  if ($cookieShare.dcTotal > 0) {
    salesWithDonations['Cookie Share'] = $cookieShare.dcTotal;
  }

  // Combine all varieties for complete list
  const allVarieties = getCompleteVarieties({
    ...salesWithDonations,
    ...shippedVarieties,
    ...inventory.varieties,
    ...credited.booth.varieties,
    ...credited.directShip.varieties
  });

  sortVarietiesByOrder(Object.entries(allVarieties))
    .forEach(([variety, _]) => {
      const pickedUp = inventory.varieties[variety] || 0;
      const sold = salesVarieties[variety] || 0;
      const creditedBooth = credited.booth.varieties[variety] || 0;
      const creditedDirectShip = credited.directShip.varieties[variety] || 0;
      const creditedTotal = creditedBooth + creditedDirectShip;
      const shipped = shippedVarieties[variety] || 0;
      const net = pickedUp - sold;

      // Cookie Share is virtual, show N/A for picked up since it's not physical
      const isCookieShare = variety === 'Cookie Share';
      const pickedUpDisplay = isCookieShare ? '<span style="color: #999;">N/A</span>' : pickedUp;

      // Highlight negative inventory with red, bold, and alert icon
      let netDisplay;
      let netClass = '';
      if (isCookieShare) {
        netDisplay = '<span style="color: #999;">N/A</span>';
      } else if (net < 0) {
        netDisplay = `<span style="color: #f44336; font-weight: 600;">${net} ⚠️</span>`;
      } else if (net > 0) {
        netClass = 'success-text';
        netDisplay = `+${net}`;
      } else {
        netDisplay = '—';
      }

      // Build tooltip for credited breakdown
      let creditedDisplay = creditedTotal > 0 ? creditedTotal : '—';
      if (creditedTotal > 0 && (creditedBooth > 0 || creditedDirectShip > 0)) {
        const sources = [];
        if (creditedBooth > 0) sources.push(`${DISPLAY_STRINGS.TROOP_GIRL_DELIVERED}: ${creditedBooth}`);
        if (creditedDirectShip > 0) sources.push(`${DISPLAY_STRINGS.TROOP_DIRECT_SHIP}: ${creditedDirectShip}`);
        creditedDisplay = `<span class="tooltip-cell" data-tooltip="${escapeHtml(sources.join('\n'))}">${creditedTotal}</span>`;
      }

      html += `<tr>`;
      html += `<td><strong>${escapeHtml(variety)}</strong></td>`;
      html += `<td>${sold}</td>`;
      html += `<td>${pickedUpDisplay}</td>`;
      html += `<td class="${isCookieShare ? '' : netClass}">${netDisplay}</td>`;
      html += `<td>${shipped > 0 ? shipped : '—'}</td>`;
      html += `<td>${creditedDisplay}</td>`;
      html += `</tr>`;
    });
  html += endTable();

  return html;
}

// Helper: Build orders table showing individual order details
function buildOrdersTable(scout) {
  let html = `<div style="margin-top: 24px;">`;
  html += `<h5>Orders (${scout.orders.length})</h5>`;
  html += `<div style="margin-top: 12px;">`;
  html += startTable('table-compact');
  html += createTableHeader(['Order #', 'Date', 'Packages', 'Amount', 'Type', 'Payment', 'Status']);

  scout.orders.forEach(order => {
    // Build tooltip text with varieties
    let tooltipAttr = '';
    if (order.varieties && Object.keys(order.varieties).length > 0) {
      const varietyList = sortVarietiesByOrder(Object.entries(order.varieties))
        .map(([variety, count]) => `${variety}: ${count}`)
        .join('\n');
      tooltipAttr = ` data-tooltip="${escapeHtml(varietyList)}"`;
    }

    // Format payment status for display
    const paymentDisplay = order.paymentStatus === 'CAPTURED' ? 'Credit Card' :
                           order.paymentStatus === 'AUTHORIZED' ? 'Credit Card' :
                           order.paymentStatus === 'CASH' ? 'Cash' :
                           order.paymentStatus || '-';

    // Format order status for display and add alert icon if needs approval
    const needsApproval = order.status && order.status.includes('Needs Approval');
    let statusText = order.status === 'Status Delivered' ? 'Completed' : order.status;
    if (needsApproval) {
      statusText = `${statusText} ⚠️`;
    }

    // Color code statuses
    let statusStyle = '';
    if (order.status) {
      const isCompleted = order.status === 'Status Delivered' ||
                          order.status.includes('Completed') ||
                          order.status.includes('Delivered') ||
                          order.status.includes('Shipped');
      const isPending = order.status.includes('Pending') ||
                        order.status.includes('Approved for Delivery');

      if (isCompleted) {
        statusStyle = 'color: #4CAF50;';
      } else if (isPending) {
        statusStyle = 'color: #ff9800; font-weight: 600;';
      } else if (needsApproval) {
        statusStyle = 'color: #f44336; font-weight: 600;';
      }
    }

    // Determine if order needs inventory based on type
    const needsInventory = order.type === ORDER_TYPES.GIRL_DELIVERY || order.type === ORDER_TYPES.TROOP_GIRL_DELIVERY;

    // Calculate total packages including donations
    const totalPackages = order.physicalPackages + order.donations;

    html += '<tr>';
    html += `<td>${escapeHtml(String(order.orderNumber))}</td>`;
    html += `<td>${escapeHtml(formatDate(order.date))}</td>`;
    html += `<td class="tooltip-cell"${tooltipAttr}>${totalPackages}${!needsInventory ? ' <span style="color: #999; font-size: 0.85em;">(no inv)</span>' : ''}</td>`;
    html += `<td>$${Math.round(order.amount)}</td>`;
    html += `<td>${escapeHtml(String(order.orderType || '-'))}</td>`;
    html += `<td>${escapeHtml(paymentDisplay)}</td>`;
    html += `<td style="${statusStyle}">${escapeHtml(String(statusText))}</td>`;
    html += '</tr>';
  });

  html += endTable();
  html += '</div></div>';

  return html;
}

// Helper: Build scout detail breakdown section (variety breakdown table + order list)
function buildScoutDetailBreakdown(scout) {
  let html = '<div class="scout-breakdown">';

  // Cookie breakdown table
  html += buildCookieBreakdownTable(scout);

  // Orders table
  html += buildOrdersTable(scout);

  html += '</div>';
  return html;
}

function generateSummaryReport(reconciler) {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.scouts) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const scouts = reconciler.unified.scouts;
  const siteOrders = reconciler.unified.siteOrders;

  // Convert Map to sorted array of [name, scout] entries, filtering out scouts with no sales
  const sortedScouts = Array.from(scouts.entries())
    .filter(([name, scout]) => (scout.totals.totalSold || 0) > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const SCOUT_SUMMARY_COLUMN_COUNT = 10;

  let html = '<div class="report-visual"><h3>Scout Summary Report</h3>';
  html += '<p class="table-hint">💡 Click on any scout to see detailed breakdown. <strong>Sales</strong> = physical packages for in-person delivery. <strong>Credited</strong> = troop booth sales + direct ship allocated to scout. <strong>Shipped</strong> = scout\'s own direct ship orders.</p>';
  html += startTable('table-normal scout-table');
  html += createTableHeader(['Scout', 'Orders', 'Sales', 'Picked Up', 'Inventory', 'Shipped', 'Donations', 'Credited', 'Total Sold', 'Revenue']);

  sortedScouts.forEach(([name, scout], idx) => {
    // Check if this is the Site row (troop-level orders)
    const isSiteRow = name.endsWith(' Site');

    // Get pre-calculated totals from unified dataset
    const totals = scout.totals;
    const inventory = scout.inventory;
    const credited = scout.credited;

    // Sales = Girl delivery orders (need physical inventory)
    const sales = totals.sales || 0;

    // Picked up = Total physical inventory received
    const pickedUp = inventory.total || 0;

    // Net inventory for display = Sum of positive varieties only (negatives treated as 0)
    // Use $inventoryDisplay which doesn't let negatives reduce the total
    const netInventory = totals.$inventoryDisplay || 0;

    // Actual net inventory (can be negative) - for display when only negatives exist
    const actualNetInventory = totals.inventory || 0;

    // Use pre-calculated negative inventory issues ($ = calculated)
    const negativeVarieties = scout.$issues?.negativeVarieties || [];

    // Build inventory cell with warning if any variety is negative
    const inventoryCell = buildInventoryCell(netInventory, negativeVarieties, actualNetInventory);

    // Calculate credited packages (booth + direct ship allocations)
    const creditedBoothPackages = credited.booth.packages || 0;
    const creditedDirectShipPackages = credited.directShip.packages || 0;
    const totalCredited = creditedBoothPackages + creditedDirectShipPackages;

    // Build credited cell with tooltip
    const creditedCell = buildCreditedCell(isSiteRow, totalCredited, siteOrders, creditedBoothPackages, creditedDirectShipPackages);

    // Determine order status color based on priority hierarchy
    const ordersNeedingApproval = scout.orders.filter(order =>
      order.status && order.status.includes('Needs Approval')
    );
    const ordersPending = scout.orders.filter(order =>
      order.status && (
        order.status.includes('Pending') ||
        order.status.includes('Approved for Delivery')
      )
    );
    const ordersCompleted = scout.orders.filter(order =>
      order.status && (
        order.status === 'Status Delivered' ||
        order.status.includes('Completed') ||
        order.status.includes('Delivered') ||
        order.status.includes('Shipped')
      )
    );

    // Priority: Red (needs approval) > Orange (pending) > Green (all complete)
    let orderColor = '';
    let orderIcon = '';
    let orderTooltip = '';

    if (ordersNeedingApproval.length > 0) {
      // RED: Any orders need approval
      orderColor = 'color: #f44336; font-weight: 600;';
      orderIcon = ' ⚠️';

      // Build tooltip with both approval and pending counts
      const tooltipParts = [];
      tooltipParts.push(`${ordersNeedingApproval.length} need${ordersNeedingApproval.length === 1 ? 's' : ''} approval`);
      if (ordersPending.length > 0) {
        tooltipParts.push(`${ordersPending.length} pending deliver${ordersPending.length === 1 ? 'y' : 'ies'}`);
      }
      orderTooltip = ` data-tooltip="${tooltipParts.join(', ')}"`;
    } else if (ordersPending.length > 0) {
      // ORANGE: Any orders pending (but none need approval)
      orderColor = 'color: #ff9800; font-weight: 600;';
      orderTooltip = ` data-tooltip="${ordersPending.length} pending deliver${ordersPending.length === 1 ? 'y' : 'ies'}"`;
    } else if (ordersCompleted.length === scout.orders.length && scout.orders.length > 0) {
      // GREEN: All orders complete
      orderColor = 'color: #4CAF50; font-weight: 600;';
    }

    // Main row (clickable)
    html += `<tr class="scout-row" data-scout-index="${idx}">`;
    html += `<td><span class="expand-icon" style="margin-right: 8px;">▶</span><strong>${escapeHtml(name)}</strong></td>`;
    html += `<td class="${orderTooltip ? 'tooltip-cell' : ''}"${orderTooltip}><span style="${orderColor}">${scout.orders.length}${orderIcon}</span></td>`;
    html += `<td>${sales}</td>`;
    html += `<td>${pickedUp}</td>`;
    html += `<td>${inventoryCell}</td>`;
    html += `<td>${totals.shipped || 0}</td>`;
    html += `<td>${totals.donations || 0}</td>`;
    html += `<td>${creditedCell}</td>`;

    // Build tooltip for Total Sold breakdown (Direct vs Credited)
    const totalSold = totals.totalSold || 0;
    const directSales = sales + (totals.shipped || 0) + (totals.donations || 0);
    const creditedSales = totalCredited;
    const tooltipBreakdown = [
      `Direct: ${directSales}`,
      `Credited: ${creditedSales}`
    ].join('\n');

    html += `<td class="tooltip-cell" data-tooltip="${escapeHtml(tooltipBreakdown)}">${totalSold}</td>`;
    html += `<td>$${Math.round(totals.revenue || 0)}</td>`;
    html += '</tr>';

    // Detail row (expandable)
    html += `<tr class="scout-detail" data-scout-index="${idx}" style="display: none;">`;
    html += `<td colspan="${SCOUT_SUMMARY_COLUMN_COUNT}">`;
    html += buildScoutDetailBreakdown(scout);
    html += '</td></tr>';
  });

  html += endTable() + '</div>';

  return html;
}

module.exports = {
  generateSummaryReport
};
