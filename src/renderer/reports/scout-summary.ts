import { ALLOCATION_METHOD, DISPLAY_STRINGS, ORDER_TYPE, OWNER } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName, PROCEEDS_EXEMPT_PACKAGES } from '../../cookie-constants';
import type { IDataReconciler, Order, Scout, ScoutCredited, SiteOrdersDataset } from '../../types';
import { totalCredited } from '../../data-processing/calculators/helpers';
import {
  buildVarietyTooltipAttr,
  createTableHeader,
  endTable,
  escapeHtml,
  formatDate,
  getCompleteVarieties,
  sortVarietiesByOrder,
  startTable
} from '../html-builder';

// Build inventory cell with warning if any variety is negative
function buildInventoryCell(netInventory: number, negativeVarieties: any[] | undefined, actualNet: number): string {
  if (negativeVarieties && negativeVarieties.length > 0) {
    const varietyList = negativeVarieties
      .map((v: { variety: string; count: number }) => `${getCookieDisplayName(v.variety)}: ${v.count}`)
      .join('\n');
    const display = netInventory > 0 ? `+${netInventory}` : actualNet;
    return `<span class="tooltip-cell" data-tooltip="${escapeHtml(varietyList)}" style="color: #f44336; font-weight: 600;">${display} ⚠️</span>`;
  }

  if (netInventory < 0) {
    return `<span class="warning-text">${netInventory}</span>`;
  }
  if (netInventory > 0) {
    return `<span class="success-text">+${netInventory}</span>`;
  }
  return `<span class="">—</span>`;
}

function getStatusStyle(status: string | undefined): { style: string; text: string } {
  if (!status) {
    return { style: '', text: status || '' };
  }

  const needsApproval = status.includes('Needs Approval');
  const text = status === 'Status Delivered' ? 'Completed' : status;

  if (needsApproval) {
    return { style: 'color: #f44336; font-weight: 600;', text: `${text} ⚠️` };
  }

  const isCompleted =
    status === 'Status Delivered' || status.includes('Completed') || status.includes('Delivered') || status.includes('Shipped');
  if (isCompleted) {
    return { style: 'color: #4CAF50;', text };
  }

  const isPending = status.includes('Pending') || status.includes('Approved for Delivery');
  if (isPending) {
    return { style: 'color: #ff9800; font-weight: 600;', text };
  }

  return { style: '', text };
}

// Build tooltip lines for a single allocation source
function buildVirtualBoothTooltipLines(credited: ScoutCredited): string[] {
  const pkg = credited.virtualBooth.packages || 0;
  const don = credited.virtualBooth.donations || 0;
  if (pkg + don === 0) return [];
  const lines = [`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${pkg + don}`];
  credited.virtualBooth.allocations.forEach((a) => {
    const order = a.orderNumber ? `#${a.orderNumber}` : 'Unknown';
    const date = a.date ? ` (${a.date})` : '';
    lines.push(`  ${order}${date}: ${a.packages} pkg`);
  });
  return lines;
}

function buildDirectShipTooltipLines(credited: ScoutCredited): string[] {
  const pkg = credited.directShip.packages || 0;
  const don = credited.directShip.donations || 0;
  if (pkg + don === 0) return [];
  const lines = [`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${pkg + don}`];
  const n = credited.directShip.allocations.length;
  if (n > 0) lines.push(`  (${n} allocation${n === 1 ? '' : 's'} from SC divider)`);
  return lines;
}

function buildBoothSalesTooltipLines(credited: ScoutCredited): string[] {
  const pkg = credited.boothSales.packages || 0;
  const don = credited.boothSales.donations || 0;
  if (pkg + don === 0) return [];
  const lines = [`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${pkg + don}`];
  credited.boothSales.allocations.forEach((a) => {
    const store = a.storeName || 'Booth';
    const date = a.date ? ` (${a.date})` : '';
    const parts = [`${a.packages} pkg`];
    if (a.donations > 0) parts.push(`${a.donations} Donations`);
    lines.push(`  ${store}${date}: ${parts.join(', ')}`);
  });
  return lines;
}

