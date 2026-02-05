const { ipcRenderer } = require('electron');
const XLSX = require('xlsx');
const DataReconciler = require('./data-reconciler.js');
const { COOKIE_ORDER, PHYSICAL_COOKIE_TYPES, COOKIE_ID_MAP } = require('./cookie-constants.js');
const tippy = require('tippy.js').default;

// Global data
let digitalCookieData = [];
let smartCookieData = null;
let reconciler = new DataReconciler();

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

// Helper function to format date from YYYY/MM/DD to MM/DD/YYYY
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const str = String(dateStr);
  // Match YYYY/MM/DD or YYYY-MM-DD format
  const match = str.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${month}/${day}/${year}`;
  }
  return str; // Return as-is if format doesn't match
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

// DOM elements
const configureLoginsBtn = document.getElementById('configureLoginsBtn');
const refreshFromWebBtn = document.getElementById('refreshFromWebBtn');
const importStatus = document.getElementById('importStatus');
const reportContainer = document.getElementById('reportContainer');
const toggleScDataBtn = document.getElementById('toggleScDataBtn');
const toggleDcDataBtn = document.getElementById('toggleDcDataBtn');
const scDataContainer = document.getElementById('scDataContainer');
const dcDataContainer = document.getElementById('dcDataContainer');
const scDataIcon = document.getElementById('scDataIcon');
const dcDataIcon = document.getElementById('dcDataIcon');
const dcStatus = document.getElementById('dcStatus');
const scStatus = document.getElementById('scStatus');
const dcLastSync = document.getElementById('dcLastSync');
const scLastSync = document.getElementById('scLastSync');
const troopSummaryBtn = document.getElementById('troopSummaryBtn');
const inventoryReportBtn = document.getElementById('inventoryReportBtn');
const summaryReportBtn = document.getElementById('summaryReportBtn');
const varietyReportBtn = document.getElementById('varietyReportBtn');
const donationAlertBtn = document.getElementById('donationAlertBtn');

// Modal elements
const loginModal = document.getElementById('loginModal');
const closeModal = document.getElementById('closeModal');
const cancelModal = document.getElementById('cancelModal');
const saveCredentials = document.getElementById('saveCredentials');
const dcUsername = document.getElementById('dcUsername');
const dcPassword = document.getElementById('dcPassword');
const dcRole = document.getElementById('dcRole');
const scUsername = document.getElementById('scUsername');
const scPassword = document.getElementById('scPassword');

// Progress elements
const dcProgress = document.getElementById('dcProgress');
const dcProgressFill = document.getElementById('dcProgressFill');
const dcProgressText = document.getElementById('dcProgressText');
const scProgress = document.getElementById('scProgress');
const scProgressFill = document.getElementById('scProgressFill');
const scProgressText = document.getElementById('scProgressText');

// Event listeners
configureLoginsBtn.addEventListener('click', openLoginModal);
refreshFromWebBtn.addEventListener('click', handleRefreshFromWeb);
if (toggleScDataBtn) toggleScDataBtn.addEventListener('click', () => toggleDataView('sc'));
if (toggleDcDataBtn) toggleDcDataBtn.addEventListener('click', () => toggleDataView('dc'));
if (troopSummaryBtn) troopSummaryBtn.addEventListener('click', () => generateReport('troop'));
if (inventoryReportBtn) inventoryReportBtn.addEventListener('click', () => generateReport('inventory'));
if (summaryReportBtn) summaryReportBtn.addEventListener('click', () => generateReport('summary'));
if (varietyReportBtn) varietyReportBtn.addEventListener('click', () => generateReport('variety'));
if (donationAlertBtn) donationAlertBtn.addEventListener('click', () => generateReport('donation-alert'));

// Modal event listeners
closeModal.addEventListener('click', closeLoginModal);
cancelModal.addEventListener('click', closeLoginModal);
saveCredentials.addEventListener('click', handleSaveCredentials);

// Close modal when clicking outside
loginModal.addEventListener('click', (e) => {
  if (e.target === loginModal) {
    closeLoginModal();
  }
});

// Listen for scrape progress events
ipcRenderer.on('scrape-progress', (event, progress) => {
  updateScrapeProgress(progress);
});

// Auto-load data on startup
window.addEventListener('DOMContentLoaded', async () => {
  // Load app version from package.json
  try {
    const packageJson = require('./package.json');
    const versionEl = document.getElementById('appVersion');
    if (versionEl && packageJson.version) {
      versionEl.textContent = `v${packageJson.version}`;
    }
  } catch (err) {
    console.error('Failed to load version:', err);
  }

  await loadDataFromDisk(false);
  await checkLoginStatus();
});

// Modal functions
async function openLoginModal() {
  try {
    // Load existing credentials
    const result = await ipcRenderer.invoke('load-credentials');

    if (result.success && result.credentials) {
      dcUsername.value = result.credentials.digitalCookie.username || '';
      dcPassword.value = result.credentials.digitalCookie.password || '';
      dcRole.value = result.credentials.digitalCookie.role || '';
      scUsername.value = result.credentials.smartCookie.username || '';
      scPassword.value = result.credentials.smartCookie.password || '';
    }

    loginModal.classList.add('show');
  } catch (error) {
    console.error('Error loading credentials:', error);
    loginModal.classList.add('show');
  }
}

function closeLoginModal() {
  loginModal.classList.remove('show');
}

async function handleSaveCredentials() {
  try {
    const credentials = {
      digitalCookie: {
        username: dcUsername.value.trim(),
        password: dcPassword.value.trim(),
        role: dcRole.value.trim()
      },
      smartCookie: {
        username: scUsername.value.trim(),
        password: scPassword.value.trim()
      }
    };

    const result = await ipcRenderer.invoke('save-credentials', credentials);

    if (result.success) {
      showStatus('Credentials saved successfully', 'success');
      closeLoginModal();

      // Update button prominence
      await checkLoginStatus();
    } else {
      showStatus(`Error saving credentials: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
}

async function handleRefreshFromWeb() {
  try {
    // Show progress UI for both scrapers
    initializeProgressBar(dcProgress, dcProgressFill, dcProgressText);
    initializeProgressBar(scProgress, scProgressFill, scProgressText);

    // Set initial status
    const dcStatusEl = document.getElementById('dcStatus');
    const scStatusEl = document.getElementById('scStatus');
    dcStatusEl.textContent = 'Syncing...';
    dcStatusEl.className = 'sync-status syncing';
    scStatusEl.textContent = 'Syncing...';
    scStatusEl.className = 'sync-status syncing';

    showStatus('Starting API sync for both platforms...', 'success');

    // Disable button during scraping
    refreshFromWebBtn.disabled = true;

    // Start API scraping (both run in parallel)
    const result = await ipcRenderer.invoke('scrape-websites');

    // Hide progress UI
    hideProgressBar(dcProgress);
    hideProgressBar(scProgress);

    // Re-enable button
    refreshFromWebBtn.disabled = false;

    const now = new Date();
    const errors = [];
    const parts = [];

    // Update status for both data sources
    const dcStatus = updateSyncStatus('Digital Cookie', result.digitalCookie, dcStatusEl, dcLastSync, now, errors);
    const scStatus = updateSyncStatus('Smart Cookie', result.smartCookie, scStatusEl, scLastSync, now, errors);

    if (dcStatus && dcStatus.success) parts.push(dcStatus.message);
    if (scStatus && scStatus.success) parts.push(scStatus.message);

    if (result.error) errors.push(result.error);

    if (result.success && parts.length > 0) {
      showStatus(`✅ Sync complete! ${parts.join(', ')}`, 'success');
      // Auto-load downloaded files and update timestamps to reflect fresh sync
      await loadDataFromDisk(false, true);
    } else if (errors.length > 0) {
      showStatus(`Sync failed: ${errors.join('; ')}`, 'error');
    } else {
      showStatus('Sync completed with warnings', 'warning');
    }

  } catch (error) {
    hideProgressBar(dcProgress);
    hideProgressBar(scProgress);
    refreshFromWebBtn.disabled = false;
    showStatus(`Error: ${error.message}`, 'error');
    console.error(error);
  }
}

