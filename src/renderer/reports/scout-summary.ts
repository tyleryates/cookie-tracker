import { ALLOCATION_METHOD, DISPLAY_STRINGS, ORDER_TYPE, OWNER } from '../../constants';
import { COOKIE_TYPE, getCookieDisplayName, PROCEEDS_EXEMPT_PACKAGES } from '../../cookie-constants';
import type { IDataReconciler, Order, Scout, ScoutCredited, SiteOrdersDataset } from '../../types';
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

// Build credited cell with tooltip
function buildCreditedCell(isSiteRow: boolean, credited: ScoutCredited, siteOrders: SiteOrdersDataset): string {
  const creditedVirtualBoothPackages = credited.virtualBooth.packages || 0;
  const creditedDirectShipPackages = credited.directShip.packages || 0;
  const creditedBoothSalesPackages = credited.boothSales.packages || 0;
  const creditedBoothSalesDonations = credited.boothSales.donations || 0;
  const totalCredited =
    creditedVirtualBoothPackages + creditedDirectShipPackages + creditedBoothSalesPackages + creditedBoothSalesDonations;

  if (totalCredited === 0) {
    return '—';
  }

  // Build tooltip breakdown
  const sources: string[] = [];
  if (creditedVirtualBoothPackages > 0) {
    sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${creditedVirtualBoothPackages}`);
    // Show individual virtual booth allocations with order numbers
    if (credited.virtualBooth.allocations.length > 0) {
      credited.virtualBooth.allocations.forEach((a) => {
        const orderPart = a.orderNumber ? `#${a.orderNumber}` : 'Unknown';
        const datePart = a.date ? ` (${a.date})` : '';
        sources.push(`  ${orderPart}${datePart}: ${a.packages} pkg`);
      });
    }
  }
  if (creditedDirectShipPackages > 0) {
    sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${creditedDirectShipPackages}`);
    // Direct ship allocations lack per-order detail from API
    if (credited.directShip.allocations.length > 0) {
      sources.push(
        `  (${credited.directShip.allocations.length} allocation${credited.directShip.allocations.length === 1 ? '' : 's'} from SC divider)`
      );
    }
  }
  const totalBoothCredited = creditedBoothSalesPackages + creditedBoothSalesDonations;
  if (totalBoothCredited > 0) {
    sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${totalBoothCredited}`);
    // Show per-booth allocations
    if (credited.boothSales.allocations.length > 0) {
      credited.boothSales.allocations.forEach((a) => {
        const storePart = a.storeName || 'Booth';
        const datePart = a.date ? ` (${a.date})` : '';
        const parts = [`${a.packages} pkg`];
        if (a.donations > 0) parts.push(`${a.donations} Donations`);
        sources.push(`  ${storePart}${datePart}: ${parts.join(', ')}`);
      });
    }
  }

  // If this is the Site row (troop-level orders), add context to tooltip about site orders
  if (isSiteRow && siteOrders) {
    const hasSiteOrders = (siteOrders.directShip?.orders?.length || 0) > 0 || (siteOrders.girlDelivery?.orders?.length || 0) > 0;
    if (hasSiteOrders) {
      sources.push(
        `\nNote: Troop booth sales and direct ship orders are allocated to scouts in Smart Cookie. See site orders in scout details.`
      );
    }
  }

  const tooltipText = sources.join('\n');
  return `<span class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}">${totalCredited}</span>`;
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

