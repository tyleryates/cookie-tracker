import { ipcRenderer } from 'electron';
import XLSX from 'xlsx';
import * as packageJson from '../package.json';
import { DC_COLUMNS } from './constants';
import { normalizeBoothLocation } from './data-processing/data-importers';
import DataReconciler from './data-reconciler';
import Logger from './logger';
import { DateFormatter } from './renderer/html-builder';
import { generateBoothReport } from './renderer/reports/booth';
import { generateDonationAlertReport } from './renderer/reports/donation-alert';
import { generateInventoryReport } from './renderer/reports/inventory';
import { generateSummaryReport } from './renderer/reports/scout-summary';
import { generateTroopSummaryReport } from './renderer/reports/troop-summary';
import { generateVarietyReport } from './renderer/reports/variety';
import type { RefreshFromWebOptions } from './renderer/ui-controller';
import {
  checkLoginStatus,
  handleRefreshFromWeb,
  setupEventListeners,
  setupReportObserver,
  showStatus as showStatusUI,
  updateSourceStatus,
  updateSyncStatus
} from './renderer/ui-controller';
import type { BoothReservationImported, DataFileInfo } from './types';

let reconciler = new DataReconciler();

const dom = {
  buttons: {
    configureLoginsBtn: document.getElementById('configureLoginsBtn'),
    refreshFromWebBtn: document.getElementById('refreshFromWebBtn'),
    troopSummaryBtn: document.getElementById('troopSummaryBtn'),
    inventoryReportBtn: document.getElementById('inventoryReportBtn'),
    summaryReportBtn: document.getElementById('summaryReportBtn'),
    varietyReportBtn: document.getElementById('varietyReportBtn'),
    donationAlertBtn: document.getElementById('donationAlertBtn'),
    boothReportBtn: document.getElementById('boothReportBtn'),
    recalculateBtn: document.getElementById('recalculateBtn'),
    viewUnifiedDataBtn: document.getElementById('viewUnifiedDataBtn')
  },
  modal: {
    loginModal: document.getElementById('loginModal'),
    closeModal: document.getElementById('closeModal'),
    cancelModal: document.getElementById('cancelModal'),
    saveCredentials: document.getElementById('saveCredentials')
  },
  fields: {
    dcUsername: document.getElementById('dcUsername'),
    dcPassword: document.getElementById('dcPassword'),
    dcRole: document.getElementById('dcRole'),
    scUsername: document.getElementById('scUsername'),
    scPassword: document.getElementById('scPassword')
  },
  progress: {
    dcProgress: document.getElementById('dcProgress'),
    dcProgressFill: document.getElementById('dcProgressFill'),
    dcProgressText: document.getElementById('dcProgressText'),
    scProgress: document.getElementById('scProgress'),
    scProgressFill: document.getElementById('scProgressFill'),
    scProgressText: document.getElementById('scProgressText')
  },
  status: {
    dcStatus: document.getElementById('dcStatus'),
    scStatus: document.getElementById('scStatus'),
    dcLastSync: document.getElementById('dcLastSync'),
    scLastSync: document.getElementById('scLastSync'),
    importStatus: document.getElementById('importStatus')
  },
  reportContainer: document.getElementById('reportContainer')
};

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const versionEl = document.getElementById('appVersion');
    if (versionEl && packageJson.version) {
      versionEl.textContent = `v${packageJson.version}`;
    }
  } catch (err) {
    Logger.error('Failed to load version:', err);
  }

  await loadDataFromDisk(false);
  await checkLoginStatus();

  initializeAutoSyncToggle();
});

// ============================================================================
// AUTO-SYNC FUNCTIONALITY
// ============================================================================

const AUTO_SYNC_STORAGE_KEY = 'autoSyncEnabled';
const AUTO_SYNC_INTERVAL_MS = 3600000; // 1 hour

let autoSyncInterval: ReturnType<typeof setInterval> | null = null;
let autoSyncEnabled = true; // Default to enabled