function buildCreditedCell(isSiteRow: boolean, credited: ScoutCredited, siteOrders: SiteOrdersDataset): string {
  const totalCreditedCount = totalCredited(credited);
  if (totalCreditedCount === 0) return '—';

  const sources = [
    ...buildVirtualBoothTooltipLines(credited),
    ...buildDirectShipTooltipLines(credited),
    ...buildBoothSalesTooltipLines(credited)
  ];

  if (isSiteRow && siteOrders) {
    const hasSiteOrders = (siteOrders.directShip?.orders?.length || 0) > 0 || (siteOrders.girlDelivery?.orders?.length || 0) > 0;
    if (hasSiteOrders) {
      sources.push(
        `\nNote: Troop booth sales and direct ship orders are allocated to scouts in Smart Cookie. See site orders in scout details.`
      );
    }
  }

  return `<span class="tooltip-cell" data-tooltip="${escapeHtml(sources.join('\n'))}">${totalCreditedCount}</span>`;
}

// Calculate variety breakdowns from scout orders (simple inline calculation)
function calculateVarietyBreakdowns(scout: Scout): {
  salesVarieties: Record<string, number>;
  shippedVarieties: Record<string, number>;
  totalDonations: number;
} {
  const salesVarieties: Record<string, number> = {};
  const shippedVarieties: Record<string, number> = {};
  let totalDonations = 0;

  scout.orders.forEach((order: Order) => {
    // Count Cookie Share donations
    if (order.donations > 0) {
      totalDonations += order.donations;
    }

    // Classify by order type
    if (order.needsInventory) {
      // Girl delivery/in-hand orders
      (Object.entries(order.varieties) as [string, number][]).forEach(([variety, count]: [string, number]) => {
        if (variety !== COOKIE_TYPE.COOKIE_SHARE) {
          salesVarieties[variety] = (salesVarieties[variety] || 0) + count;
        }
      });
    } else if (order.owner === OWNER.GIRL && order.orderType === ORDER_TYPE.DIRECT_SHIP) {
      // Girl direct ship orders
      (Object.entries(order.varieties) as [string, number][]).forEach(([variety, count]: [string, number]) => {
        if (variety !== COOKIE_TYPE.COOKIE_SHARE) {
          shippedVarieties[variety] = (shippedVarieties[variety] || 0) + count;
        }
      });
    }
  });

  return { salesVarieties, shippedVarieties, totalDonations };
}

function formatNetInventory(net: number, isCookieShare: boolean): { html: string; className: string } {
  const naSpan = '<span style="color: #999;">N/A</span>';
  if (isCookieShare) return { html: naSpan, className: '' };
  if (net < 0) return { html: `<span style="color: #f44336; font-weight: 600;">${net} ⚠️</span>`, className: '' };
  if (net > 0) return { html: `+${net}`, className: 'success-text' };
  return { html: '—', className: '' };
}

