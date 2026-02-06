// HTML Builder Utilities
// Extracted from renderer.js for better organization

const { COOKIE_ORDER } = require('../cookie-constants.js');
const { PACKAGES_PER_CASE, DISPLAY_STRINGS } = require('../constants');

// Helper function to sort varieties by preferred order
function sortVarietiesByOrder(entries) {
  return entries.sort((a, b) => {
    const indexA = COOKIE_ORDER.indexOf(a[0]);
    const indexB = COOKIE_ORDER.indexOf(b[0]);

    // If both are in the order list, sort by position
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // If only A is in the list, it comes first
    if (indexA !== -1) return -1;
    // If only B is in the list, it comes first
    if (indexB !== -1) return 1;
    // Neither in list, maintain original order
    return 0;
  });
}

// Helper function to get complete variety list with 0 for missing cookies
function getCompleteVarieties(varieties) {
  const complete = {};
  COOKIE_ORDER.forEach(variety => {
    complete[variety] = varieties[variety] || 0;
  });
  return complete;
}

// Centralized date formatting utilities
const DateFormatter = {
  // Format date from YYYY/MM/DD to MM/DD/YYYY
  toDisplay(dateStr) {
    if (!dateStr) return '-';
    const str = String(dateStr);
    // Match YYYY/MM/DD or YYYY-MM-DD format
    const match = str.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${month}/${day}/${year}`;
    }
    return str; // Return as-is if format doesn't match
  },

  // Create filename-safe timestamp (YYYY-MM-DD-HH-MM-SS)
  toTimestamp(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-').split('.')[0];
  },

  // Format full timestamp for hover (e.g., "Feb 5, 2026, 3:45 PM")
  toFullTimestamp(date) {
    if (!date) return 'Never synced';

    const then = new Date(date);
    return then.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  },

  // Format friendly relative timestamp with time-of-day
  toFriendly(date) {
    if (!date) return 'Never';

    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);

    // Format time as "3:45 PM"
    const timeStr = then.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Check if same day
    const isToday = then.toDateString() === now.toDateString();

    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = then.toDateString() === yesterday.toDateString();

    // Calculate days difference for display
    const daysDiff = Math.floor((now.setHours(0,0,0,0) - then.setHours(0,0,0,0)) / 86400000);

    // Recent times (under 1 minute)
    if (diffMins < 1) return 'Just now';

    // Under an hour
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;

    // Today
    if (isToday) return `Today at ${timeStr}`;

    // Yesterday
    if (isYesterday) return `Yesterday at ${timeStr}`;

    // This week (2-6 days ago)
    if (daysDiff < 7) return `${daysDiff} days ago at ${timeStr}`;

    // Older - show full date and time
    const dateStr = then.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
    return `${dateStr} at ${timeStr}`;
  }
};

// Convenience wrapper for DateFormatter.toDisplay()
function formatDate(dateStr) {
  return DateFormatter.toDisplay(dateStr);
}

// Helper function to create horizontal stats layout
// stats: array of {label, value, description, color}
function createHorizontalStats(stats) {
  const columns = stats.length;
  let html = `<div style="display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 20px; margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">`;

  stats.forEach(stat => {
    const color = stat.color || '#666';
    html += `<div style="text-align: center;">`;
    html += `<div style="font-weight: 600; font-size: 0.9em; color: #666; margin-bottom: 8px;">${escapeHtml(stat.label)}</div>`;
    html += `<div style="font-size: 2em; font-weight: 700; color: ${color};">${stat.value}</div>`;
    html += `<div style="font-size: 0.8em; color: #888; margin-top: 5px;">${escapeHtml(stat.description)}</div>`;
    html += `</div>`;
  });

  html += '</div>';
  return html;
}

// Helper: Build inventory cell with negative inventory warning
function buildInventoryCell(netInventory, negativeVarieties) {
  if (negativeVarieties.length > 0) {
    const tooltipText = `Warning: Negative inventory\n${negativeVarieties.join('\n')}`;
    return `<span class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}" style="color: #f44336; font-weight: 600;">${netInventory} ⚠️</span>`;
  }
  return `${netInventory}`;
}

// Helper: Build credited cell with tooltips
function buildCreditedCell(isSiteRow, totalCredited, siteOrders, creditedBoothPackages, creditedDirectShipPackages) {
  if (isSiteRow) {
    const unallocatedDirectShip = siteOrders.directShip.unallocated || 0;
    const unallocatedGirlDelivery = siteOrders.girlDelivery.unallocated || 0;
    const totalUnallocated = unallocatedDirectShip + unallocatedGirlDelivery;

    if (totalUnallocated > 0) {
      // Build tooltip with allocation instructions
      const tooltipParts = [
        'UNALLOCATED - Action Required',
        `Direct Ship: ${unallocatedDirectShip}`,
        `Girl Delivery: ${unallocatedGirlDelivery}`,
        '',
        'Allocate in Smart Cookie:'
      ];

      if (unallocatedDirectShip > 0) {
        tooltipParts.push(`- ${DISPLAY_STRINGS.TROOP_DIRECT_SHIP_DIVIDER}`);
      }
      if (unallocatedGirlDelivery > 0) {
        tooltipParts.push(`- ${DISPLAY_STRINGS.SMART_VIRTUAL_BOOTH_DIVIDER}`);
      }

      const tooltipText = tooltipParts.join('\n');
      return `<span class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}" style="color: #f44336; font-weight: 600;">${totalUnallocated} ⚠️</span>`;
    }
  } else if (totalCredited > 0) {
    const sources = [];
    if (creditedBoothPackages > 0) sources.push(`${DISPLAY_STRINGS.TROOP_GIRL_DELIVERED}: ${creditedBoothPackages}`);
    if (creditedDirectShipPackages > 0) sources.push(`${DISPLAY_STRINGS.TROOP_DIRECT_SHIP}: ${creditedDirectShipPackages}`);
    if (sources.length > 0) {
      return `<span class="tooltip-cell" data-tooltip="${escapeHtml(sources.join('\n'))}">${totalCredited}</span>`;
    }
  }
  return `${totalCredited}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Table generation helpers
function startTable(className = 'report-table', style = '') {
  const styleAttr = style ? ` style="${style}"` : '';
  return `<table class="${className}"${styleAttr}>`;
}

function createTableHeader(columns) {
  const headerCells = columns.map(col => `<th>${col}</th>`).join('');
  return `<thead><tr>${headerCells}</tr></thead><tbody>`;
}

function createTableRow(cells, rowAttrs = '') {
  const attrStr = rowAttrs ? ` ${rowAttrs}` : '';
  const cellsHtml = cells.join('');
  return `<tr${attrStr}>${cellsHtml}</tr>`;
}

function endTable() {
  return '</tbody></table>';
}

function formatCurrency(value) {
  return `$${Math.round(value || 0)}`;
}

function formatNumber(value, defaultValue = 0) {
  return value !== null && value !== undefined ? value : defaultValue;
}

module.exports = {
  sortVarietiesByOrder,
  getCompleteVarieties,
  DateFormatter,
  formatDate,
  createHorizontalStats,
  buildInventoryCell,
  buildCreditedCell,
  escapeHtml,
  startTable,
  createTableHeader,
  createTableRow,
  endTable,
  formatCurrency,
  formatNumber
};