function initializeAutoSyncToggle(): void {
  const toggle = document.getElementById('autoSyncToggle') as HTMLInputElement;

  const savedPreference = localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
  autoSyncEnabled = savedPreference === null ? true : savedPreference === 'true';

  if (toggle) toggle.checked = autoSyncEnabled;

  if (autoSyncEnabled) {
    startAutoSync();
  }

  toggle.addEventListener('change', (e: Event) => {
    autoSyncEnabled = (e.target as HTMLInputElement).checked;

    localStorage.setItem(AUTO_SYNC_STORAGE_KEY, autoSyncEnabled.toString());

    if (autoSyncEnabled) {
      startAutoSync();
      showStatus('Auto-sync enabled (syncs every hour)', 'success');
    } else {
      stopAutoSync();
      showStatus('Auto-sync disabled', 'success');
    }
  });
}

function triggerSync(): Promise<void> {
  const opts: RefreshFromWebOptions = {
    refreshFromWebBtn: dom.buttons.refreshFromWebBtn,
    dcProgress: dom.progress.dcProgress,
    dcProgressFill: dom.progress.dcProgressFill,
    dcProgressText: dom.progress.dcProgressText,
    scProgress: dom.progress.scProgress,
    scProgressFill: dom.progress.scProgressFill,
    scProgressText: dom.progress.scProgressText,
    dcStatusEl: dom.status.dcStatus,
    scStatusEl: dom.status.scStatus,
    dcLastSync: dom.status.dcLastSync,
    scLastSync: dom.status.scLastSync,
    showStatus,
    updateSyncStatus,
    loadDataFromDisk
  };
  return handleRefreshFromWeb(opts);
}

function startAutoSync(): void {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
  }

  autoSyncInterval = setInterval(async () => {
    if (!autoSyncEnabled) {
      stopAutoSync();
      return;
    }

    Logger.debug('Auto-sync: Starting hourly sync...');
    try {
      await triggerSync();
      Logger.debug('Auto-sync: Completed successfully');
    } catch (error) {
      Logger.error('Auto-sync error:', error);
    }
  }, AUTO_SYNC_INTERVAL_MS);

  Logger.debug('Auto-sync: Started (syncs every hour)');
}

function stopAutoSync(): void {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
    Logger.debug('Auto-sync: Stopped');
  }
}

window.addEventListener('beforeunload', stopAutoSync);

// ============================================================================
// EVENT LISTENER SETUP
// ============================================================================

setupEventListeners({
  buttons: dom.buttons,
  modal: dom.modal,
  fields: dom.fields,
  progress: dom.progress,
  status: dom.status,
  reportContainer: dom.reportContainer,
  actions: {
    generateReport,
    exportUnifiedDataset,
    loadDataFromDisk,
    checkLoginStatus
  }
});
setupReportObserver(dom.reportContainer);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function showStatus(message: string, type: string): void {
  showStatusUI(dom.status.importStatus, message, type);
}

function findLatestFile(files: DataFileInfo[], prefix: string, extension: string, nameIncludes?: string): DataFileInfo | null {
  const filtered = files.filter((f: DataFileInfo) => {
    if (f.extension !== extension) return false;
    if (nameIncludes) return f.name.includes(nameIncludes);
    return f.name.startsWith(prefix);
  });
  filtered.sort((a: DataFileInfo, b: DataFileInfo) => b.name.localeCompare(a.name));
  return filtered.length > 0 ? filtered[0] : null;
}

function setButtonDisabled(btn: HTMLElement | null, disabled: boolean): void {
  if (btn) (btn as HTMLButtonElement).disabled = disabled;
}

// ============================================================================
// DATA LOADING
// ============================================================================

type FileLoadResult = { loaded: boolean; issue?: string };

function loadJsonFile(file: DataFileInfo, rec: DataReconciler): FileLoadResult {
  const jsonData = file.data;
  if (isSmartCookieAPIFormat(jsonData)) {
    rec.importSmartCookieAPI(jsonData);
    return { loaded: true };
  }
  return { loaded: false, issue: `Smart Cookie JSON not recognized: ${file.name}` };
}

function loadExcelFile(
  file: DataFileInfo,
  validator: (data: Record<string, any>[]) => boolean,
  importer: (data: Record<string, any>[]) => void,
  errorLabel: string
): FileLoadResult {
  const parsedData = parseExcel(file.data);
  if (validator(parsedData)) {
    importer(parsedData);
    return { loaded: true };
  }
  return { loaded: false, issue: `${errorLabel}: ${file.name}` };
}