async function loadDataFromDisk(showMessages = true, updateTimestamps = true) {
  try {
    if (showMessages) {
      showStatus('Loading data...', 'success');
    }

    // Reset reconciler to avoid duplicates when reloading data
    reconciler = new DataReconciler();

    // Scan /data/in/ directory
    const result = await ipcRenderer.invoke('scan-in-directory');

    if (!result.success || !result.files || result.files.length === 0) {
      return false;
    }

    // Find most recent files of each type
    const scFiles = result.files.filter(f => f.extension === '.json' && f.name.startsWith('SC-'));
    const dcFiles = result.files.filter(f => f.extension === '.xlsx' && f.name.startsWith('DC-'));

    scFiles.sort((a, b) => b.name.localeCompare(a.name));
    dcFiles.sort((a, b) => b.name.localeCompare(a.name));

    let loadedSC = false;
    let loadedDC = false;

    // Load most recent Smart Cookie file
    if (scFiles.length > 0) {
      const file = scFiles[0];
      const jsonData = file.data;

      if (isSmartCookieAPIFormat(jsonData)) {
        reconciler.importSmartCookieAPI(jsonData);
        smartCookieData = jsonData;
        displaySmartCookieData(smartCookieData);
        loadedSC = true;

        // Update sync status
        scStatus.textContent = '✓ Synced';
        scStatus.className = 'sync-status synced';
        if (updateTimestamps) {
          // Extract timestamp from filename (SC-2026-02-04-16-30-45.json)
          const timestampStr = file.name.replace('SC-', '').replace('.json', '');
          // Convert from YYYY-MM-DD-HH-MM-SS to YYYY-MM-DDTHH:MM:SS
          const isoTimestamp = timestampStr.replace(/-(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
          scLastSync.textContent = `Last synced: ${formatFriendlyTimestamp(isoTimestamp)}`;
        }
      }
    }

    // Load most recent Digital Cookie file
    if (dcFiles.length > 0) {
      const file = dcFiles[0];
      const parsedData = parseExcel(file.data);

      if (isDigitalCookieFormat(parsedData)) {
        reconciler.importDigitalCookie(parsedData);
        digitalCookieData = parsedData;
        displayData(parsedData);
        loadedDC = true;

        // Update sync status
        dcStatus.textContent = '✓ Synced';
        dcStatus.className = 'sync-status synced';
        if (updateTimestamps) {
          // Extract timestamp from filename (DC-2026-02-04-16-30-45.xlsx)
          const timestampStr = file.name.replace('DC-', '').replace('.xlsx', '');
          // Convert from YYYY-MM-DD-HH-MM-SS to YYYY-MM-DDTHH:MM:SS
          const isoTimestamp = timestampStr.replace(/-(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
          dcLastSync.textContent = `Last synced: ${formatFriendlyTimestamp(isoTimestamp)}`;
        }
      }
    }

    // Enable report buttons if any data was loaded
    if (loadedSC || loadedDC) {
      enableReportButtons();
      if (showMessages) {
        showStatus(`✅ Loaded ${result.files.length} file(s)`, 'success');
      }
      return true;
    }

    return false;

  } catch (error) {
    if (showMessages) {
      showStatus(`Error loading files: ${error.message}`, 'error');
    }
    console.error(error);
    return false;
  }
}

function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { raw: false });
}

function isDigitalCookieFormat(data) {
  if (!data || data.length === 0) return false;
  const headers = Object.keys(data[0]);
  return headers.includes('Girl First Name') && headers.includes('Order Number');
}

function isSmartCookieAPIFormat(data) {
  return data && data.orders && Array.isArray(data.orders);
}

function displayData(data, label = 'Orders', container = dcDataContainer) {
  if (!data || data.length === 0 || !container) {
    return;
  }

  // Get all column headers from the first row
  const allHeaders = Object.keys(data[0]);

  let html = `<p class="table-hint" style="margin-bottom: 15px;"><strong>${label}</strong> - ${data.length} records (showing first 100 rows, all ${allHeaders.length} columns)</p>`;
  html += startTable('table-compact');
  html += createTableHeader(allHeaders.map(h => `<span style="white-space: nowrap;">${escapeHtml(h)}</span>`));

  data.slice(0, 100).forEach(row => {
    const cells = allHeaders.map(header => {
      const value = row[header];
      let displayValue = '';

      // Format the value appropriately
      if (value === null || value === undefined || value === '') {
        displayValue = '-';
      } else if (typeof value === 'number') {
        displayValue = value.toString();
      } else {
        displayValue = escapeHtml(String(value));
      }

      return `<td style="white-space: nowrap;">${displayValue}</td>`;
    });
    html += createTableRow(cells);
  });

  html += endTable();
  if (data.length > 100) {
    html += `<p class="table-hint">Showing first 100 of ${data.length} records</p>`;
  }

  container.innerHTML = html;
}

function displaySmartCookieData(data, container = scDataContainer) {
  if (!data || !data.orders || data.orders.length === 0 || !container) {
    if (container) {
      container.innerHTML = '<p class="placeholder">No Smart Cookie data available</p>';
    }
    return;
  }

  // Cookie ID mapping - verified against Smart Cookie CSV export
  // Use shared cookie ID mapping
  const cookieIdMap = COOKIE_ID_MAP;

  // Flatten the first order to get all available fields
  const sampleOrder = data.orders[0];
  const flattenedSample = flattenObject(sampleOrder, cookieIdMap);
  const allHeaders = Object.keys(flattenedSample);

  let html = `<p class="table-hint" style="margin-bottom: 15px;"><strong>Smart Cookie Transfers</strong> - ${data.orders.length} records (showing first 100 rows, all ${allHeaders.length} columns)</p>`;
  html += startTable('table-compact');
  html += createTableHeader(allHeaders.map(h => `<span style="white-space: nowrap;">${escapeHtml(h)}</span>`));

  data.orders.slice(0, 100).forEach(order => {
    const flattenedOrder = flattenObject(order, cookieIdMap);
    const cells = allHeaders.map(header => {
      const value = flattenedOrder[header];
      let displayValue = '';

      if (value === null || value === undefined || value === '') {
        displayValue = '-';
      } else if (typeof value === 'boolean') {
        displayValue = value ? 'Yes' : 'No';
      } else if (typeof value === 'number') {
        displayValue = value.toString();
      } else {
        displayValue = escapeHtml(String(value));
      }

      return `<td style="white-space: nowrap;">${displayValue}</td>`;
    });
    html += createTableRow(cells);
  });

  html += endTable();
  if (data.orders.length > 100) {
    html += `<p class="table-hint">Showing first 100 of ${data.orders.length} records</p>`;
  }

  container.innerHTML = html;
}

// Helper function to flatten nested objects for display
function flattenObject(obj, cookieIdMap) {
  const flattened = {};

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;

    const value = obj[key];

    if (key === 'cookies' && Array.isArray(value)) {
      // Flatten cookies array into separate columns
      value.forEach(cookie => {
        const cookieId = cookie.id || cookie.cookieId;
        const cookieName = cookieIdMap[cookieId] || `Cookie ${cookieId}`;
        flattened[cookieName] = cookie.quantity || 0;
      });
    } else if (key === 'actions' && typeof value === 'object' && value !== null) {
      // Flatten actions object
      for (const actionKey in value) {
        flattened[`action_${actionKey}`] = value[actionKey];
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Flatten nested objects (council, troop, cupboard)
      for (const nestedKey in value) {
        flattened[`${key}_${nestedKey}`] = value[nestedKey];
      }
    } else if (Array.isArray(value)) {
      flattened[key] = JSON.stringify(value);
    } else {
      flattened[key] = value;
    }
  }

  return flattened;
}

// Report configuration map
const REPORT_CONFIG = {
  'troop': { button: () => troopSummaryBtn, generator: () => generateTroopSummaryReport() },
  'inventory': { button: () => inventoryReportBtn, generator: () => generateInventoryReport() },
  'summary': { button: () => summaryReportBtn, generator: () => generateSummaryReport() },
  'variety': { button: () => varietyReportBtn, generator: () => generateVarietyReport() },
  'donation-alert': { button: () => donationAlertBtn, generator: () => generateDonationAlertReport() }
};

function generateReport(type) {
  if (!reportContainer) return;

  // Remove active class from all buttons
  Object.values(REPORT_CONFIG).forEach(config => {
    const btn = config.button();
    if (btn) btn.classList.remove('active');
  });

  // Generate report and activate button
  const config = REPORT_CONFIG[type];
  if (config) {
    reportContainer.innerHTML = config.generator();
    const btn = config.button();
    if (btn) btn.classList.add('active');
    reportContainer.classList.add('show');
  }
}

function generateTroopSummaryReport() {
  let html = '<div class="report-visual"><h3>Troop Summary Report</h3>';

  // Calculate troop-wide totals
  let totalOrders = 0;
  let totalSold = 0;
  let totalRevenue = 0;
  let totalInventory = 0;
  let totalDonations = 0;
  let siteOrdersPhysical = 0; // Track booth sales delivered from troop stock
  const troopVarieties = {};
  const inventoryVarieties = {};

  // Count Digital Cookie orders for order count
  digitalCookieData.forEach(row => {
    totalOrders++;

    const lastName = row['Girl Last Name'] || '';
    const isSiteOrder = lastName === 'Site';

    // Track donations from DC data for variety breakdown
    const donations = parseInt(row['Donation']) || 0;
    if (donations > 0) {
      totalDonations += donations;
      troopVarieties['Cookie Share'] = (troopVarieties['Cookie Share'] || 0) + donations;
    }

    // Track physical packages from Site orders (booth sales delivered from troop stock)
    if (isSiteOrder) {
      const totalPkgs = parseInt(row['Total Packages (Includes Donate & Gift)']) || 0;
      const refundedPkgs = parseInt(row['Refunded Packages']) || 0;
      const packages = totalPkgs - refundedPkgs;
      const physicalPackages = packages - donations; // Exclude virtual Cookie Share

      const orderType = row['Order Type'] || '';
      const isShipped = orderType.includes('Shipped') || orderType.includes('shipped');
      const isDonationOnly = orderType === 'Donation';

      // Only count if not shipped (shipped orders don't use troop stock)
      if (!isShipped && !isDonationOnly) {
        siteOrdersPhysical += physicalPackages;
      }
    }

    const cookieTypes = PHYSICAL_COOKIE_TYPES;
    cookieTypes.forEach(type => {
      const count = parseInt(row[type]) || 0;
      if (count > 0) {
        troopVarieties[type] = (troopVarieties[type] || 0) + count;
      }
    });
  });

  // Calculate Total Sold and Revenue from Smart Cookie transfers
  // This matches what Smart Cookie dashboard shows as "Total Sold"
  const c2tTransfers = [];
  const t2gTransfers = [];
  const soldTransfers = []; // Track all sales for reporting
  let totalT2G = 0;
  let totalOrdered = 0; // Total C2T pickups (what was ordered from council)
  const t2gVarieties = {};

  if (reconciler && reconciler.transfers) {


    reconciler.transfers.forEach(transfer => {
      // Match C2T or C2T(P) - Council to Troop transfers (inventory pickups)
      if (transfer.type === 'C2T' || transfer.type === 'C2T(P)' || transfer.type.startsWith('C2T')) {
        c2tTransfers.push(transfer);
        const packages = transfer.packages || 0;
        totalOrdered += packages; // Track total ordered
        totalInventory += packages; // Start with all inventory
        if (transfer.varieties) {
          Object.entries(transfer.varieties).forEach(([variety, count]) => {
            inventoryVarieties[variety] = (inventoryVarieties[variety] || 0) + count;
          });
        }
      }
      // Track T2G - Troop to Girl transfers (inventory allocated to scouts)
      else if (transfer.type === 'T2G') {
        t2gTransfers.push(transfer);

        // Exclude virtual items from physical inventory:
        // 1. Cookie Share (virtual donations)
        // 2. Virtual booth sales (credit only, no physical transfer)
        const isVirtualBooth = transfer.virtualBooth || false;
        const cookieShareCount = transfer.varieties?.['Cookie Share'] || 0;

        if (!isVirtualBooth) {
          const physicalPackages = (transfer.packages || 0) - cookieShareCount;
          totalT2G += physicalPackages;  // Only count physical packages
        }

        // Count T2G as "sold" (matches Smart Cookie dashboard) - includes Cookie Share and booth credits
        totalSold += transfer.packages || 0;
        totalRevenue += transfer.amount || 0;
        soldTransfers.push(transfer);
        if (transfer.varieties) {
          Object.entries(transfer.varieties).forEach(([variety, count]) => {
            // Track all varieties (including Cookie Share for display)
            // but only physical varieties count toward inventory
            t2gVarieties[variety] = (t2gVarieties[variety] || 0) + count;
          });
        }
      }
      // Count other completed sales (but exclude PLANNED orders)
      // Smart Cookie counts: T2G (above), D, DIRECT_SHIP, COOKIE_SHARE
      // Smart Cookie EXCLUDES: C2T (incoming inventory), PLANNED (future orders)
      else if (transfer.type && transfer.packages > 0) {
        const isCtoT = transfer.type === 'C2T' || transfer.type === 'C2T(P)' || transfer.type.startsWith('C2T');
        const isPlanned = transfer.type === 'PLANNED';

        // Count everything except C2T (incoming inventory) and PLANNED (future orders)
        if (!isCtoT && !isPlanned) {
          totalSold += transfer.packages || 0;
          totalRevenue += transfer.amount || 0;
          soldTransfers.push(transfer);
        }
      }
    });

    // Subtract T2G from troop inventory (cookies allocated to scouts)
    // Note: totalT2G already excludes Cookie Share (virtual)
    totalInventory -= totalT2G;
    Object.entries(t2gVarieties).forEach(([variety, count]) => {
      // Don't subtract Cookie Share from physical inventory (it was never there)
      if (variety !== 'Cookie Share') {
        inventoryVarieties[variety] = (inventoryVarieties[variety] || 0) - count;
      }
    });
  }

  // Subtract booth sales (Site orders) delivered directly from troop stock
  // These don't show up as T2G but still reduce troop inventory
  totalInventory -= siteOrdersPhysical;

  // Overall stats - high-level troop summary
  html += createHorizontalStats([
    { label: 'Total Orders', value: totalOrders, description: 'From Digital Cookie', color: '#2196F3' },
    { label: 'Packages Sold', value: totalSold, description: 'From Smart Cookie', color: '#4CAF50' },
    { label: 'Total Revenue', value: `$${Math.round(totalRevenue)}`, description: 'From Smart Cookie', color: '#ff9800' },
    { label: 'Troop Inventory', value: totalInventory, description: 'Packages on hand', color: '#9C27B0' }
  ]);

  // Add info about related reports
  html += '<div style="margin: 20px 0; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196F3;">';
  html += '<p style="margin: 0 0 8px 0; font-size: 0.9em;"><strong>📊 Other Reports:</strong></p>';
  html += '<ul style="margin: 0; padding-left: 20px; font-size: 0.9em;">';
  html += '<li><strong>Scout Summary:</strong> Individual scout performance, order details, and inventory tracking by scout</li>';
  html += '<li><strong>Inventory:</strong> Net troop inventory by variety, C2T pickups (cases & packages), and T2G allocations</li>';
  html += '<li><strong>Cookie Varieties:</strong> Sales breakdown by cookie type with percentages (excludes Cookie Share from %)</li>';
  html += '<li><strong>Virtual Cookie Share:</strong> Cookie Share reconciliation between Digital Cookie and Smart Cookie</li>';
  html += '</ul>';
  html += '</div>';

  html += '</div>';
  return html;
}

function generateInventoryReport() {
  let html = '<div class="report-visual"><h3>Inventory Report</h3>';
  html += '<p style="margin-bottom: 20px; color: #666;">Track inventory from Council to Troop to Scouts</p>';

  // Calculate inventory totals
  let totalOrdered = 0;
  let totalAllocated = 0;
  let netInventory = 0;
  let siteOrdersPhysical = 0; // Track booth sales delivered from troop stock
  const inventoryVarieties = {};
  const c2tTransfers = [];
  const t2gTransfers = [];

  if (reconciler && reconciler.transfers) {
    reconciler.transfers.forEach(transfer => {
      // C2T - Council to Troop transfers (inventory pickups)
      if (transfer.type === 'C2T' || transfer.type === 'C2T(P)' || transfer.type.startsWith('C2T')) {
        c2tTransfers.push(transfer);
        const packages = transfer.packages || 0;
        totalOrdered += packages;
        if (transfer.varieties) {
          Object.entries(transfer.varieties).forEach(([variety, count]) => {
            inventoryVarieties[variety] = (inventoryVarieties[variety] || 0) + count;
          });
        }
      }
      // T2G - Troop to Girl transfers (inventory allocated to scouts)
      else if (transfer.type === 'T2G') {
        t2gTransfers.push(transfer);

        // Exclude virtual items from physical inventory:
        // 1. Cookie Share (virtual donations)
        // 2. Virtual booth sales (credit only, no physical transfer)
        const isVirtualBooth = transfer.virtualBooth || false;
        const cookieShareCount = transfer.varieties?.['Cookie Share'] || 0;

        if (!isVirtualBooth) {
          const physicalPackages = (transfer.packages || 0) - cookieShareCount;
          totalAllocated += physicalPackages;
        }

        if (transfer.varieties) {
          Object.entries(transfer.varieties).forEach(([variety, count]) => {
            // Don't subtract virtual items from physical inventory (they were never there)
            if (variety !== 'Cookie Share' && !isVirtualBooth) {
              inventoryVarieties[variety] = (inventoryVarieties[variety] || 0) - count;
            }
          });
        }
      }
    });
  }

  // Process Digital Cookie data to track site orders (booth sales from troop stock)
  digitalCookieData.forEach(row => {
    const lastName = row['Girl Last Name'] || '';
    const isSiteOrder = lastName === 'Site'; // Booth sales (unallocated troop stock)

    if (isSiteOrder) {
      const totalPkgs = parseInt(row['Total Packages (Includes Donate & Gift)']) || 0;
      const refundedPkgs = parseInt(row['Refunded Packages']) || 0;
      const packages = totalPkgs - refundedPkgs;
      const donations = parseInt(row['Donation']) || 0;
      const physicalPackages = packages - donations;

      const orderType = row['Order Type'] || '';
      const isShipped = orderType.includes('Shipped') || orderType.includes('shipped');
      const isDonationOnly = orderType === 'Donation';

      // Only count if not shipped (shipped orders don't use troop stock)
      if (!isShipped && !isDonationOnly) {
        siteOrdersPhysical += physicalPackages;
      }
    }
  });

  // Calculate net inventory: ordered - allocated - site orders delivered from stock
  netInventory = totalOrdered - totalAllocated - siteOrdersPhysical;

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
      // Calculate cases and remaining packages (12 packages per case)
      const cases = Math.floor(count / 12);
      const remaining = count % 12;
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

    // Sort by date, newest first
    c2tTransfers.sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateB - dateA; // Descending order (newest first)
    });

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

      // Build tooltip for cases breakdown (cases = packages / 12)
      let casesTooltipAttr = '';
      if (transfer.varieties && Object.keys(transfer.varieties).length > 0) {
        const casesList = sortVarietiesByOrder(Object.entries(transfer.varieties))
          .map(([variety, count]) => `${variety}: ${Math.round(count / 12)}`)
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

    // Sort by date, newest first
    t2gTransfers.sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateB - dateA; // Descending order (newest first)
    });

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

