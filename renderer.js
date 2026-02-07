const { ipcRenderer } = require('electron');
const XLSX = require('xlsx');
const DataReconciler = require('./data-reconciler.js');
const { DateFormatter } = require('./renderer/html-builder.js');
const { DC_COLUMNS } = require('./constants');

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
  setupEventListeners,
  handleRefreshFromWeb
} = require('./renderer/ui-controller.js');

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

  // Initialize auto-sync toggle and start if enabled
  initializeAutoSyncToggle();
});

// ============================================================================
// AUTO-SYNC FUNCTIONALITY
// ============================================================================

const AUTO_SYNC_STORAGE_KEY = 'autoSyncEnabled';
const AUTO_SYNC_INTERVAL_MS = 3600000; // 1 hour

let autoSyncInterval = null;
let autoSyncEnabled = true; // Default to enabled

function initializeAutoSyncToggle() {
  const toggle = document.getElementById('autoSyncToggle');

  // Load saved preference from localStorage (defaults to true)
  const savedPreference = localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
  autoSyncEnabled = savedPreference === null ? true : savedPreference === 'true';

  // Set toggle to match saved preference
  toggle.checked = autoSyncEnabled;

  // Start auto-sync if enabled
  if (autoSyncEnabled) {
    startAutoSync();
  }

  // Listen for toggle changes
  toggle.addEventListener('change', (e) => {
    autoSyncEnabled = e.target.checked;

    // Save preference to localStorage
    localStorage.setItem(AUTO_SYNC_STORAGE_KEY, autoSyncEnabled.toString());

    // Start or stop auto-sync based on toggle
    if (autoSyncEnabled) {
      startAutoSync();
      showStatus('Auto-sync enabled (syncs every hour)', 'success');
    } else {
      stopAutoSync();
      showStatus('Auto-sync disabled', 'success');
    }
  });
}

function startAutoSync() {
  // Clear any existing interval
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
  }

  // Auto-sync every hour
  autoSyncInterval = setInterval(async () => {
    // Double-check that auto-sync is still enabled
    if (!autoSyncEnabled) {
      stopAutoSync();
      return;
    }

    console.log('Auto-sync: Starting hourly sync...');
    try {
      await handleRefreshFromWeb(
        refreshFromWebBtn,
        dcProgress, dcProgressFill, dcProgressText,
        scProgress, scProgressFill, scProgressText,
        dcStatus, scStatus, dcLastSync, scLastSync,
        showStatus,
        (source, result, statusEl, lastSyncEl, timestamp, errors) => {
          // Use the updateSyncStatus function from ui-controller
          const { updateSyncStatus } = require('./renderer/ui-controller.js');
          return updateSyncStatus(source, result, statusEl, lastSyncEl, timestamp, errors);
        },
        loadDataFromDisk
      );
      console.log('Auto-sync: Completed successfully');
    } catch (error) {
      console.error('Auto-sync error:', error);
    }
  }, AUTO_SYNC_INTERVAL_MS);

  console.log('Auto-sync: Started (syncs every hour)');
}

function stopAutoSync() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
    console.log('Auto-sync: Stopped');
  }
}

// Stop auto-sync on window unload
window.addEventListener('beforeunload', stopAutoSync);

// ============================================================================
// EVENT LISTENER SETUP
// ============================================================================