async function loadDataFromDisk(showMessages: boolean = true, updateTimestamps: boolean = true): Promise<boolean> {
  try {
    if (showMessages) {
      showStatus('Loading data...', 'success');
    }

    reconciler = new DataReconciler();

    const result = await ipcRenderer.invoke('scan-in-directory');

    if (!result.success || !result.files || result.files.length === 0) {
      return false;
    }

    const files: DataFileInfo[] = result.files;
    const scFile = findLatestFile(files, 'SC-', '.json');
    const dcFile = findLatestFile(files, 'DC-', '.xlsx');
    const scReportFile = findLatestFile(files, '', '.xlsx', 'ReportExport');
    const scTransferFile = findLatestFile(files, '', '.xlsx', 'CookieOrders');

    let loadedSC = false;
    let loadedDC = false;
    let loadedSCReport = false;
    let loadedSCTransfer = false;
    const loadIssues: string[] = [];

    if (scFile) {
      const r = loadJsonFile(scFile, reconciler);
      loadedSC = r.loaded;
      if (r.loaded) {
        updateSourceStatus(dom.status.scStatus, dom.status.scLastSync, scFile.name, 'SC-', '.json', updateTimestamps);
      } else if (r.issue) {
        loadIssues.push(r.issue);
      }
    }

    if (dcFile) {
      const r = loadExcelFile(
        dcFile,
        isDigitalCookieFormat,
        (data) => reconciler.importDigitalCookie(data),
        'Digital Cookie XLSX not recognized'
      );
      loadedDC = r.loaded;
      if (r.loaded) {
        updateSourceStatus(dom.status.dcStatus, dom.status.dcLastSync, dcFile.name, 'DC-', '.xlsx', updateTimestamps);
      } else if (r.issue) {
        loadIssues.push(r.issue);
      }
    }

    if (scReportFile) {
      const r = loadExcelFile(
        scReportFile,
        (data) => data && data.length > 0,
        (data) => reconciler.importSmartCookieReport(data),
        'Smart Cookie Report empty/unreadable'
      );
      loadedSCReport = r.loaded;
      if (r.issue) loadIssues.push(r.issue);
    }

    if (!loadedSC && scTransferFile) {
      const r = loadExcelFile(
        scTransferFile,
        (data) => data && data.length > 0,
        (data) => reconciler.importSmartCookie(data),
        'Smart Cookie Transfer empty/unreadable'
      );
      loadedSCTransfer = r.loaded;
      if (r.issue) loadIssues.push(r.issue);
    } else if (loadedSC && scTransferFile) {
      const warning = {
        type: 'SC_TRANSFER_SKIPPED',
        reason: 'SC API data present',
        file: scTransferFile.name
      };
      reconciler.metadata.warnings.push(warning);
      Logger.warn('Skipping CookieOrders.xlsx import because SC API data is present.');
    }

    if (loadedSC || loadedDC || loadedSCReport || loadedSCTransfer) {
      Logger.debug('Building unified dataset...');
      reconciler.buildUnifiedDataset();
      if (reconciler.unified?.metadata?.healthChecks?.warningsCount > 0) {
        Logger.warn('Health check warnings:', reconciler.unified.metadata.warnings);
      }
      Logger.info('Unified dataset ready:', {
        scouts: reconciler.unified.scouts.size,
        siteOrders: reconciler.unified.siteOrders
      });

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
        details: loadIssues.map((msg) => ({ type: 'LOAD_ISSUE', message: msg }))
      });
    }
    return false;
  } catch (error) {
    if (showMessages) {
      showStatus(`Error loading files: ${error.message}`, 'error');
    }
    Logger.error('Data load error:', error);
    return false;
  }
}

function parseExcel(buffer: Buffer): Record<string, any>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  fixWorksheetRange(firstSheet);
  return XLSX.utils.sheet_to_json(firstSheet, { raw: false });
}