function generateSummaryReport() {
  const scoutSummary = {};
  const cookieTypes = PHYSICAL_COOKIE_TYPES;

  digitalCookieData.forEach(row => {
    const name = `${row['Girl First Name'] || ''} ${row['Girl Last Name'] || ''}`.trim();
    const lastName = row['Girl Last Name'] || '';
    const isSiteOrder = lastName === 'Site'; // Booth sales (unallocated troop stock)

    if (!scoutSummary[name]) {
      scoutSummary[name] = {
        orders: 0,
        packages: 0,  // Only packages requiring physical inventory
        totalPackages: 0,  // All packages including shipped
        inventory: 0,  // Track inventory picked up (physical only)
        boothCredits: 0,  // Track virtual booth sales (credit only)
        creditedPackages: 0,  // Track troop-allocated direct ship (credited sales)
        creditedBoothPackages: 0,  // Track booth allocation separately
        creditedDirectShipPackages: 0,  // Track direct ship allocation separately
        shippedPackages: 0,  // Track direct ship orders total
        revenue: 0,
        donations: 0,  // Track Cookie Share donations
        varieties: {},
        inventoryVarieties: {},  // Track inventory by variety
        boothVarieties: {},  // Track booth sales by variety
        creditedVarieties: {},  // Track troop-allocated (combined) by variety
        creditedBoothVarieties: {},  // Track troop girl delivered by variety
        creditedDirectShipVarieties: {},  // Track troop direct ship by variety
        shippedVarieties: {},  // Track direct ship orders by variety
        orderDetails: [],
        isSiteOrder: isSiteOrder  // Flag for booth sales
      };
    }

    scoutSummary[name].orders++;

    // Packages
    const totalPkgs = parseInt(row['Total Packages (Includes Donate & Gift)']) || 0;
    const refundedPkgs = parseInt(row['Refunded Packages']) || 0;
    const packages = totalPkgs - refundedPkgs;

    // Track donations separately (Cookie Share is virtual, not physical inventory)
    const donations = parseInt(row['Donation']) || 0;
    const physicalPackages = packages - donations;

    // Site orders (booth sales from troop stock) go to Booth Sales, not regular Sales
    const orderType = row['Order Type'] || '';
    const isShipped = orderType.includes('Shipped') || orderType.includes('shipped');
    const isDonationOnly = orderType === 'Donation';

    if (isSiteOrder) {
      // Site orders: Track by type to calculate unallocated amounts
      // Type 3: Troop DC Site → Direct Ship (allocated via Direct Ship Divider)
      // Type 4: Troop DC Site → Girl Delivery (allocated via Virtual Booth Divider)

      if (!scoutSummary[name].siteDirectShip) {
        scoutSummary[name].siteDirectShip = 0;
        scoutSummary[name].siteGirlDelivery = 0;
      }

      if (isShipped) {
        // Type 3: Troop direct ship orders
        scoutSummary[name].siteDirectShip += physicalPackages;
      } else if (!isDonationOnly) {
        // Type 4: Troop girl delivery orders
        scoutSummary[name].siteGirlDelivery += physicalPackages;
      }
    } else {
      // Regular scout orders - track in totalPackages
      scoutSummary[name].totalPackages += packages;

      if (!isShipped && !isDonationOnly) {
        // Regular orders require physical inventory
        scoutSummary[name].packages += physicalPackages;
      }
    }

    // Revenue
    const amountStr = row['Current Sale Amount'] || '0';
    const amount = parseFloat(String(amountStr).replace(/[$,]/g, '')) || 0;
    scoutSummary[name].revenue += amount;

    // Track donations in varieties (Cookie Share is always virtual, never physical)
    if (donations > 0) {
      scoutSummary[name].donations += donations;
      if (isSiteOrder) {
        // Site orders - Cookie Share will be tracked via virtual booth allocations
        // Don't track at site level
      } else {
        scoutSummary[name].varieties['Cookie Share'] = (scoutSummary[name].varieties['Cookie Share'] || 0) + donations;
      }
    }

    // Cookie varieties - track shipped separately
    cookieTypes.forEach(type => {
      const count = parseInt(row[type]) || 0;
      if (count > 0) {
        if (isSiteOrder) {
          // Site orders - varieties will be tracked via virtual booth allocations in Credited column
          // Don't track at site level
        } else if (isShipped) {
          // Scout's direct ship orders - track separately (no physical inventory needed)
          scoutSummary[name].shippedVarieties[type] = (scoutSummary[name].shippedVarieties[type] || 0) + count;
          scoutSummary[name].shippedPackages += count;
        } else {
          // Regular orders - need physical inventory
          scoutSummary[name].varieties[type] = (scoutSummary[name].varieties[type] || 0) + count;
        }
      }
    });

    // Build varieties object for this order (only non-zero cookies)
    const orderVarieties = {};
    cookieTypes.forEach(type => {
      const count = parseInt(row[type]) || 0;
      if (count > 0) {
        orderVarieties[type] = count;
      }
    });
    // Add donations if present
    if (donations > 0) {
      orderVarieties['Cookie Share'] = donations;
    }

    // Order details
    scoutSummary[name].orderDetails.push({
      orderNum: row['Order Number'],
      date: row['Order Date (Central Time)'],
      packages: packages,
      amount: amount,
      status: row['Order Status'],
      orderType: orderType,
      paymentStatus: row['Payment Status'] || '',
      needsInventory: !isShipped && !isDonationOnly,
      varieties: orderVarieties
    });
  });

  // Build girlId to scout name mapping from reconciler.scouts
  const girlIdToName = new Map();
  if (reconciler && reconciler.scouts) {
    reconciler.scouts.forEach((scoutData, scoutName) => {
      if (scoutData.scoutId) {
        girlIdToName.set(scoutData.scoutId, scoutName);
      }
    });
  }

  // Add inventory data from T2G transfers
  if (reconciler && reconciler.transfers) {
    reconciler.transfers.forEach(transfer => {
      if (transfer.type === 'T2G') {  // Troop to Girl (inventory pickup)
        const name = transfer.to;  // Scout name
        if (scoutSummary[name]) {
          // Exclude virtual items from physical inventory:
          // 1. Cookie Share (virtual donations)
          // 2. Virtual booth sales (scout gets credit but didn't receive physical packages)
          const isVirtualBooth = transfer.virtualBooth || false;

          if (!isVirtualBooth) {
            // Only count physical transfers toward inventory
            let physicalPackages = transfer.packages || 0;
            const cookieShareCount = transfer.varieties?.['Cookie Share'] || 0;
            physicalPackages -= cookieShareCount;

            scoutSummary[name].inventory += physicalPackages;

            // Track physical inventory varieties (exclude Cookie Share)
            if (transfer.varieties) {
              Object.entries(transfer.varieties).forEach(([variety, count]) => {
                if (variety !== 'Cookie Share') {
                  scoutSummary[name].inventoryVarieties[variety] =
                    (scoutSummary[name].inventoryVarieties[variety] || 0) + count;
                }
              });
            }
          } else {
            // Virtual booth allocations (Type 4: Troop girl delivery) go to Credited column
            const packages = transfer.packages || 0;
            scoutSummary[name].creditedPackages = (scoutSummary[name].creditedPackages || 0) + packages;
            scoutSummary[name].creditedBoothPackages = (scoutSummary[name].creditedBoothPackages || 0) + packages;

            // Track credited varieties by source
            if (!scoutSummary[name].creditedVarieties) {
              scoutSummary[name].creditedVarieties = {};
            }
            if (!scoutSummary[name].creditedBoothVarieties) {
              scoutSummary[name].creditedBoothVarieties = {};
            }
            if (transfer.varieties) {
              Object.entries(transfer.varieties).forEach(([variety, count]) => {
                scoutSummary[name].creditedVarieties[variety] =
                  (scoutSummary[name].creditedVarieties[variety] || 0) + count;
                scoutSummary[name].creditedBoothVarieties[variety] =
                  (scoutSummary[name].creditedBoothVarieties[variety] || 0) + count;
              });
            }
          }
        }
      }
    });
  }

  // Add direct ship allocations from Smart Direct Ship Divider
  // These are Type 3: Troop direct ship orders credited to individual scouts
  if (reconciler && reconciler.directShipAllocations) {
    reconciler.directShipAllocations.forEach(allocation => {
      const scoutName = girlIdToName.get(allocation.girlId);
      if (scoutName && scoutSummary[scoutName]) {
        // Initialize creditedPackages if not present
        if (!scoutSummary[scoutName].creditedPackages) {
          scoutSummary[scoutName].creditedPackages = 0;
        }
        if (!scoutSummary[scoutName].creditedDirectShipPackages) {
          scoutSummary[scoutName].creditedDirectShipPackages = 0;
        }
        if (!scoutSummary[scoutName].creditedVarieties) {
          scoutSummary[scoutName].creditedVarieties = {};
        }
        if (!scoutSummary[scoutName].creditedDirectShipVarieties) {
          scoutSummary[scoutName].creditedDirectShipVarieties = {};
        }

        // Add direct ship allocation to credited packages
        const packages = allocation.packages || 0;
        scoutSummary[scoutName].creditedPackages += packages;
        scoutSummary[scoutName].creditedDirectShipPackages += packages;

        // Track credited varieties by source
        if (allocation.varieties) {
          Object.entries(allocation.varieties).forEach(([variety, count]) => {
            scoutSummary[scoutName].creditedVarieties[variety] =
              (scoutSummary[scoutName].creditedVarieties[variety] || 0) + count;
            scoutSummary[scoutName].creditedDirectShipVarieties[variety] =
              (scoutSummary[scoutName].creditedDirectShipVarieties[variety] || 0) + count;
          });
        }
      }
    });
  }

  // Calculate allocated amounts to show unallocated site orders
  let totalDirectShipAllocated = 0;
  let totalVirtualBoothAllocated = 0;

  if (reconciler && reconciler.directShipAllocations) {
    reconciler.directShipAllocations.forEach(allocation => {
      totalDirectShipAllocated += allocation.packages || 0;
    });
  }

  if (reconciler && reconciler.transfers) {
    reconciler.transfers.forEach(transfer => {
      if (transfer.type === 'T2G' && transfer.virtualBooth) {
        totalVirtualBoothAllocated += (transfer.packages || 0);
      }
    });
  }

  // Update Site row to show only UNALLOCATED packages
  Object.keys(scoutSummary).forEach(name => {
    if (name.endsWith(' Site')) {
      const scout = scoutSummary[name];

      // Calculate unallocated amounts
      const unallocatedDirectShip = (scout.siteDirectShip || 0) - totalDirectShipAllocated;
      const unallocatedGirlDelivery = (scout.siteGirlDelivery || 0) - totalVirtualBoothAllocated;

      // Store for display
      scout.unallocatedDirectShip = Math.max(0, unallocatedDirectShip);
      scout.unallocatedGirlDelivery = Math.max(0, unallocatedGirlDelivery);
      scout.totalUnallocated = scout.unallocatedDirectShip + scout.unallocatedGirlDelivery;

      // Mark as warning if any unallocated
      scout.hasUnallocated = scout.totalUnallocated > 0;
    }
  });

  const sortedScouts = Object.keys(scoutSummary).sort();

  let html = '<div class="report-visual"><h3>Scout Summary Report</h3>';
  html += '<p class="table-hint">💡 Click on any scout to see detailed breakdown. <strong>Sales</strong> = physical packages for in-person delivery. <strong>Booth</strong> = other troop credits. <strong>Credited</strong> = troop booth sales + direct ship allocated to scout. <strong>Shipped</strong> = scout\'s own direct ship orders.</p>';
  html += startTable('table-normal scout-table');
  html += createTableHeader(['Scout', 'Orders', 'Sales', 'Picked Up', 'Inventory', 'Booth', 'Credited', 'Shipped', 'Donations', 'Total Sold', 'Revenue']);

  sortedScouts.forEach((name, idx) => {
    const scout = scoutSummary[name];

    // Calculate net inventory: T2G received - packages needing physical inventory
    const netInventory = (scout.inventory || 0) - scout.packages;

    // Check if any individual cookie variety has negative inventory
    const negativeVarieties = [];
    if (scout.inventoryVarieties && scout.varieties) {
      PHYSICAL_COOKIE_TYPES.forEach(variety => {
        const pickedUp = scout.inventoryVarieties[variety] || 0;
        const sold = scout.varieties[variety] || 0;
        const varietyNet = pickedUp - sold;
        if (varietyNet < 0) {
          negativeVarieties.push(`${variety}: ${varietyNet}`);
        }
      });
    }

    // Build inventory cell with warning if any variety is negative
    let inventoryCell = `${netInventory}`;
    if (negativeVarieties.length > 0) {
      const tooltipText = `Warning: Negative inventory\n${negativeVarieties.join('\n')}`;
      inventoryCell = `<span class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}" style="color: #f44336; font-weight: 600;">${netInventory} ⚠️</span>`;
    }

    // Calculate total credited (booth + troop direct ship)
    const totalCredited = (scout.boothCredits || 0) + (scout.creditedPackages || 0);

    // Special handling for Site row - show unallocated with warning
    const isSiteRow = name.endsWith(' Site');
    let creditedCell = `${scout.creditedPackages || 0}`;

    if (isSiteRow && scout.totalUnallocated > 0) {
      // Show unallocated with warning
      const tooltipText = `UNALLOCATED - Action Required\nDirect Ship: ${scout.unallocatedDirectShip}\nGirl Delivery: ${scout.unallocatedGirlDelivery}\n\nAllocate in Smart Cookie:${scout.unallocatedDirectShip > 0 ? '\n- Troop Direct Ship Orders Divider' : ''}${scout.unallocatedGirlDelivery > 0 ? '\n- Smart Virtual Booth Divider' : ''}`;
      creditedCell = `<span class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}" style="color: #f44336; font-weight: 600;">${scout.totalUnallocated} ⚠️</span>`;
    } else if (!isSiteRow && scout.creditedPackages > 0) {
      // Show source breakdown tooltip for regular scouts
      const sources = [];
      if (scout.creditedBoothPackages > 0) {
        sources.push(`Troop Girl Delivered: ${scout.creditedBoothPackages}`);
      }
      if (scout.creditedDirectShipPackages > 0) {
        sources.push(`Troop Direct Ship: ${scout.creditedDirectShipPackages}`);
      }
      if (sources.length > 0) {
        const tooltipText = sources.join('\n');
        creditedCell = `<span class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}">${scout.creditedPackages}</span>`;
      }
    }

    // Main row (clickable)
    html += `<tr class="scout-row" data-scout-index="${idx}">`;
    html += `<td><span class="expand-icon" style="margin-right: 8px;">▶</span><strong>${escapeHtml(name)}</strong></td>`;
    html += `<td>${scout.orders}</td>`;
    html += `<td>${scout.packages}</td>`;
    html += `<td>${scout.inventory || 0}</td>`;
    html += `<td>${inventoryCell}</td>`;
    html += `<td>${scout.boothCredits || 0}</td>`;
    html += `<td>${creditedCell}</td>`;
    html += `<td>${scout.shippedPackages || 0}</td>`;
    html += `<td>${scout.donations || 0}</td>`;

    // Build tooltip for Total Sold breakdown (Direct vs Credited)
    const totalSold = scout.totalPackages + totalCredited;
    const directSales = scout.packages + (scout.shippedPackages || 0) + (scout.donations || 0);
    const creditedSales = totalCredited;
    const tooltipBreakdown = [
      `Direct: ${directSales}`,
      `Credited: ${creditedSales}`
    ].join('\n');

    html += `<td class="tooltip-cell" data-tooltip="${escapeHtml(tooltipBreakdown)}">${totalSold}</td>`;
    html += `<td>$${Math.round(scout.revenue)}</td>`;
    html += '</tr>';

    // Detail row (expandable)
    html += `<tr class="scout-detail" data-scout-index="${idx}" style="display: none;">`;
    html += '<td colspan="11">';  // Updated to match new column count (11 columns now)
    html += '<div class="scout-breakdown">';

    // Combined Sales vs Inventory breakdown
    html += '<h5>Cookie Breakdown</h5>';
    html += startTable('table-compact');
    html += createTableHeader(['Variety', 'Sales', 'Picked Up', 'Inventory', 'Other', 'Credited', 'Shipped']);

    // Get all varieties including shipped and credited
    const allVarieties = getCompleteVarieties({
      ...scout.varieties,
      ...scout.shippedVarieties,
      ...scout.creditedVarieties
    });

    sortVarietiesByOrder(Object.entries(allVarieties))
      .forEach(([variety, _]) => {
        const pickedUp = (scout.inventoryVarieties && scout.inventoryVarieties[variety]) || 0;
        const sold = (scout.varieties && scout.varieties[variety]) || 0;
        const booth = (scout.boothVarieties && scout.boothVarieties[variety]) || 0;
        const credited = (scout.creditedVarieties && scout.creditedVarieties[variety]) || 0;
        const creditedBooth = (scout.creditedBoothVarieties && scout.creditedBoothVarieties[variety]) || 0;
        const creditedDirectShip = (scout.creditedDirectShipVarieties && scout.creditedDirectShipVarieties[variety]) || 0;
        const shipped = (scout.shippedVarieties && scout.shippedVarieties[variety]) || 0;
        const net = pickedUp - sold;

        // Cookie Share is virtual, show N/A for picked up since it's not physical
        const isCookieShare = variety === 'Cookie Share';
        const pickedUpDisplay = isCookieShare ? '<span style="color: #999;">N/A</span>' : pickedUp;
        const netClass = net < 0 ? 'warning-text' : (net > 0 ? 'success-text' : '');
        const netDisplay = isCookieShare ? '<span style="color: #999;">N/A</span>' : (net === 0 ? '—' : (net > 0 ? `+${net}` : net));

        // Build tooltip for credited breakdown
        let creditedDisplay = credited > 0 ? credited : '—';
        if (credited > 0 && (creditedBooth > 0 || creditedDirectShip > 0)) {
          const sources = [];
          if (creditedBooth > 0) {
            sources.push(`Troop Girl Delivered: ${creditedBooth}`);
          }
          if (creditedDirectShip > 0) {
            sources.push(`Troop Direct Ship: ${creditedDirectShip}`);
          }
          const tooltipText = sources.join('\n');
          creditedDisplay = `<span class="tooltip-cell" data-tooltip="${escapeHtml(tooltipText)}">${credited}</span>`;
        }

        html += `<tr>`;
        html += `<td><strong>${escapeHtml(variety)}</strong></td>`;
        html += `<td>${sold}</td>`;
        html += `<td>${pickedUpDisplay}</td>`;
        html += `<td class="${isCookieShare ? '' : netClass}">${netDisplay}</td>`;
        html += `<td>${booth > 0 ? booth : '—'}</td>`;
        html += `<td>${creditedDisplay}</td>`;
        html += `<td>${shipped > 0 ? shipped : '—'}</td>`;
        html += `</tr>`;
      });
    html += endTable();

    // Individual orders
    html += `<div style="margin-top: 24px;">`;
    html += `<h5>Orders (${scout.orderDetails.length})</h5>`;
    html += `<div style="margin-top: 12px;">`;
    html += startTable('table-compact');
    html += createTableHeader(['Order #', 'Date', 'Packages', 'Amount', 'Type', 'Payment', 'Status']);
    scout.orderDetails.forEach(order => {
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
                             order.paymentStatus === 'CASH' ? 'Cash' :
                             order.paymentStatus || '-';

      // Format order status for display
      const statusText = order.status === 'Status Delivered' ? 'Completed' : order.status;

      // Color code statuses
      let statusStyle = '';
      if (order.status) {
        // Green for completed/delivered/shipped
        const isCompleted = order.status === 'Status Delivered' ||
                            order.status.includes('Completed') ||
                            order.status.includes('Delivered') ||
                            order.status.includes('Shipped');
        // Orange for pending statuses
        const isPending = order.status.includes('Pending') ||
                          order.status.includes('Approved for Delivery');

        if (isCompleted) {
          statusStyle = 'color: #4CAF50;'; // Green
        } else if (isPending) {
          statusStyle = 'color: #ff9800; font-weight: 600;'; // Orange with bold
        }
      }

      html += '<tr>';
      html += `<td>${escapeHtml(String(order.orderNum))}</td>`;
      html += `<td>${escapeHtml(String(order.date))}</td>`;
      html += `<td class="tooltip-cell"${tooltipAttr}>${order.packages}${!order.needsInventory ? ' <span style="color: #999; font-size: 0.85em;">(no inv)</span>' : ''}</td>`;
      html += `<td>$${Math.round(order.amount)}</td>`;
      html += `<td>${escapeHtml(String(order.orderType || '-'))}</td>`;
      html += `<td>${escapeHtml(paymentDisplay)}</td>`;
      html += `<td style="${statusStyle}">${escapeHtml(String(statusText))}</td>`;
      html += '</tr>';
    });
    html += endTable();
    html += '</div></div>';

    html += '</div></td></tr>';
  });

  html += endTable() + '</div>';

  // Add click handlers
  setTimeout(() => {
    // Scout row toggle
    document.querySelectorAll('.scout-row').forEach(row => {
      row.addEventListener('click', function() {
        const index = this.dataset.scoutIndex;
        const detailRow = document.querySelector(`.scout-detail[data-scout-index="${index}"]`);
        const icon = this.querySelector('.expand-icon');

        if (detailRow.style.display === 'none') {
          detailRow.style.display = 'table-row';
          icon.textContent = '▼';
        } else {
          detailRow.style.display = 'none';
          icon.textContent = '▶';
        }
      });
    });

    // Orders section toggle
  }, 0);

  return html;
}

