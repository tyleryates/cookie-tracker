const { ipcRenderer } = require('electron');
const XLSX = require('xlsx');
const DataReconciler = require('./data-reconciler.js');
const { COOKIE_ORDER, PHYSICAL_COOKIE_TYPES } = require('./cookie-constants.js');
const { PACKAGES_PER_CASE, ORDER_TYPES, DISPLAY_STRINGS } = require('./constants');
const {
  sortVarietiesByOrder,
  getCompleteVarieties,
  DateFormatter,
  formatDate,
  createHorizontalStats,
  escapeHtml,
  startTable,
  createTableHeader,
  createTableRow,
  endTable,
  formatCurrency,
  formatNumber
} = require('./renderer/html-builder.js');

// Report generators
const { generateTroopSummaryReport } = require('./renderer/reports/troop-summary.js');
const { generateInventoryReport } = require('./renderer/reports/inventory.js');
const { generateSummaryReport } = require('./renderer/reports/scout-summary.js');
const { generateVarietyReport } = require('./renderer/reports/variety.js');
const { generateDonationAlertReport } = require('./renderer/reports/donation-alert.js');

// UI Controller
const {
  updateSourceStatus,
  showStatus: showStatusUI,
  checkLoginStatus,
  setupReportObserver,
  setupEventListeners
} = require('./renderer/ui-controller.js');

// Global data
let digitalCookieData = [];
let smartCookieData = null;
let reconciler = new DataReconciler();

// DOM elements
const configureLoginsBtn = document.getElementById('configureLoginsBtn');
const refreshFromWebBtn = document.getElementById('refreshFromWebBtn');
const importStatus = document.getElementById('importStatus');
const reportContainer = document.getElementById('reportContainer');
const dcStatus = document.getElementById('dcStatus');
const scStatus = document.getElementById('scStatus');
const dcLastSync = document.getElementById('dcLastSync');
const scLastSync = document.getElementById('scLastSync');
const troopSummaryBtn = document.getElementById('troopSummaryBtn');
const inventoryReportBtn = document.getElementById('inventoryReportBtn');
const summaryReportBtn = document.getElementById('summaryReportBtn');
const varietyReportBtn = document.getElementById('varietyReportBtn');
const donationAlertBtn = document.getElementById('donationAlertBtn');
const viewUnifiedDataBtn = document.getElementById('viewUnifiedDataBtn');

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

// ============================================================================
// INITIALIZATION
// ============================================================================

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

// Setup event listeners and observers
setupEventListeners(
  configureLoginsBtn, refreshFromWebBtn,
  troopSummaryBtn, inventoryReportBtn, summaryReportBtn, varietyReportBtn, donationAlertBtn, viewUnifiedDataBtn,
  loginModal, closeModal, cancelModal, saveCredentials,
  dcUsername, dcPassword, dcRole, scUsername, scPassword,
  dcProgress, dcProgressFill, dcProgressText,
  scProgress, scProgressFill, scProgressText,
  dcStatus, scStatus, dcLastSync, scLastSync,
  importStatus, reportContainer,
  generateReport, exportUnifiedDataset, loadDataFromDisk, checkLoginStatus
);
setupReportObserver(reportContainer);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Wrapper to simplify showStatus calls
function showStatus(message, type) {
  showStatusUI(importStatus, message, type);
}