function buildVarietyRow(
  variety: string,
  inventory: Scout['inventory'],
  salesVarieties: Record<string, number>,
  shippedVarieties: Record<string, number>,
  credited: ScoutCredited
): string {
  const pickedUp = inventory.varieties[variety] || 0;
  const sold = salesVarieties[variety] || 0;
  const creditedVirtualBooth = credited.virtualBooth.varieties[variety] || 0;
  const creditedDirectShip = credited.directShip.varieties[variety] || 0;
  const creditedBoothSales = credited.boothSales.varieties[variety] || 0;
  const creditedTotal = creditedVirtualBooth + creditedDirectShip + creditedBoothSales;
  const shipped = shippedVarieties[variety] || 0;
  const net = pickedUp - sold;
  const isCookieShare = variety === COOKIE_TYPE.COOKIE_SHARE;
  const naSpan = '<span style="color: #999;">N/A</span>';

  let netDisplay: string;
  let netClass = '';
  if (isCookieShare) {
    netDisplay = naSpan;
  } else if (net < 0) {
    netDisplay = `<span style="color: #f44336; font-weight: 600;">${net} ⚠️</span>`;
  } else if (net > 0) {
    netClass = 'success-text';
    netDisplay = `+${net}`;
  } else {
    netDisplay = '—';
  }

  let creditedDisplay: string | number = creditedTotal > 0 ? creditedTotal : '—';
  if (creditedTotal > 0) {
    const sources = [];
    if (creditedVirtualBooth > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]}: ${creditedVirtualBooth}`);
    if (creditedDirectShip > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]}: ${creditedDirectShip}`);
    if (creditedBoothSales > 0) sources.push(`${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]}: ${creditedBoothSales}`);
    if (sources.length > 0) {
      creditedDisplay = `<span class="tooltip-cell" data-tooltip="${escapeHtml(sources.join('\n'))}">${creditedTotal}</span>`;
    }
  }

  let html = `<tr>`;
  html += `<td><strong>${escapeHtml(getCookieDisplayName(variety))}</strong></td>`;
  html += `<td class="${isCookieShare ? '' : netClass}">${isCookieShare ? naSpan : netDisplay}</td>`;
  html += `<td>${sold}</td>`;
  html += `<td>${shipped > 0 ? shipped : '—'}</td>`;
  html += `<td>${creditedDisplay}</td>`;
  html += `</tr>`;
  return html;
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

  // Add Cookie Share donations and booth donations to sales
  const salesWithDonations = { ...salesVarieties };
  if (totalDonations > 0 || credited.boothSales.donations > 0) {
    salesWithDonations[COOKIE_TYPE.COOKIE_SHARE] = totalDonations + credited.boothSales.donations;
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

// Build allocation details table showing individual allocation records
function buildAllocationDetailsTable(credited: ScoutCredited): string {
  const virtualBoothAllocations = credited.virtualBooth.allocations || [];
  const directShipAllocations = credited.directShip.allocations || [];
  const boothSalesAllocations = credited.boothSales.allocations || [];

  if (virtualBoothAllocations.length === 0 && directShipAllocations.length === 0 && boothSalesAllocations.length === 0) {
    return '';
  }

  let html = '<div style="margin-top: 24px;">';
  html += '<h5>Allocation Details</h5>';

  // Virtual Booth allocations (have order-level traceability)
  if (virtualBoothAllocations.length > 0) {
    html += `<div style="margin-top: 12px;">`;
    html += `<h6 style="margin: 0 0 8px 0; color: #666;">${DISPLAY_STRINGS[ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]} (${credited.virtualBooth.packages} pkg)</h6>`;
    html += startTable('table-compact');
    html += createTableHeader(['Order #', 'Date', 'From', 'Packages', 'Amount']);

    virtualBoothAllocations.forEach((a) => {
      html += '<tr>';
      html += `<td>${escapeHtml(String(a.orderNumber || '-'))}</td>`;
      html += `<td>${escapeHtml(formatDate(a.date))}</td>`;
      html += `<td>${escapeHtml(String(a.from || '-'))}</td>`;
      html += `<td class="tooltip-cell"${buildVarietyTooltipAttr(a.varieties)}>${a.packages}</td>`;
      html += `<td>$${Math.round(a.amount || 0)}</td>`;
      html += '</tr>';
    });

    html += endTable();
    html += '</div>';
  }

  // Direct Ship allocations (aggregate only — no order-level detail from API)
  if (directShipAllocations.length > 0) {
    html += `<div style="margin-top: 12px;">`;
    html += `<h6 style="margin: 0 0 8px 0; color: #666;">${DISPLAY_STRINGS[ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]} (${credited.directShip.packages} pkg)</h6>`;
    html += startTable('table-compact');
    html += createTableHeader(['Source', 'Packages']);

    directShipAllocations.forEach((a) => {
      html += '<tr>';
      html += `<td>SC Direct Ship Divider</td>`;
      html += `<td class="tooltip-cell"${buildVarietyTooltipAttr(a.varieties)}>${a.packages}</td>`;
      html += '</tr>';
    });

    html += endTable();
    html += `<p style="font-size: 0.85em; color: #999; margin-top: 4px;">Note: The Smart Cookie Direct Ship Divider API does not provide per-order breakdowns.</p>`;
    html += '</div>';
  }

  // Booth Sales allocations (per-reservation detail from Smart Booth Divider API)
  if (boothSalesAllocations.length > 0) {
    const boothTotal = (credited.boothSales.packages || 0) + (credited.boothSales.donations || 0);
    const boothLabel =
      credited.boothSales.donations > 0
        ? `${credited.boothSales.packages} pkg, ${credited.boothSales.donations} Donations`
        : `${boothTotal} pkg`;
    html += `<div style="margin-top: 12px;">`;
    html += `<h6 style="margin: 0 0 8px 0; color: #666;">${DISPLAY_STRINGS[ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]} (${boothLabel})</h6>`;
    html += startTable('table-compact');
    html += createTableHeader(['Store', 'Date', 'Time', 'Packages', 'Donations']);

    boothSalesAllocations.forEach((a) => {
      const timeDisplay = a.startTime && a.endTime ? `${a.startTime} - ${a.endTime}` : a.startTime || '-';
      html += '<tr>';
      html += `<td>${escapeHtml(String(a.storeName || '-'))}</td>`;
      html += `<td>${escapeHtml(formatDate(a.date))}</td>`;
      html += `<td>${escapeHtml(timeDisplay)}</td>`;
      html += `<td class="tooltip-cell"${buildVarietyTooltipAttr(a.varieties)}>${a.packages}</td>`;
      html += `<td>${a.donations || '\u2014'}</td>`;
      html += '</tr>';
    });

    html += endTable();
    html += '</div>';
  }

  html += '</div>';
  return html;
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

    // Format payment status for display
    const paymentDisplay =
      order.paymentStatus === 'CAPTURED'
        ? 'Credit Card'
        : order.paymentStatus === 'AUTHORIZED'
          ? 'Credit Card'
          : order.paymentStatus === 'CASH'
            ? 'Cash'
            : order.paymentStatus || '-';

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

function buildScoutRow(name: string, scout: Scout, idx: number, isSiteRow: boolean, siteOrders: SiteOrdersDataset): string {
  const totals = scout.totals;
  const _inventory = scout.inventory;
  const credited = scout.credited;

  const sales = totals.sales || 0;

  const netInventory = Object.values(totals.$inventoryDisplay || {}).reduce((sum, count) => sum + Math.max(0, count || 0), 0);
  const actualNetInventory = totals.inventory || 0;
  const negativeVarieties = scout.$issues?.negativeInventory || [];
  const inventoryCell = buildInventoryCell(netInventory, negativeVarieties, actualNetInventory);

  const totalCredited =
    (credited.virtualBooth.packages || 0) +
    (credited.directShip.packages || 0) +
    (credited.boothSales.packages || 0) +
    (credited.boothSales.donations || 0);
  const creditedCell = buildCreditedCell(isSiteRow, credited, siteOrders);

  const { color: orderColor, icon: orderIcon, tooltip: orderTooltip } = getOrderStatusStyle(scout);

  let html = `<tr class="scout-row" data-scout-index="${idx}">`;
  html += `<td><span class="expand-icon" style="margin-right: 8px;">▶</span><strong>${escapeHtml(name)}</strong></td>`;
  html += `<td class="${orderTooltip ? 'tooltip-cell' : ''}"${orderTooltip}><span style="${orderColor}">${scout.orders.length}${orderIcon}</span></td>`;
  html += `<td>${inventoryCell}</td>`;

  // Delivered cell - show warning for unallocated site orders
  if (isSiteRow && (scout as any).$hasUnallocatedSiteOrders && siteOrders) {
    const dsUnalloc = siteOrders.directShip.unallocated || 0;
    const gdUnalloc = siteOrders.girlDelivery.unallocated || 0;
    const bsUnalloc = siteOrders.boothSale.unallocated || 0;
    const parts = [];
    if (bsUnalloc > 0) parts.push(`Booth Sales: ${bsUnalloc}`);
    if (gdUnalloc > 0) parts.push(`Troop Girl Delivered: ${gdUnalloc}`);
    if (dsUnalloc > 0) parts.push(`Troop Direct Ship: ${dsUnalloc}`);
    parts.push('\nAllocate in Smart Cookie');
    const tooltip = parts.join('\n');
    html += `<td><span class="tooltip-cell" data-tooltip="${escapeHtml(tooltip)}" style="color: #ff9800; font-weight: 600;">${sales} ⚠️</span></td>`;
  } else {
    html += `<td>${sales}</td>`;
  }

  html += `<td>${totals.shipped || 0}</td>`;
  html += `<td>${totals.donations || 0}</td>`;
  html += `<td>${creditedCell}</td>`;

  // Build tooltip for Total Sold breakdown (Direct vs Credited)
  const totalSold = totals.totalSold || 0;
  const directSales = sales + (totals.shipped || 0) + (totals.donations || 0);
  const tooltipBreakdown = [`Direct: ${directSales}`, `Credited: ${totalCredited}`].join('\n');
  html += `<td class="tooltip-cell" data-tooltip="${escapeHtml(tooltipBreakdown)}">${totalSold}</td>`;

  // Proceeds (with deduction tooltip)
  if (isSiteRow) {
    html += '<td>-</td>';
  } else {
    const proceeds = Math.round(totals.$troopProceeds || 0);
    const deduction = Math.round(totals.$proceedsDeduction || 0);
    const proceedsStyle = proceeds > 0 ? 'color: #4CAF50; font-weight: 600;' : '';
    if (deduction > 0) {
      const tooltipText = `First ${PROCEEDS_EXEMPT_PACKAGES} pkg exempt: -$${deduction}\nGross: $${Math.round(totalSold * 0.9)}`;
      html += `<td class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}" style="${proceedsStyle}">$${proceeds}</td>`;
    } else {
      html += `<td style="${proceedsStyle}">${proceeds > 0 ? `$${proceeds}` : '$0'}</td>`;
    }
  }

  // Cash Owed
  const financials = totals.$financials;
  const cashOwed = Math.round(financials?.cashOwed || 0);
  const cashStyle = cashOwed > 0 ? 'color: #C62828; font-weight: 600;' : 'color: #4CAF50;';
  if (isSiteRow) {
    html += '<td>-</td>';
  } else {
    const inventoryValue = Math.round(financials?.inventoryValue || 0);
    const electronic = Math.round(financials?.electronicPayments || 0);
    const salesCash = Math.round(financials?.cashCollected || 0);
    const unsold = Math.max(0, cashOwed - salesCash);
    const tooltipParts = [`Pickup value: $${inventoryValue}`];
    if (electronic > 0) tooltipParts.push(`Digital payments: -$${electronic}`);
    if (salesCash > 0) tooltipParts.push(`Sales cash: $${salesCash}`);
    if (unsold > 0) tooltipParts.push(`Unsold inventory: $${unsold}`);
    const tooltipText = tooltipParts.join('\n');
    html += `<td class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}" style="${cashStyle}">${cashOwed > 0 ? `$${cashOwed}` : '$0'}</td>`;
  }
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

  let html = '<div class="report-visual"><h3>Scout Summary Report</h3>';
  html +=
    '<p class="table-hint">💡 Click on any scout to see detailed breakdown. <strong>Delivered</strong> = packages for in-person delivery. <strong>Inventory</strong> = net on hand. <strong>Credited</strong> = troop booth sales + direct ship allocated to scout. <strong>Shipped</strong> = scout\'s own direct ship orders. <strong>Proceeds</strong> = $0.90/pkg after first 50 exempt. <strong>Cash Owed</strong> = pickup value minus electronic DC payments.</p>';
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
    'Cash Owed'
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