function generateVarietyReport() {
  const cookieTypes = PHYSICAL_COOKIE_TYPES;
  const varietyStats = {};

  cookieTypes.forEach(type => {
    varietyStats[type] = 0;
    digitalCookieData.forEach(row => {
      varietyStats[type] += parseInt(row[type]) || 0;
    });
  });

  // Add Cookie Share donations
  varietyStats['Cookie Share'] = 0;
  digitalCookieData.forEach(row => {
    varietyStats['Cookie Share'] += parseInt(row['Donation']) || 0;
  });

  // Calculate total for percentages (exclude Cookie Share - it's virtual, not a physical cookie type)
  const totalPhysicalPackages = Object.entries(varietyStats)
    .filter(([variety]) => variety !== 'Cookie Share')
    .reduce((sum, [, count]) => sum + count, 0);
  const totalPackages = Object.values(varietyStats).reduce((sum, count) => sum + count, 0);

  let html = '<div class="report-visual"><h3>Cookie Variety Report</h3>';
  html += `<p style="margin-bottom: 15px;">Total: ${totalPackages} packages (${totalPhysicalPackages} physical cookies + ${varietyStats['Cookie Share']} Cookie Share)</p>`;
  html += startTable('table-normal');
  html += createTableHeader(['Variety', 'Packages', '% of Physical Sales']);

  sortVarietiesByOrder(Object.entries(getCompleteVarieties(varietyStats)))
    .forEach(([variety, count]) => {
      // Calculate percentage based on physical cookies only (exclude Cookie Share from denominator)
      const percent = variety === 'Cookie Share'
        ? '—'  // Don't show percentage for Cookie Share
        : totalPhysicalPackages > 0 ? ((count / totalPhysicalPackages) * 100).toFixed(1) + '%' : '0%';

      html += createTableRow([
        `<td><strong>${escapeHtml(variety)}</strong></td>`,
        `<td>${count}</td>`,
        `<td>${percent}</td>`
      ]);
    });

  html += endTable() + '</div>';
  return html;
}