// Setup event listeners and observers
setupEventListeners({
  buttons: {
    configureLoginsBtn,
    refreshFromWebBtn,
    troopSummaryBtn,
    inventoryReportBtn,
    summaryReportBtn,
    varietyReportBtn,
    donationAlertBtn,
    viewUnifiedDataBtn
  },
  modal: {
    loginModal,
    closeModal,
    cancelModal,
    saveCredentials
  },
  fields: {
    dcUsername,
    dcPassword,
    dcRole,
    scUsername,
    scPassword
  },
  progress: {
    dcProgress,
    dcProgressFill,
    dcProgressText,
    scProgress,
    scProgressFill,
    scProgressText
  },
  status: {
    dcStatus,
    scStatus,
    dcLastSync,
    scLastSync,
    importStatus
  },
  reportContainer,
  actions: {
    generateReport,
    exportUnifiedDataset,
    loadDataFromDisk,
    checkLoginStatus
  }
});
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
    const scReportFiles = result.files.filter(f => f.extension === '.xlsx' && f.name.includes('ReportExport'));
    const scTransferFiles = result.files.filter(f => f.extension === '.xlsx' && f.name.includes('CookieOrders'));

    scFiles.sort((a, b) => b.name.localeCompare(a.name));
    dcFiles.sort((a, b) => b.name.localeCompare(a.name));
    scReportFiles.sort((a, b) => b.name.localeCompare(a.name));
    scTransferFiles.sort((a, b) => b.name.localeCompare(a.name));

    let loadedSC = false;
    let loadedDC = false;
    let loadedSCReport = false;
    let loadedSCTransfer = false;
    const loadIssues = [];

    // Load most recent Smart Cookie file
    if (scFiles.length > 0) {
      const file = scFiles[0];
      const jsonData = file.data;

      if (isSmartCookieAPIFormat(jsonData)) {
        reconciler.importSmartCookieAPI(jsonData);
        loadedSC = true;

        // Update sync status
        updateSourceStatus(scStatus, scLastSync, file.name, 'SC-', '.json', updateTimestamps);
      } else {
        loadIssues.push(`Smart Cookie JSON not recognized: ${file.name}`);
      }
    }

    // Load most recent Digital Cookie file
    if (dcFiles.length > 0) {
      const file = dcFiles[0];
      const parsedData = parseExcel(file.data);

      if (isDigitalCookieFormat(parsedData)) {
        reconciler.importDigitalCookie(parsedData);
        loadedDC = true;

        // Update sync status
        updateSourceStatus(dcStatus, dcLastSync, file.name, 'DC-', '.xlsx', updateTimestamps);
      } else {
        loadIssues.push(`Digital Cookie XLSX not recognized: ${file.name}`);
      }
    }

    // Load most recent Smart Cookie Report (ReportExport.xlsx)
    if (scReportFiles.length > 0) {
      const file = scReportFiles[0];
      const parsedData = parseExcel(file.data);
      if (parsedData && parsedData.length > 0) {
        reconciler.importSmartCookieReport(parsedData);
        loadedSCReport = true;
      } else {
        loadIssues.push(`Smart Cookie Report empty/unreadable: ${file.name}`);
      }
    }

    // Load most recent Smart Cookie Transfers (CookieOrders.xlsx) only if no SC API data
    if (!loadedSC && scTransferFiles.length > 0) {
      const file = scTransferFiles[0];
      const parsedData = parseExcel(file.data);
      if (parsedData && parsedData.length > 0) {
        reconciler.importSmartCookie(parsedData);
        loadedSCTransfer = true;
      } else {
        loadIssues.push(`Smart Cookie Transfer empty/unreadable: ${file.name}`);
      }
    } else if (loadedSC && scTransferFiles.length > 0) {
      const warning = {
        type: 'SC_TRANSFER_SKIPPED',
        reason: 'SC API data present',
        file: scTransferFiles[0].name
      };
      reconciler.metadata.warnings.push(warning);
      console.warn('Skipping CookieOrders.xlsx import because SC API data is present.');
    }

    // Build unified dataset after all imports complete
    if (loadedSC || loadedDC || loadedSCReport || loadedSCTransfer) {
      console.log('Building unified dataset...');
      reconciler.buildUnifiedDataset();
      if (reconciler.unified?.metadata?.healthChecks?.warningsCount > 0) {
        console.warn('Health check warnings:', reconciler.unified.metadata.warnings);
      }
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

    if (loadIssues.length > 0 && showMessages) {
      showStatus(`No reports loaded. ${loadIssues.join(' | ')}`, 'warning');
      renderHealthBanner({
        level: 'warning',
        title: 'No Reports Loaded',
        message: 'Files were found but could not be parsed. See details below.',
        details: loadIssues.map(msg => ({ type: 'LOAD_ISSUE', message: msg }))
      });
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
  fixWorksheetRange(firstSheet);
  return XLSX.utils.sheet_to_json(firstSheet, { raw: false });
}

function fixWorksheetRange(worksheet) {
  if (!worksheet) return;
  const keys = Object.keys(worksheet).filter(k => !k.startsWith('!'));
  if (keys.length === 0) return;

  let maxRow = 0;
  let maxCol = 0;

  keys.forEach(key => {
    const match = key.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    const [, colLetters, rowStr] = match;
    const row = parseInt(rowStr, 10);
    const col = XLSX.utils.decode_col(colLetters);
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
  });

  if (maxRow > 0) {
    const range = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow - 1, c: maxCol } });
    worksheet['!ref'] = range;
  }
}

function isDigitalCookieFormat(data) {
  if (!data || data.length === 0) return false;
  const headers = Object.keys(data[0]);
  return headers.includes(DC_COLUMNS.GIRL_FIRST_NAME) && headers.includes(DC_COLUMNS.ORDER_NUMBER);
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

  const unknownTypes = reconciler.unified?.metadata?.healthChecks?.unknownOrderTypes || 0;
  if (unknownTypes > 0) {
    renderHealthBanner({
      level: 'error',
      title: 'Blocked: Unknown Order Types Detected',
      message: `Found ${unknownTypes} unknown Digital Cookie order type(s). Update classification rules before viewing reports.`,
      details: reconciler.unified?.metadata?.warnings || []
    });
    return;
  }

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
  const unknownTypes = reconciler.unified?.metadata?.healthChecks?.unknownOrderTypes || 0;
  if (unknownTypes > 0) {
    // Hard fail: block reports if unknown order types are present
    if (troopSummaryBtn) troopSummaryBtn.disabled = true;
    if (inventoryReportBtn) inventoryReportBtn.disabled = true;
    if (viewUnifiedDataBtn) viewUnifiedDataBtn.disabled = false;
    if (summaryReportBtn) summaryReportBtn.disabled = true;
    if (varietyReportBtn) varietyReportBtn.disabled = true;
    if (donationAlertBtn) donationAlertBtn.disabled = true;

    renderHealthBanner({
      level: 'error',
      title: 'Blocked: Unknown Order Types Detected',
      message: `Found ${unknownTypes} unknown Digital Cookie order type(s). Update classification rules before viewing reports.`,
      details: reconciler.unified?.metadata?.warnings || []
    });
    return;
  }

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

// ============================================================================
// HEALTH CHECK UI
// ============================================================================

function renderHealthBanner({ level, title, message, details = [] }) {
  if (!reportContainer) return;
  const bannerStyle = level === 'error'
    ? 'background:#FFEBEE;border-left:4px solid #C62828;color:#B71C1C;'
    : 'background:#FFF8E1;border-left:4px solid #F57F17;color:#E65100;';

  const detailList = details.length
    ? `<pre style="margin:10px 0 0;white-space:pre-wrap;">${JSON.stringify(details.slice(0, 20), null, 2)}</pre>
       ${details.length > 20 ? `<p style="margin:8px 0 0;">…and ${details.length - 20} more</p>` : ''}`
    : '';

  reportContainer.innerHTML = `
    <div class="report-visual">
      <div style="padding:15px;border-radius:8px;${bannerStyle}">
        <strong>${title}</strong>
        <p style="margin:8px 0 0;">${message}</p>
        ${detailList}
      </div>
    </div>
  `;
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