// ============================================================================
// DATA LOADING
// ============================================================================

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
        loadedSC = true;

        // Update sync status
        updateSourceStatus(scStatus, scLastSync, file.name, 'SC-', '.json', updateTimestamps);
      }
    }

    // Load most recent Digital Cookie file
    if (dcFiles.length > 0) {
      const file = dcFiles[0];
      const parsedData = parseExcel(file.data);

      if (isDigitalCookieFormat(parsedData)) {
        reconciler.importDigitalCookie(parsedData);
        digitalCookieData = parsedData;
        loadedDC = true;

        // Update sync status
        updateSourceStatus(dcStatus, dcLastSync, file.name, 'DC-', '.xlsx', updateTimestamps);
      }
    }

    // Build unified dataset after all imports complete
    if (loadedSC || loadedDC) {
      console.log('Building unified dataset...');
      reconciler.buildUnifiedDataset();
      console.log('✓ Unified dataset ready:', {
        scouts: reconciler.unified.scouts.size,
        siteOrders: reconciler.unified.siteOrders
      });

      // Auto-save unified dataset to disk for debugging
      await saveUnifiedDatasetToDisk();

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

// ============================================================================
// REPORT GENERATION
// ============================================================================

// Report configuration map
const REPORT_CONFIG = {
  'troop': { button: () => troopSummaryBtn, generator: () => generateTroopSummaryReport(reconciler) },
  'inventory': { button: () => inventoryReportBtn, generator: () => generateInventoryReport(reconciler) },
  'summary': { button: () => summaryReportBtn, generator: () => generateSummaryReport(reconciler) },
  'variety': { button: () => varietyReportBtn, generator: () => generateVarietyReport(reconciler) },
  'donation-alert': { button: () => donationAlertBtn, generator: () => generateDonationAlertReport(reconciler) }
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

function enableReportButtons() {
  if (troopSummaryBtn) troopSummaryBtn.disabled = false;
  if (inventoryReportBtn) inventoryReportBtn.disabled = false;
  if (viewUnifiedDataBtn) viewUnifiedDataBtn.disabled = false;

  if (summaryReportBtn) {
    summaryReportBtn.disabled = false;

    // Check if any scout has negative inventory using pre-calculated data
    const hasNegativeInventory = reconciler.unified?.troopTotals?.scouts?.withNegativeInventory > 0;
    summaryReportBtn.textContent = hasNegativeInventory ? '⚠️ Scout Summary' : 'Scout Summary';
  }

  if (varietyReportBtn) varietyReportBtn.disabled = false;

  if (donationAlertBtn) {
    donationAlertBtn.disabled = false;

    // Check if Cookie Share needs reconciliation using pre-calculated data
    const needsReconciliation = !reconciler.unified?.cookieShare?.reconciled;
    donationAlertBtn.textContent = needsReconciliation ? '⚠️ Virtual Cookie Share' : 'Virtual Cookie Share';
  }

  // Auto-load Troop Summary as the default report
  generateReport('troop');
}

// ============================================================================
// DATA EXPORT
// ============================================================================

function exportUnifiedDataset() {
  if (!reconciler.unified) {
    alert('No unified dataset available to export.');
    return;
  }

  // Convert Map to plain object for JSON serialization
  const exportData = serializeUnifiedDataset();

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().split('T')[0];
  a.download = `unified-dataset-${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function serializeUnifiedDataset() {
  return {
    scouts: Array.from(reconciler.unified.scouts.entries()).map(([name, scout]) => ({
      name,
      ...scout
    })),
    siteOrders: reconciler.unified.siteOrders,
    troopTotals: reconciler.unified.troopTotals,
    transferBreakdowns: reconciler.unified.transferBreakdowns,
    varieties: reconciler.unified.varieties,
    cookieShare: reconciler.unified.cookieShare,
    metadata: reconciler.unified.metadata
  };
}

async function saveUnifiedDatasetToDisk() {
  if (!reconciler.unified) {
    console.log('No unified dataset to save');
    return;
  }

  try {
    const exportData = serializeUnifiedDataset();
    const jsonStr = JSON.stringify(exportData, null, 2);

    // Create timestamped filename
    const timestamp = DateFormatter.toTimestamp();
    const filename = `unified-${timestamp}.json`;

    // Save to disk using IPC
    const result = await ipcRenderer.invoke('save-file', {
      filename: filename,
      content: jsonStr,
      type: 'unified'
    });

    if (result.success) {
      console.log(`✓ Unified dataset saved: ${filename}`);
    } else {
      console.error('Failed to save unified dataset:', result.error);
    }
  } catch (error) {
    console.error('Error saving unified dataset:', error);
  }
}