function formatCreditedVariety(variety: string, credited: ScoutCredited): string {
  const vb = credited.virtualBooth.varieties[variety] || 0;
  const ds = credited.directShip.varieties[variety] || 0;
  const bs = credited.boothSales.varieties[variety] || 0;
  const total = vb + ds + bs;
  if (total === 0) return '—';

  const sources = [];
  if (vb > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${vb}`);
  if (ds > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${ds}`);
  if (bs > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${bs}`);
  return sources.length > 0 ? `<span class="tooltip-cell" data-tooltip="${escapeHtml(sources.join('\n'))}">${total}</span>` : `${total}`;
}

function buildVarietyRow(
  variety: string,
  inventory: Scout['inventory'],
  salesVarieties: Record<string, number>,
  shippedVarieties: Record<string, number>,
  credited: ScoutCredited
): string {
  const pickedUp = inventory.varieties[variety] || 0;
  const sold = salesVarieties[variety] || 0;
  const shipped = shippedVarieties[variety] || 0;
  const isCookieShare = variety === COOKIE_TYPE.COOKIE_SHARE;
  const { html: netHtml, className: netClass } = formatNetInventory(pickedUp - sold, isCookieShare);

  return (
    `<tr>` +
    `<td><strong>${escapeHtml(getCookieDisplayName(variety))}</strong></td>` +
    `<td class="${netClass}">${netHtml}</td>` +
    `<td>${sold}</td>` +
    `<td>${shipped > 0 ? shipped : '—'}</td>` +
    `<td>${formatCreditedVariety(variety, credited)}</td>` +
    `</tr>`
  );
}

// Build cookie breakdown table showing varieties, sales, inventory, and credited amounts
function buildCookieBreakdownTable(scout: Scout): string {
  const { inventory, credited } = scout;

  // Calculate variety breakdowns inline (simple loop over orders)
  const { salesVarieties, shippedVarieties, totalDonations } = calculateVarietyBreakdowns(scout);

  let html =
    '<h5>Cookie Breakdown <span style="font-weight: normal; font-size: 0.85em; color: #999;">(Direct sales only — does not include booth sales)</span></h5>';
  html += startTable('table-compact');
  html += createTableHeader(['Variety', 'Inventory', 'Delivered', 'Shipped', 'Credited']);

  // Add Cookie Share donations from all sources (orders + all credited)
  const salesWithDonations = { ...salesVarieties };
  const allCreditedDonations =
    (credited.virtualBooth.donations || 0) + (credited.directShip.donations || 0) + (credited.boothSales.donations || 0);
  if (totalDonations > 0 || allCreditedDonations > 0) {
    salesWithDonations[COOKIE_TYPE.COOKIE_SHARE] = totalDonations + allCreditedDonations;
  }

  // Combine all varieties for complete list
  const allVarieties = getCompleteVarieties({
    ...salesWithDonations,
    ...shippedVarieties,
    ...inventory.varieties,
    ...credited.virtualBooth.varieties,
    ...credited.directShip.varieties,
    ...credited.boothSales.varieties
  });

  sortVarietiesByOrder(Object.entries(allVarieties)).forEach(([variety, _]: [string, number]) => {
    html += buildVarietyRow(variety, inventory, salesVarieties, shippedVarieties, credited);
  });
  html += endTable();

  // Allocation Details sub-table (if scout has credited allocations)
  html += buildAllocationDetailsTable(credited);

  return html;
}

function buildVirtualBoothAllocationsHtml(credited: ScoutCredited): string {
  const allocations = credited.virtualBooth.allocations || [];
  if (allocations.length === 0) return '';

  const pkg = credited.virtualBooth.packages || 0;
  const don = credited.virtualBooth.donations || 0;
  const label = don > 0 ? `${pkg} pkg, ${don} Donations` : `${pkg} pkg`;

  let html = `<div style="margin-top: 12px;">`;
  html += `<h6 style="margin: 0 0 8px 0; color: #666;">${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]} (${label})</h6>`;
  html += startTable('table-compact');
  html += createTableHeader(['Order #', 'Date', 'From', 'Packages', 'Amount']);
  allocations.forEach((a) => {
    html +=
      `<tr><td>${escapeHtml(String(a.orderNumber || '-'))}</td><td>${escapeHtml(formatDate(a.date))}</td>` +
      `<td>${escapeHtml(String(a.from || '-'))}</td><td class="tooltip-cell"${buildVarietyTooltipAttr(a.varieties)}>${a.packages}</td>` +
      `<td>$${Math.round(a.amount || 0)}</td></tr>`;
  });
  return html + endTable() + '</div>';
}

function buildDirectShipAllocationsHtml(credited: ScoutCredited): string {
  const allocations = credited.directShip.allocations || [];
  if (allocations.length === 0) return '';

  const pkg = credited.directShip.packages || 0;
  const don = credited.directShip.donations || 0;
  const label = don > 0 ? `${pkg} pkg, ${don} Donations` : `${pkg} pkg`;

  let html = `<div style="margin-top: 12px;">`;
  html += `<h6 style="margin: 0 0 8px 0; color: #666;">${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]} (${label})</h6>`;
  html += startTable('table-compact');
  html += createTableHeader(['Source', 'Packages']);
  allocations.forEach((a) => {
    html += `<tr><td>SC Direct Ship Divider</td><td class="tooltip-cell"${buildVarietyTooltipAttr(a.varieties)}>${a.packages}</td></tr>`;
  });
  html += endTable();
  html += `<p style="font-size: 0.85em; color: #999; margin-top: 4px;">Note: The Smart Cookie Direct Ship Divider API does not provide per-order breakdowns.</p>`;
  return html + '</div>';
}

function buildBoothSalesAllocationsHtml(credited: ScoutCredited): string {
  const allocations = credited.boothSales.allocations || [];
  if (allocations.length === 0) return '';

  const pkg = credited.boothSales.packages || 0;
  const don = credited.boothSales.donations || 0;
  const label = don > 0 ? `${pkg} pkg, ${don} Donations` : `${pkg + don} pkg`;

  let html = `<div style="margin-top: 12px;">`;
  html += `<h6 style="margin: 0 0 8px 0; color: #666;">${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]} (${label})</h6>`;
  html += startTable('table-compact');
  html += createTableHeader(['Store', 'Date', 'Time', 'Packages', 'Donations']);
  allocations.forEach((a) => {
    const time = a.startTime && a.endTime ? `${a.startTime} - ${a.endTime}` : a.startTime || '-';
    html +=
      `<tr><td>${escapeHtml(String(a.storeName || '-'))}</td><td>${escapeHtml(formatDate(a.date))}</td>` +
      `<td>${escapeHtml(time)}</td><td class="tooltip-cell"${buildVarietyTooltipAttr(a.varieties)}>${a.packages}</td>` +
      `<td>${a.donations || '\u2014'}</td></tr>`;
  });
  return html + endTable() + '</div>';
}

function buildAllocationDetailsTable(credited: ScoutCredited): string {
  const sections = [
    buildVirtualBoothAllocationsHtml(credited),
    buildDirectShipAllocationsHtml(credited),
    buildBoothSalesAllocationsHtml(credited)
  ].filter(Boolean);

  if (sections.length === 0) return '';
  return `<div style="margin-top: 24px;"><h5>Allocation Details</h5>${sections.join('')}</div>`;
}

// Build orders table showing individual order details
function buildOrdersTable(scout: Scout): string {
  let html = `<div style="margin-top: 24px;">`;
  html += `<h5>Orders (${scout.orders.length})</h5>`;
  html += `<div style="margin-top: 12px;">`;
  html += startTable('table-compact');
  html += createTableHeader(['Order #', 'Date', 'Packages', 'Amount', 'Type', 'Payment', 'Status']);

  scout.orders.forEach((order: Order) => {
    const tooltipAttr = buildVarietyTooltipAttr(order.varieties);

    const PAYMENT_LABELS: Record<string, string> = { CAPTURED: 'Credit Card', AUTHORIZED: 'Credit Card', CASH: 'Cash' };
    const paymentDisplay = PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus || '-';

    const { style: statusStyle, text: statusText } = getStatusStyle(order.status);

    // Determine if order needs inventory based on owner + orderType
    const needsInventory = order.orderType !== ORDER_TYPE.DIRECT_SHIP && order.orderType !== ORDER_TYPE.DONATION;

    // Calculate total packages including donations
    const totalPackages = order.physicalPackages + order.donations;

    html += '<tr>';
    html += `<td>${escapeHtml(String(order.orderNumber))}</td>`;
    html += `<td>${escapeHtml(formatDate(order.date))}</td>`;
    html += `<td class="tooltip-cell"${tooltipAttr}>${totalPackages}${!needsInventory ? ' <span style="color: #999; font-size: 0.85em;">(no inv)</span>' : ''}</td>`;
    html += `<td>$${Math.round(order.amount)}</td>`;
    html += `<td>${escapeHtml(String((order as any).dcOrderType || '-'))}</td>`;
    html += `<td>${escapeHtml(paymentDisplay)}</td>`;
    html += `<td style="${statusStyle}">${escapeHtml(String(statusText))}</td>`;
    html += '</tr>';
  });

  html += endTable();
  html += '</div></div>';

  return html;
}

// Build scout detail breakdown section (variety breakdown table + order list)
function buildScoutDetailBreakdown(scout: Scout): string {
  let html = '<div class="scout-breakdown">';

  // Cookie breakdown table (skip for Site/troop rows - not meaningful)
  if (!scout.isSiteOrder) {
    html += buildCookieBreakdownTable(scout);
  }

  // Orders table
  html += buildOrdersTable(scout);

  html += '</div>';
  return html;
}

function getOrderStatusStyle(scout: Scout): { color: string; icon: string; tooltip: string } {
  const ordersNeedingApproval = scout.orders.filter((order: Order) => order.status?.includes('Needs Approval'));
  const ordersPending = scout.orders.filter(
    (order: Order) => order.status && (order.status.includes('Pending') || order.status.includes('Approved for Delivery'))
  );
  const ordersCompleted = scout.orders.filter(
    (order: Order) =>
      order.status &&
      (order.status === 'Status Delivered' ||
        order.status.includes('Completed') ||
        order.status.includes('Delivered') ||
        order.status.includes('Shipped'))
  );

  if (ordersNeedingApproval.length > 0) {
    const tooltipParts = [];
    tooltipParts.push(`${ordersNeedingApproval.length} need${ordersNeedingApproval.length === 1 ? 's' : ''} approval`);
    if (ordersPending.length > 0) {
      tooltipParts.push(`${ordersPending.length} pending deliver${ordersPending.length === 1 ? 'y' : 'ies'}`);
    }
    return {
      color: 'color: #f44336; font-weight: 600;',
      icon: ' ⚠️',
      tooltip: ` data-tooltip="${tooltipParts.join(', ')}"`
    };
  }

  if (ordersPending.length > 0) {
    return {
      color: 'color: #ff9800; font-weight: 600;',
      icon: '',
      tooltip: ` data-tooltip="${ordersPending.length} pending deliver${ordersPending.length === 1 ? 'y' : 'ies'}"`
    };
  }

  if (ordersCompleted.length === scout.orders.length && scout.orders.length > 0) {
    return { color: 'color: #4CAF50; font-weight: 600;', icon: '', tooltip: '' };
  }

  return { color: '', icon: '', tooltip: '' };
}

function buildDeliveredCell(sales: number, isSiteRow: boolean, scout: Scout, siteOrders: SiteOrdersDataset): string {
  if (!isSiteRow || !(scout as any).$hasUnallocatedSiteOrders || !siteOrders) {
    return `<td>${sales}</td>`;
  }
  const dsUnalloc = siteOrders.directShip.unallocated || 0;
  const gdUnalloc = siteOrders.girlDelivery.unallocated || 0;
  const bsUnalloc = siteOrders.boothSale.unallocated || 0;
  const parts = [];
  if (bsUnalloc > 0) parts.push(`Booth Sales: ${bsUnalloc}`);
  if (gdUnalloc > 0) parts.push(`Troop Girl Delivered: ${gdUnalloc}`);
  if (dsUnalloc > 0) parts.push(`Troop Direct Ship: ${dsUnalloc}`);
  parts.push('\nAllocate in Smart Cookie');
  return `<td><span class="tooltip-cell" data-tooltip="${escapeHtml(parts.join('\n'))}" style="color: #ff9800; font-weight: 600;">${sales} ⚠️</span></td>`;
}

function buildProceedsCell(isSiteRow: boolean, totals: Scout['totals']): string {
  if (isSiteRow) return '<td>-</td>';
  const proceeds = Math.round(totals.$troopProceeds || 0);
  const deduction = Math.round(totals.$proceedsDeduction || 0);
  const style = proceeds > 0 ? 'color: #4CAF50; font-weight: 600;' : '';
  if (deduction > 0) {
    const tooltip = `First ${PROCEEDS_EXEMPT_PACKAGES} pkg exempt: -$${deduction}\nGross: $${Math.round((totals.totalSold || 0) * 0.9)}`;
    return `<td class="tooltip-cell" data-tooltip="${escapeHtml(tooltip)}" style="${style}">$${proceeds}</td>`;
  }
  return `<td style="${style}">${proceeds > 0 ? `$${proceeds}` : '$0'}</td>`;
}

function buildCashOwedCell(isSiteRow: boolean, totals: Scout['totals']): string {
  if (isSiteRow) return '<td>-</td>';
  const financials = totals.$financials;
  const cashOwed = Math.round(financials?.cashOwed || 0);
  const style = cashOwed > 0 ? 'color: #C62828; font-weight: 600;' : 'color: #4CAF50;';
  const inventoryValue = Math.round(financials?.inventoryValue || 0);
  const electronic = Math.round(financials?.electronicPayments || 0);
  const salesCash = Math.round(financials?.cashCollected || 0);
  const unsold = Math.round(financials?.unsoldValue || 0);
  const tooltipParts = [`Pickup value: $${inventoryValue}`];
  if (electronic > 0) tooltipParts.push(`Digital payments: -$${electronic}`);
  if (salesCash > 0) tooltipParts.push(`Sales cash: $${salesCash}`);
  if (unsold > 0) tooltipParts.push(`Unsold inventory: $${unsold}`);
  return `<td class="tooltip-cell" data-tooltip="${escapeHtml(tooltipParts.join('\n'))}" style="${style}">${cashOwed > 0 ? `$${cashOwed}` : '$0'}</td>`;
}

function buildScoutRow(name: string, scout: Scout, idx: number, isSiteRow: boolean, siteOrders: SiteOrdersDataset): string {
  const { totals, credited } = scout;
  const sales = totals.sales || 0;

  const netInventory = Object.values(totals.$inventoryDisplay || {}).reduce((sum, count) => sum + Math.max(0, count || 0), 0);
  const inventoryCell = buildInventoryCell(netInventory, scout.$issues?.negativeInventory, totals.inventory || 0);

  const totalCreditedCount = totalCredited(credited);
  const creditedCell = buildCreditedCell(isSiteRow, credited, siteOrders);
  const { color: orderColor, icon: orderIcon, tooltip: orderTooltip } = getOrderStatusStyle(scout);

  const totalSold = totals.totalSold || 0;
  const directSales = sales + (totals.shipped || 0) + (totals.donations || 0);
  const soldTooltip = [`Direct: ${directSales}`, `Credited: ${totalCreditedCount}`].join('\n');

  let html = `<tr class="scout-row" data-scout-index="${idx}">`;
  html += `<td><span class="expand-icon" style="margin-right: 8px;">▶</span><strong>${escapeHtml(name)}</strong></td>`;
  html += `<td class="${orderTooltip ? 'tooltip-cell' : ''}"${orderTooltip}><span style="${orderColor}">${scout.orders.length}${orderIcon}</span></td>`;
  html += `<td>${inventoryCell}</td>`;
  html += buildDeliveredCell(sales, isSiteRow, scout, siteOrders);
  html += `<td>${totals.shipped || 0}</td>`;
  html += `<td>${totals.donations || 0}</td>`;
  html += `<td>${creditedCell}</td>`;
  html += `<td class="tooltip-cell" data-tooltip="${escapeHtml(soldTooltip)}">${totalSold}</td>`;
  html += buildProceedsCell(isSiteRow, totals);
  html += buildCashOwedCell(isSiteRow, totals);
  html += '</tr>';
  return html;
}

function generateSummaryReport(reconciler: IDataReconciler): string {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.scouts) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const scouts = reconciler.unified.scouts;
  const siteOrders = reconciler.unified.siteOrders;

  // Convert Map to sorted array of [name, scout] entries, filtering out scouts with no sales
  // Site row only shows when it has unallocated items (donations are handled by booth divider)
  const sortedScouts = Array.from(scouts.entries())
    .filter(([_name, scout]: [string, Scout]) =>
      scout.isSiteOrder ? (scout as any).$hasUnallocatedSiteOrders : (scout.totals.totalSold || 0) > 0
    )
    .sort((a: [string, Scout], b: [string, Scout]) => a[0].localeCompare(b[0]));

  const SCOUT_SUMMARY_COLUMN_COUNT = 10;

  let html = '<div class="report-visual"><h3>Scout Summary</h3>';
  html +=
    '<p class="table-hint">💡 Click on any scout to see detailed breakdown. <strong>Delivered</strong> = packages for in-person delivery. <strong>Inventory</strong> = net on hand. <strong>Credited</strong> = troop booth sales + direct ship allocated to scout. <strong>Shipped</strong> = scout\'s own direct ship orders. <strong>Proceeds</strong> = $0.90/pkg after first 50 exempt. <strong>Cash Due</strong> = pickup value minus electronic DC payments.</p>';
  html += startTable('table-normal scout-table');
  html += createTableHeader([
    'Scout',
    'Orders',
    'Inventory',
    'Delivered',
    'Shipped',
    'Donations',
    'Credited',
    'Total Sold',
    'Proceeds',
    'Cash Due'
  ]);

  sortedScouts.forEach(([name, scout]: [string, Scout], idx: number) => {
    const isSiteRow = name.endsWith(' Site');

    // Main row (clickable)
    html += buildScoutRow(name, scout, idx, isSiteRow, siteOrders);

    // Detail row (expandable)
    html += `<tr class="scout-detail" data-scout-index="${idx}" style="display: none;">`;
    html += `<td colspan="${SCOUT_SUMMARY_COLUMN_COUNT}">`;
    html += buildScoutDetailBreakdown(scout);
    html += '</td></tr>';
  });

  html += `${endTable()}</div>`;

  return html;
}

export { generateSummaryReport };