function generateDonationAlertReport() {
  let html = '<div class="report-visual"><h3>Virtual Cookie Share</h3>';

  // Build girlId to scout name mapping from reconciler.scouts
  const girlIdToName = new Map();
  if (reconciler && reconciler.scouts) {
    reconciler.scouts.forEach((scoutData, scoutName) => {
      if (scoutData.scoutId) {
        girlIdToName.set(scoutData.scoutId, scoutName);
      }
    });
  }

  // Calculate total Cookie Share from Digital Cookie
  let totalDCDonations = 0;
  let autoSyncDonations = 0;
  let manualEntryDonations = 0;

  digitalCookieData.forEach(row => {
    const orderType = row['Order Type'] || '';
    const paymentStatus = row['Payment Status'] || '';
    const donations = parseInt(row['Donation']) || 0;

    if (donations > 0) {
      totalDCDonations += donations;

      // Determine if this order auto-syncs or needs manual entry
      // Auto-sync: Shipped orders OR Donation orders paid with credit card (CAPTURED)
      // Manual entry: CASH/CHECK payments OR girl delivery with donation
      const isCreditCard = paymentStatus === 'CAPTURED';
      const isAutoSync = (orderType.includes('Shipped') || orderType === 'Donation') && isCreditCard;

      if (isAutoSync) {
        autoSyncDonations += donations;
      } else {
        // Everything else needs manual entry (CASH payments, girl delivery with donation)
        manualEntryDonations += donations;
      }
    }
  });

  // Calculate total Cookie Share from Smart Cookie
  let totalSCCookieShare = 0;
  let manualCookieShareEntries = 0; // COOKIE_SHARE transfer type (manual adjustments)
  if (reconciler && reconciler.transfers) {
    reconciler.transfers.forEach(transfer => {
      // Look for Cookie Share in transfer varieties
      if (transfer.varieties && transfer.varieties['Cookie Share']) {
        totalSCCookieShare += transfer.varieties['Cookie Share'];
      }

      // Track COOKIE_SHARE transfer type separately (manual entries made in SC)
      if (transfer.type && transfer.type.includes('COOKIE_SHARE')) {
        manualCookieShareEntries += transfer.packages || 0;
      }
    });
  }

  // Calculate adjustment needed: what needs manual entry - what's already entered
  const adjustmentNeeded = manualEntryDonations - manualCookieShareEntries;

  // Reconciliation section at the top
  html += '<h4 style="margin-top: 20px;">📊 Cookie Share Reconciliation</h4>';

  // Determine adjustment display
  let adjustmentDisplay = '';
  let adjustmentColor = '#4CAF50'; // Green for reconciled
  if (adjustmentNeeded > 0) {
    adjustmentDisplay = `+${adjustmentNeeded}`;
    adjustmentColor = '#ff9800'; // Orange for needs more entries
  } else if (adjustmentNeeded < 0) {
    adjustmentDisplay = `${adjustmentNeeded}`;
    adjustmentColor = '#f44336'; // Red for too many entries
  } else {
    adjustmentDisplay = '—';
    adjustmentColor = '#4CAF50'; // Green for reconciled
  }

  html += createHorizontalStats([
    { label: 'DC Total', value: totalDCDonations, description: 'All donations', color: '#2196F3' },
    { label: 'DC Auto-Sync', value: autoSyncDonations, description: 'Credit card', color: '#4CAF50' },
    { label: 'DC Manual Entry', value: manualEntryDonations, description: 'CASH + girl delivery', color: '#ff9800' },
    { label: 'SC Manual Entries', value: manualCookieShareEntries, description: 'COOKIE_SHARE transfers', color: '#9C27B0' },
    { label: 'Adjustment', value: adjustmentDisplay, description: 'Packages to add/remove', color: adjustmentColor }
  ]);

  // Build scout-by-scout breakdown
  const scoutCookieShare = {};

  // Get Cookie Share from Digital Cookie by scout
  digitalCookieData.forEach(row => {
    const scoutName = `${row['Girl First Name'] || ''} ${row['Girl Last Name'] || ''}`.trim();
    const donations = parseInt(row['Donation']) || 0;
    if (donations > 0) {
      if (!scoutCookieShare[scoutName]) {
        scoutCookieShare[scoutName] = { dc: 0, sc: 0 };
      }
      scoutCookieShare[scoutName].dc += donations;
    }
  });

  // Get Cookie Share from Smart Cookie by scout
  if (reconciler && reconciler.transfers) {
    reconciler.transfers.forEach(transfer => {
      if (transfer.varieties && transfer.varieties['Cookie Share']) {
        const scoutName = transfer.to || 'Unknown';
        if (!scoutCookieShare[scoutName]) {
          scoutCookieShare[scoutName] = { dc: 0, sc: 0 };
        }
        scoutCookieShare[scoutName].sc += transfer.varieties['Cookie Share'];
      }
    });
  }

  // Check if manual entries are reconciled
  if (adjustmentNeeded === 0) {
    html += '<div style="padding: 15px; background: #C8E6C9; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2E7D32;">';
    html += '<p style="margin: 0; color: #2E7D32; font-weight: 600;">✓ Manual Entries Reconciled!</p>';
    html += '<p style="margin: 8px 0 0 0; color: #2E7D32; font-size: 0.9em;">All manual Cookie Share donations have been entered in Smart Cookie.</p>';
    html += '</div>';
  } else if (adjustmentNeeded > 0) {
    html += '<div style="padding: 15px; background: #FFE0B2; border-radius: 8px; margin: 15px 0; border-left: 4px solid #F57F17;">';
    html += '<p style="margin: 0; color: #E65100; font-weight: 600;">⚠️ Manual Entry Needed</p>';
    html += `<p style="margin: 8px 0 0 0; color: #E65100; font-size: 0.9em;">You need to add <strong>${adjustmentNeeded}</strong> more Cookie Share packages in Smart Cookie (Orders → Virtual Cookie Share).</p>`;
    html += '</div>';
  } else {
    html += '<div style="padding: 15px; background: #FFCDD2; border-radius: 8px; margin: 15px 0; border-left: 4px solid #C62828;">';
    html += '<p style="margin: 0; color: #C62828; font-weight: 600;">⚠️ Too Many Manual Entries</p>';
    html += `<p style="margin: 8px 0 0 0; color: #C62828; font-size: 0.9em;">Smart Cookie has <strong>${Math.abs(adjustmentNeeded)}</strong> more Cookie Share packages than Digital Cookie. You may need to remove some manual entries.</p>`;
    html += '</div>';
  }

  // Build per-scout manual entry breakdown
  const scoutManualEntries = {};

  digitalCookieData.forEach(row => {
    const scoutName = `${row['Girl First Name'] || ''} ${row['Girl Last Name'] || ''}`.trim();
    const orderType = row['Order Type'] || '';
    const paymentStatus = row['Payment Status'] || '';
    const donations = parseInt(row['Donation']) || 0;

    if (donations > 0) {
      if (!scoutManualEntries[scoutName]) {
        scoutManualEntries[scoutName] = {
          total: 0,
          autoSync: 0,
          manualEntered: 0
        };
      }

      scoutManualEntries[scoutName].total += donations;

      // Auto-sync: Shipped orders OR Donation orders paid with credit card (CAPTURED)
      // Manual entry: CASH/CHECK payments OR girl delivery with donation
      const isCreditCard = paymentStatus === 'CAPTURED';
      const isAutoSync = (orderType.includes('Shipped') || orderType === 'Donation') && isCreditCard;

      if (isAutoSync) {
        scoutManualEntries[scoutName].autoSync += donations;
      }
    }
  });

  // Add Virtual Cookie Share allocations (manual entries already made) per scout
  // Use the detailed per-scout breakdown from Smart Cookie API
  if (reconciler && reconciler.virtualCookieShareAllocations && girlIdToName.size > 0) {
    reconciler.virtualCookieShareAllocations.forEach((quantity, girlId) => {
      const scoutName = girlIdToName.get(girlId);
      if (scoutName) {
        if (!scoutManualEntries[scoutName]) {
          scoutManualEntries[scoutName] = {
            total: 0,
            autoSync: 0,
            manualEntered: 0
          };
        }
        scoutManualEntries[scoutName].manualEntered += quantity;
      }
    });
  }

  // Scout-by-scout manual entry breakdown
  if (Object.keys(scoutManualEntries).length > 0) {
    html += '<h5 style="margin-top: 20px;">📋 Virtual Cookie Share Manual Entry Guide:</h5>';
    html += '<p style="margin-bottom: 10px; font-size: 0.9em; color: #666;">Use this table to adjust Virtual Cookie Share in Smart Cookie (Orders → Virtual Cookie Share).</p>';
    html += startTable('table-normal');
    html += createTableHeader(['Scout', 'DC Total', 'Auto-Sync', 'SC Entered', 'Manual Needed', 'Adjustment']);

    Object.keys(scoutManualEntries).sort().forEach(scoutName => {
      const scout = scoutManualEntries[scoutName];
      const manualNeeded = scout.total - scout.autoSync;
      const adjustment = manualNeeded - scout.manualEntered;

      // Color code the row based on adjustment needed
      let rowClass = '';
      let adjustmentDisplay = adjustment;
      let adjustmentStyle = '';

      if (adjustment > 0) {
        // Need to add more
        rowClass = 'style="background: #fff3cd;"';
        adjustmentDisplay = `+${adjustment}`;
        adjustmentStyle = 'style="color: #ff9800; font-weight: 600;"';
      } else if (adjustment < 0) {
        // Too many entries
        rowClass = 'style="background: #ffcdd2;"';
        adjustmentDisplay = `${adjustment}`;
        adjustmentStyle = 'style="color: #f44336; font-weight: 600;"';
      } else {
        // Reconciled
        adjustmentDisplay = '—';
        adjustmentStyle = 'style="color: #4CAF50; font-weight: 600;"';
      }

      html += createTableRow([
        `<td><strong>${escapeHtml(scoutName)}</strong></td>`,
        `<td>${scout.total}</td>`,
        `<td>${scout.autoSync}</td>`,
        `<td>${scout.manualEntered}</td>`,
        `<td>${manualNeeded}</td>`,
        `<td ${adjustmentStyle}><strong>${adjustmentDisplay}</strong></td>`
      ], rowClass);
    });

    html += endTable();

    html += '<div style="margin-top: 15px; padding: 12px; background: #e3f2fd; border-radius: 8px; font-size: 0.9em;">';
    html += '<p style="margin: 0 0 8px 0;"><strong>💡 How to use this table:</strong></p>';
    html += '<ol style="margin: 0; padding-left: 20px;">';
    html += '<li>Log in to Smart Cookie and go to <strong>Orders → Virtual Cookie Share</strong></li>';
    html += '<li>Edit the COOKIE_SHARE row for each scout based on the "Adjustment" column:</li>';
    html += '<ul style="margin: 5px 0; padding-left: 20px;">';
    html += '<li><strong>+N</strong> (orange): Add N packages to that scout\'s COOKIE_SHARE row</li>';
    html += '<li><strong>-N</strong> (red): Remove N packages from that scout\'s COOKIE_SHARE row</li>';
    html += '<li><strong>—</strong> (green): Already reconciled, no changes needed</li>';
    html += '</ul>';
    html += '<li>Click Save after adjusting each scout\'s packages</li>';
    html += '<li>Refresh this report to verify all adjustments show —</li>';
    html += '</ol>';
    html += '</div>';
  }

  // Filter orders that require manual Virtual Cookie Share entry
  // These are orders with donations that are NOT auto-synced
  const manualEntryOrders = digitalCookieData.filter(row => {
    const orderType = row['Order Type'] || '';
    const donations = parseInt(row['Donation']) || 0;

    // Orders requiring manual entry:
    // 1. "In Person Delivery with Donation" - Girl delivers both cookies AND donations
    // 2. "Cookies in Hand with Donation" - Immediate sale with donations
    //
    // Orders that DON'T need manual entry (auto-sync):
    // - "Shipped with Donation" or "Shipped/Shipped with Donation" - Auto-syncs
    // - "Donation" (only) - Auto-syncs

    const needsManualEntry = donations > 0 &&
                            (orderType === 'In Person Delivery with Donation' ||
                             orderType === 'Cookies in Hand with Donation');

    return needsManualEntry;
  });

  const totalDonations = manualEntryOrders.reduce((sum, row) => {
    return sum + (parseInt(row['Donation']) || 0);
  }, 0);

  // Display action items if there are pending manual entries
  if (manualEntryOrders.length > 0) {
    html += '<div style="padding: 20px; background: #FFF9C4; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F57F17;">';
    html += '<p style="margin: 0; font-weight: 600; color: #F57F17;">⚠️ Action Required</p>';
    html += `<p style="margin: 10px 0 0 0;"><strong>${manualEntryOrders.length}</strong> orders with <strong>${totalDonations}</strong> Cookie Share packages need manual entry in Smart Cookies.</p>`;
    html += '</div>';

    // Explanation section
    html += '<div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">';
    html += '<h4 style="margin: 0 0 10px 0;">📋 What to Do:</h4>';
    html += '<ol style="margin: 0; padding-left: 20px;">';
    html += '<li style="margin-bottom: 8px;">Log in to <strong>Smart Cookies</strong></li>';
    html += '<li style="margin-bottom: 8px;">Navigate to <strong>Orders → Virtual Cookie Share</strong></li>';
    html += '<li style="margin-bottom: 8px;">For each scout listed below, enter their Cookie Share packages</li>';
    html += '<li style="margin-bottom: 0;">Save your entries</li>';
    html += '</ol>';
    html += '<p style="margin: 15px 0 0 0; font-size: 0.9em; color: #666;"><strong>Why?</strong> "Girl Delivery with Donation" orders require manual Virtual Cookie Share entry because the cookies flow automatically but the donations don\'t. This ensures scouts get credit for all packages sold and affects rewards eligibility.</p>';
    html += '</div>';

    // Orders table
    html += '<h4 style="margin-top: 30px;">Orders Requiring Manual Entry:</h4>';
    html += startTable('table-normal');
    html += createTableHeader(['Scout', 'Order #', 'Date', 'Cookie Share Pkgs', 'Order Type']);

    manualEntryOrders.forEach(row => {
      const scoutName = `${row['Girl First Name'] || ''} ${row['Girl Last Name'] || ''}`.trim();
      const orderNum = row['Order Number'] || '-';
      const dateStr = row['Order Date (Central Time)'];
      const date = dateStr ? String(dateStr).substring(0, 10) : '-';
      const donations = parseInt(row['Donation']) || 0;
      const orderType = row['Order Type'] || '';

      html += createTableRow([
        `<td><strong>${escapeHtml(scoutName)}</strong></td>`,
        `<td>${escapeHtml(String(orderNum))}</td>`,
        `<td>${escapeHtml(date)}</td>`,
        `<td><strong>${donations}</strong></td>`,
        `<td>${escapeHtml(orderType)}</td>`
      ]);
    });

    html += endTable();

    // Reference section
    html += '<div style="margin: 20px 0; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196F3;">';
    html += '<h4 style="margin: 0 0 10px 0;">ℹ️ More Information:</h4>';
    html += '<p style="margin: 0; font-size: 0.9em;">These orders are "Girl Delivery with Donation" - customers ordered both physical cookies AND Cookie Share packages for girl delivery. The physical cookies sync automatically, but Cookie Share packages require manual Virtual Cookie Share order entry.</p>';
    html += '<p style="margin: 10px 0 0 0; font-size: 0.9em;"><strong>Note:</strong> "Shipped with Donation" and "Donation Only" orders auto-sync and do not appear in this report.</p>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function enableReportButtons() {
  if (troopSummaryBtn) troopSummaryBtn.disabled = false;
  if (inventoryReportBtn) inventoryReportBtn.disabled = false;
  if (summaryReportBtn) {
    summaryReportBtn.disabled = false;

    // Check if any scout has negative inventory for any variety
    let hasNegativeInventory = false;

    // Build scout summary to check for negative inventory
    const scoutSummary = {};
    digitalCookieData.forEach(row => {
      const name = `${row['Girl First Name'] || ''} ${row['Girl Last Name'] || ''}`.trim();
      if (!scoutSummary[name]) {
        scoutSummary[name] = {
          varieties: {},
          inventoryVarieties: {}
        };
      }

      // Track varieties sold
      PHYSICAL_COOKIE_TYPES.forEach(type => {
        const count = parseInt(row[type]) || 0;
        if (count > 0) {
          scoutSummary[name].varieties[type] = (scoutSummary[name].varieties[type] || 0) + count;
        }
      });
    });

    // Add inventory from T2G transfers
    if (reconciler && reconciler.transfers) {
      reconciler.transfers.forEach(transfer => {
        if (transfer.type === 'T2G') {
          const name = transfer.to;
          if (scoutSummary[name] && transfer.varieties) {
            Object.entries(transfer.varieties).forEach(([variety, count]) => {
              if (variety !== 'Cookie Share' && !transfer.virtualBooth) {
                scoutSummary[name].inventoryVarieties[variety] =
                  (scoutSummary[name].inventoryVarieties[variety] || 0) + count;
              }
            });
          }
        }
      });
    }

    // Check for negative inventory
    Object.values(scoutSummary).forEach(scout => {
      PHYSICAL_COOKIE_TYPES.forEach(variety => {
        const pickedUp = scout.inventoryVarieties[variety] || 0;
        const sold = scout.varieties[variety] || 0;
        if (pickedUp - sold < 0) {
          hasNegativeInventory = true;
        }
      });
    });

    summaryReportBtn.textContent = hasNegativeInventory ? '⚠️ Scout Summary' : 'Scout Summary';
  }

  if (varietyReportBtn) varietyReportBtn.disabled = false;
  if (donationAlertBtn) {
    donationAlertBtn.disabled = false;

    // Check if Cookie Share needs reconciliation and update button text
    let totalDCDonations = 0;
    let totalSCCookieShare = 0;

    digitalCookieData.forEach(row => {
      totalDCDonations += parseInt(row['Donation']) || 0;
    });

    if (reconciler && reconciler.transfers) {
      reconciler.transfers.forEach(transfer => {
        if (transfer.varieties && transfer.varieties['Cookie Share']) {
          totalSCCookieShare += transfer.varieties['Cookie Share'];
        }
      });
    }

    const needsReconciliation = totalDCDonations !== totalSCCookieShare;
    donationAlertBtn.textContent = needsReconciliation ? '⚠️ Virtual Cookie Share' : 'Virtual Cookie Share';
  }

  // Auto-load Troop Summary as the default report
  generateReport('troop');
}

async function checkLoginStatus() {
  try {
    const result = await ipcRenderer.invoke('load-credentials');
    const setupHint = document.getElementById('setupHint');

    if (result.success && result.credentials) {
      const dc = result.credentials.digitalCookie;
      const sc = result.credentials.smartCookie;

      // Check if logins are configured (DC needs username+password, SC needs username+password)
      const dcConfigured = dc.username && dc.password;
      const scConfigured = sc.username && sc.password;

      if (dcConfigured && scConfigured) {
        // Both configured - hide setup hint
        if (setupHint) setupHint.style.display = 'none';
      } else {
        // Not fully configured - show setup hint
        if (setupHint) setupHint.style.display = 'block';
      }
    } else {
      // No credentials at all - show setup hint
      if (setupHint) setupHint.style.display = 'block';
    }
  } catch (error) {
    // Could not check login status
  }
}

function toggleDataView(source) {
  if (source === 'sc') {
    const isHidden = scDataContainer.style.display === 'none';
    if (isHidden) {
      scDataContainer.style.display = 'block';
      scDataIcon.textContent = '▼';
      // Load Smart Cookie data if available
      if (smartCookieData && smartCookieData.orders && smartCookieData.orders.length > 0) {
        displaySmartCookieData(smartCookieData, scDataContainer);
      } else {
        scDataContainer.innerHTML = '<p class="placeholder">No Smart Cookie data. Click "Sync from Websites" to download.</p>';
      }
    } else {
      scDataContainer.style.display = 'none';
      scDataIcon.textContent = '▶';
    }
  } else if (source === 'dc') {
    const isHidden = dcDataContainer.style.display === 'none';
    if (isHidden) {
      dcDataContainer.style.display = 'block';
      dcDataIcon.textContent = '▼';
      // Load Digital Cookie data if available
      if (digitalCookieData && digitalCookieData.length > 0) {
        displayData(digitalCookieData, 'Digital Cookie', dcDataContainer);
      } else {
        dcDataContainer.innerHTML = '<p class="placeholder">No Digital Cookie data. Click "Sync from Websites" to download.</p>';
      }
    } else {
      dcDataContainer.style.display = 'none';
      dcDataIcon.textContent = '▶';
    }
  }
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

// Helper function to update sync status for a data source
function updateSyncStatus(source, result, statusEl, lastSyncEl, timestamp, errors) {
  if (result && result.success) {
    statusEl.textContent = '✓ Synced';
    statusEl.className = 'sync-status synced';
    lastSyncEl.textContent = `Last synced: ${formatFriendlyTimestamp(timestamp)}`;
    return { success: true, message: `${source} downloaded` };
  } else if (result && !result.success) {
    statusEl.textContent = '✗ Failed';
    statusEl.className = 'sync-status error';
    lastSyncEl.textContent = 'Sync failed';
    if (result.error) errors.push(`${source}: ${result.error}`);
    return { success: false };
  }
  return null;
}

function formatFriendlyTimestamp(date) {
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
  if (diffMins < 1) {
    return 'Just now';
  }
  // Under an hour
  else if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  }
  // Today
  else if (isToday) {
    return `Today at ${timeStr}`;
  }
  // Yesterday
  else if (isYesterday) {
    return `Yesterday at ${timeStr}`;
  }
  // This week (2-6 days ago)
  else if (daysDiff < 7) {
    return `${daysDiff} days ago at ${timeStr}`;
  }
  // Older - show full date and time
  else {
    const dateStr = then.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
    return `${dateStr} at ${timeStr}`;
  }
}

// Progress bar helpers
function initializeProgressBar(progressEl, fillEl, textEl, initialText = 'Starting...') {
  progressEl.style.display = 'block';
  fillEl.style.width = '0%';
  textEl.textContent = initialText;
}

function hideProgressBar(progressEl) {
  progressEl.style.display = 'none';
}

function updateProgressBarAndStatus(fillEl, textEl, statusEl, progress, statusPrefix) {
  fillEl.style.width = `${progress.progress}%`;
  textEl.textContent = progress.status.replace(statusPrefix, '').replace('Smart Cookie: ', '');

  if (progress.progress >= 100) {
    statusEl.textContent = '✓ Synced';
    statusEl.className = 'sync-status synced';
  } else {
    statusEl.textContent = 'Syncing...';
    statusEl.className = 'sync-status syncing';
  }
}

function updateScrapeProgress(progress) {
  // Determine which scraper is reporting based on status text
  const isDigitalCookie = progress.status.includes('Digital Cookie');
  const isSmartCookie = progress.status.includes('Smart Cookie');

  if (isDigitalCookie) {
    const dcStatus = document.getElementById('dcStatus');
    updateProgressBarAndStatus(dcProgressFill, dcProgressText, dcStatus, progress, 'Digital Cookie: ');
  }

  if (isSmartCookie) {
    const scStatus = document.getElementById('scStatus');
    updateProgressBarAndStatus(scProgressFill, scProgressText, scStatus, progress, 'Smart Cookie API: ');
  }
}

function showStatus(message, type) {
  importStatus.textContent = message;
  importStatus.className = `status-message ${type}`;

  if (type === 'success') {
    setTimeout(() => {
      importStatus.style.display = 'none';
    }, 5000);
  }
}

// Initialize Tippy.js tooltips for dynamically created elements
function initializeTooltips() {
  const tooltipElements = document.querySelectorAll('.tooltip-cell[data-tooltip]');
  tooltipElements.forEach(element => {
    // Skip if already initialized
    if (element._tippy) return;

    tippy(element, {
      content: element.getAttribute('data-tooltip'),
      allowHTML: false,
      interactive: true, // Allow hovering over tooltip to select text
      delay: [100, 0], // 100ms delay before showing, 0ms before hiding
      placement: 'top',
      arrow: false,
      theme: 'dark',
      maxWidth: 'none', // Allow tooltip to expand to content width
      popperOptions: {
        modifiers: [
          {
            name: 'preventOverflow',
            options: {
              boundary: 'viewport',
            },
          },
        ],
      },
    });
  });
}

// Call initializeTooltips whenever report container changes
// reportContainer is already declared at the top of the file
if (reportContainer) {
  const observer = new MutationObserver(() => {
    initializeTooltips();
  });
  observer.observe(reportContainer, { childList: true, subtree: true });
}

// Auto-update notification handlers
ipcRenderer.on('update-available', (event, info) => {
  const response = confirm(
    `A new version (${info.version}) is available!\n\n` +
    'Would you like to download it now? The app will install the update when you restart.'
  );

  if (response) {
    showStatus('Downloading update...', 'info');
    ipcRenderer.invoke('download-update');
  }
});

ipcRenderer.on('update-downloaded', () => {
  const response = confirm(
    'Update downloaded successfully!\n\n' +
    'Click OK to restart the app and install the update now, or Cancel to install on next restart.'
  );

  if (response) {
    ipcRenderer.invoke('install-update');
  } else {
    showStatus('Update will be installed on next restart', 'success');
  }
});