function fixWorksheetRange(worksheet: XLSX.WorkSheet): void {
  if (!worksheet) return;
  const keys = Object.keys(worksheet).filter((k) => !k.startsWith('!'));
  if (keys.length === 0) return;

  let maxRow = 0;
  let maxCol = 0;

  keys.forEach((key) => {
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

function isDigitalCookieFormat(data: Record<string, any>[]): boolean {
  if (!data || data.length === 0) return false;
  const headers = Object.keys(data[0]);
  return headers.includes(DC_COLUMNS.GIRL_FIRST_NAME) && headers.includes(DC_COLUMNS.ORDER_NUMBER);
}

function isSmartCookieAPIFormat(data: Record<string, any>): boolean {
  return data?.orders && Array.isArray(data.orders);
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

const REPORT_CONFIG = {
  troop: { button: () => dom.buttons.troopSummaryBtn, generator: () => generateTroopSummaryReport(reconciler) },
  inventory: { button: () => dom.buttons.inventoryReportBtn, generator: () => generateInventoryReport(reconciler) },
  summary: { button: () => dom.buttons.summaryReportBtn, generator: () => generateSummaryReport(reconciler) },
  variety: { button: () => dom.buttons.varietyReportBtn, generator: () => generateVarietyReport(reconciler) },
  'donation-alert': { button: () => dom.buttons.donationAlertBtn, generator: () => generateDonationAlertReport(reconciler) },
  booth: { button: () => dom.buttons.boothReportBtn, generator: () => generateBoothReport(reconciler) }
};

async function handleRefreshBoothAvailability(): Promise<void> {
  const btn = document.getElementById('refreshBoothAvailability') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
  }

  try {
    const result = await ipcRenderer.invoke('refresh-booth-locations');

    if (!result?.success) {
      const errMsg = result?.error || 'Unknown error';
      if (btn) {
        btn.textContent = errMsg;
        setTimeout(() => {
          btn.textContent = 'Refresh Availability';
          btn.disabled = false;
        }, 3000);
      }
      return;
    }

    // Map raw API data to BoothLocation[]
    const rawLocations: any[] = result.data || [];
    const updated = rawLocations.map(normalizeBoothLocation);

    // Merge into reconciler
    reconciler.boothLocations = updated;
    if (reconciler.unified) {
      reconciler.unified.boothLocations = updated;
    }

    // Re-render booth report
    generateReport('booth');
  } catch (error) {
    Logger.error('Booth availability refresh failed:', error);
    if (btn) {
      btn.textContent = 'Refresh failed';
      setTimeout(() => {
        btn.textContent = 'Refresh Availability';
        btn.disabled = false;
      }, 3000);
    }
  }
}

function generateReport(type: string): void {
  if (!dom.reportContainer) return;

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

  Object.values(REPORT_CONFIG).forEach((config) => {
    const btn = config.button();
    if (btn) btn.classList.remove('active');
  });

  const config = REPORT_CONFIG[type];
  if (config) {
    dom.reportContainer.innerHTML = config.generator();
    const btn = config.button();
    if (btn) btn.classList.add('active');
    dom.reportContainer.classList.add('show');

    // Wire up booth availability refresh button if present
    if (type === 'booth') {
      const refreshBtn = document.getElementById('refreshBoothAvailability');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefreshBoothAvailability);
      }
    }
  }
}

function getBoothWarningLabel(rec: DataReconciler): string {
  const boothReservations = rec.unified?.boothReservations || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pastNeedingDistribution = boothReservations.filter((r: BoothReservationImported) => {
    const type = (r.booth.reservationType || '').toLowerCase();
    if (type.includes('virtual')) return false;
    if (r.booth.isDistributed) return false;
    const d = r.timeslot.date ? new Date(r.timeslot.date) : null;
    return !d || d < today;
  }).length;

  return pastNeedingDistribution > 0 ? '⚠️ Booths' : 'Booths';
}

function enableReportButtons(): void {
  const { troopSummaryBtn, inventoryReportBtn, summaryReportBtn, varietyReportBtn, donationAlertBtn, boothReportBtn, viewUnifiedDataBtn } =
    dom.buttons;
  const unknownTypes = reconciler.unified?.metadata?.healthChecks?.unknownOrderTypes || 0;

  if (unknownTypes > 0) {
    setButtonDisabled(troopSummaryBtn, true);
    setButtonDisabled(inventoryReportBtn, true);
    setButtonDisabled(viewUnifiedDataBtn, false);
    setButtonDisabled(summaryReportBtn, true);
    setButtonDisabled(varietyReportBtn, true);
    setButtonDisabled(donationAlertBtn, true);
    setButtonDisabled(boothReportBtn, true);

    renderHealthBanner({
      level: 'error',
      title: 'Blocked: Unknown Order Types Detected',
      message: `Found ${unknownTypes} unknown Digital Cookie order type(s). Update classification rules before viewing reports.`,
      details: reconciler.unified?.metadata?.warnings || []
    });
    return;
  }

  setButtonDisabled(troopSummaryBtn, false);
  setButtonDisabled(inventoryReportBtn, false);
  setButtonDisabled(viewUnifiedDataBtn, false);

  if (summaryReportBtn) {
    setButtonDisabled(summaryReportBtn, false);

    const hasNegativeInventory = reconciler.unified?.troopTotals?.scouts?.withNegativeInventory > 0;
    const hasUnallocatedSiteOrders =
      reconciler.unified?.siteOrders?.directShip?.hasWarning ||
      reconciler.unified?.siteOrders?.girlDelivery?.hasWarning ||
      reconciler.unified?.siteOrders?.boothSale?.hasWarning;
    const hasScoutWarning = hasNegativeInventory || hasUnallocatedSiteOrders;
    summaryReportBtn.textContent = hasScoutWarning ? '⚠️ Scout Summary' : 'Scout Summary';
  }

  setButtonDisabled(varietyReportBtn, false);

  if (donationAlertBtn) {
    setButtonDisabled(donationAlertBtn, false);

    const needsReconciliation = !reconciler.unified?.cookieShare?.reconciled;
    donationAlertBtn.textContent = needsReconciliation ? '⚠️ Virtual Cookie Share' : 'Virtual Cookie Share';
  }

  if (boothReportBtn) {
    setButtonDisabled(boothReportBtn, false);
    boothReportBtn.textContent = getBoothWarningLabel(reconciler);
  }

  generateReport('troop');
}

// ============================================================================
// DATA EXPORT
// ============================================================================

function exportUnifiedDataset(): void {
  if (!reconciler.unified) {
    alert('No unified dataset available to export.');
    return;
  }

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

function renderHealthBanner({
  level,
  title,
  message,
  details = []
}: {
  level: string;
  title: string;
  message: string;
  details?: Array<{ type: string; message?: string }>;
}): void {
  if (!dom.reportContainer) return;
  const bannerStyle =
    level === 'error'
      ? 'background:#FFEBEE;border-left:4px solid #C62828;color:#B71C1C;'
      : 'background:#FFF8E1;border-left:4px solid #F57F17;color:#E65100;';

  const detailList = details.length
    ? `<pre style="margin:10px 0 0;white-space:pre-wrap;">${JSON.stringify(details.slice(0, 20), null, 2)}</pre>
       ${details.length > 20 ? `<p style="margin:8px 0 0;">…and ${details.length - 20} more</p>` : ''}`
    : '';

  dom.reportContainer.innerHTML = `
    <div class="report-visual">
      <div style="padding:15px;border-radius:8px;${bannerStyle}">
        <strong>${title}</strong>
        <p style="margin:8px 0 0;">${message}</p>
        ${detailList}
      </div>
    </div>
  `;
}

function serializeUnifiedDataset(): Record<string, any> {
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

async function saveUnifiedDatasetToDisk(): Promise<void> {
  if (!reconciler.unified) {
    Logger.debug('No unified dataset to save');
    return;
  }

  try {
    const exportData = serializeUnifiedDataset();
    const jsonStr = JSON.stringify(exportData, null, 2);

    const timestamp = DateFormatter.toTimestamp();
    const filename = `unified-${timestamp}.json`;

    const result = await ipcRenderer.invoke('save-file', {
      filename: filename,
      content: jsonStr,
      type: 'unified'
    });

    if (result.success) {
      Logger.debug(`Unified dataset saved: ${filename}`);
    } else {
      Logger.error('Failed to save unified dataset:', result.error);
    }
  } catch (error) {
    Logger.error('Error saving unified dataset:', error);
  }
}
