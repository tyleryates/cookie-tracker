import { ipcRenderer } from 'electron';
import { h, render } from 'preact';
import XLSX from 'xlsx';
import * as packageJson from '../package.json';
import { DC_COLUMNS } from './constants';
import { buildUnifiedDataset } from './data-processing/data-calculators';
import { importDigitalCookie, importSmartCookie, importSmartCookieAPI, importSmartCookieReport, normalizeBoothLocation } from './data-processing/data-importers';
import { createDataStore, type DataStore } from './data-store';
import Logger from './logger';
import { DateFormatter } from './renderer/format-utils';
import { AvailableBoothsReport, countAvailableSlots } from './renderer/reports/available-booths';
import { BoothReport } from './renderer/reports/booth';
import { DonationAlertReport } from './renderer/reports/donation-alert';
import { InventoryReport } from './renderer/reports/inventory';
import { ScoutSummaryReport } from './renderer/reports/scout-summary';
import { TroopSummaryReport } from './renderer/reports/troop-summary';
import { VarietyReport } from './renderer/reports/variety';
import type { RefreshFromWebOptions } from './renderer/ui-controller';
import {
  checkLoginStatus,
  handleRefreshFromWeb,
  setupEventListeners,
  showStatus as showStatusUI,
  updateSourceStatus,
  updateSyncStatus
} from './renderer/ui-controller';
import type { AppConfig, BoothReservationImported, DataFileInfo } from './types';

let store = createDataStore();
let appConfig: AppConfig | null = null;

interface DatasetEntry {
  label: string;
  scFile: DataFileInfo | null;
  dcFile: DataFileInfo | null;
  timestamp: Date;
}

let datasetList: DatasetEntry[] = [];
let currentDatasetIndex = 0;

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
    availableBoothsBtn: document.getElementById('availableBoothsBtn'),
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
  reportContainer: document.getElementById('reportContainer'),
  datasetSelect: document.getElementById('datasetSelect') as HTMLSelectElement | null
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

  appConfig = await loadAppConfig();
  await loadDataFromDisk(false);
  await checkLoginStatus();

  initializeAutoSyncToggle();
});

async function loadAppConfig(): Promise<AppConfig> {
  try {
    const result = await ipcRenderer.invoke('load-config');
    // IPC wraps in { success, data } — unwrap if needed
    if (result && typeof result === 'object' && 'success' in result) {
      return result.data;
    }
    return result;
  } catch (err) {
    Logger.error('Failed to load config:', err);
    return { autoSyncEnabled: true, boothIds: [], boothDayFilters: [], ignoredTimeSlots: [] };
  }
}

// ============================================================================
// AUTO-SYNC FUNCTIONALITY
// ============================================================================

const AUTO_SYNC_INTERVAL_MS = 3600000; // 1 hour

let autoSyncInterval: ReturnType<typeof setInterval> | null = null;
let autoSyncEnabled = true; // Default to enabled

function initializeAutoSyncToggle(): void {
  const toggle = document.getElementById('autoSyncToggle') as HTMLInputElement;

  autoSyncEnabled = appConfig?.autoSyncEnabled ?? true;

  if (toggle) toggle.checked = autoSyncEnabled;

  if (autoSyncEnabled) {
    startAutoSync();
  }

  toggle.addEventListener('change', (e: Event) => {
    autoSyncEnabled = (e.target as HTMLInputElement).checked;

    ipcRenderer.invoke('update-config', { autoSyncEnabled });

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
// DATASET HISTORY
// ============================================================================

function parseTimestampFromFilename(name: string, prefix: string, ext: string): Date | null {
  // e.g. "SC-2026-02-10-15-45-30.json" → "2026-02-10T15:45:30"
  const stripped = name.replace(prefix, '').replace(ext, '');
  const match = stripped.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
}

function buildDatasetList(files: DataFileInfo[]): DatasetEntry[] {
  const scFiles = files
    .filter((f) => f.name.startsWith('SC-') && f.extension === '.json')
    .sort((a, b) => b.name.localeCompare(a.name));
  const dcFiles = files
    .filter((f) => f.name.startsWith('DC-') && f.extension === '.xlsx')
    .sort((a, b) => b.name.localeCompare(a.name));

  const pairedDc = new Set<string>();
  const entries: DatasetEntry[] = [];

  for (const sc of scFiles) {
    const scTs = parseTimestampFromFilename(sc.name, 'SC-', '.json');
    if (!scTs) continue;

    // Find closest DC file within 5 minutes
    let bestDc: DataFileInfo | null = null;
    let bestDiff = Infinity;
    for (const dc of dcFiles) {
      if (pairedDc.has(dc.name)) continue;
      const dcTs = parseTimestampFromFilename(dc.name, 'DC-', '.xlsx');
      if (!dcTs) continue;
      const diff = Math.abs(scTs.getTime() - dcTs.getTime());
      if (diff < 5 * 60 * 1000 && diff < bestDiff) {
        bestDiff = diff;
        bestDc = dc;
      }
    }

    if (bestDc) pairedDc.add(bestDc.name);
    entries.push({
      label: DateFormatter.toFullTimestamp(scTs),
      scFile: sc,
      dcFile: bestDc,
      timestamp: scTs
    });
  }

  // Standalone DC files (unpaired)
  for (const dc of dcFiles) {
    if (pairedDc.has(dc.name)) continue;
    const dcTs = parseTimestampFromFilename(dc.name, 'DC-', '.xlsx');
    if (!dcTs) continue;
    entries.push({
      label: DateFormatter.toFullTimestamp(dcTs),
      scFile: null,
      dcFile: dc,
      timestamp: dcTs
    });
  }

  // Sort newest first
  entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Mark latest
  if (entries.length > 0) {
    entries[0].label += ' (Latest)';
  }

  return entries;
}

function populateDatasetDropdown(datasets: DatasetEntry[]): void {
  const select = dom.datasetSelect;
  if (!select) return;

  select.innerHTML = '';

  if (datasets.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No data';
    select.appendChild(opt);
    return;
  }

  datasets.forEach((ds, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    const parts: string[] = [];
    if (ds.scFile) parts.push('SC');
    if (ds.dcFile) parts.push('DC');
    opt.textContent = `${ds.label} [${parts.join('+')}]`;
    select.appendChild(opt);
  });

  select.selectedIndex = 0;
  currentDatasetIndex = 0;
}

async function onDatasetChange(): Promise<void> {
  const select = dom.datasetSelect;
  if (!select || datasetList.length === 0) return;

  const idx = parseInt(select.value, 10);
  if (isNaN(idx) || idx === currentDatasetIndex) return;
  currentDatasetIndex = idx;

  const dataset = datasetList[idx];
  showStatus('Loading dataset...', 'success');

  // Reload from disk with specific SC/DC files
  store = createDataStore();
  const result = await ipcRenderer.invoke('scan-in-directory');
  if (!result.success || !result.files?.length) return;

  const loaded = loadSourceFiles(result.files, store, false, dataset.scFile, dataset.dcFile);
  const anyLoaded = loaded.sc || loaded.dc || loaded.scReport || loaded.scTransfer;

  if (anyLoaded) {
    store.unified = buildUnifiedDataset(store);
    await saveUnifiedDatasetToDisk();
    enableReportButtons();
    showStatus(`Loaded dataset: ${dataset.label}`, 'success');
  }
}

// Wire up dataset change listener
if (dom.datasetSelect) {
  dom.datasetSelect.addEventListener('change', onDatasetChange);
}

// ============================================================================
// DATA LOADING
// ============================================================================

type FileLoadResult = { loaded: boolean; issue?: string };

function loadJsonFile(file: DataFileInfo, rec: DataStore): FileLoadResult {
  if (isSmartCookieAPIFormat(file.data)) {
    importSmartCookieAPI(rec, file.data);
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

interface LoadedSources {
  sc: boolean;
  dc: boolean;
  scReport: boolean;
  scTransfer: boolean;
  issues: string[];
}

/** Find and load all data source files, updating UI status indicators */
function loadSourceFiles(files: DataFileInfo[], rec: DataStore, updateTs: boolean, specificSc?: DataFileInfo | null, specificDc?: DataFileInfo | null): LoadedSources {
  const issues: string[] = [];
  const scFile = specificSc !== undefined ? specificSc : findLatestFile(files, 'SC-', '.json');
  const dcFile = specificDc !== undefined ? specificDc : findLatestFile(files, 'DC-', '.xlsx');
  const scReportFile = findLatestFile(files, '', '.xlsx', 'ReportExport');
  const scTransferFile = findLatestFile(files, '', '.xlsx', 'CookieOrders');

  // Smart Cookie API (JSON)
  let sc = false;
  if (scFile) {
    const r = loadJsonFile(scFile, rec);
    sc = r.loaded;
    if (r.loaded) updateSourceStatus(dom.status.scStatus, dom.status.scLastSync, scFile.name, 'SC-', '.json', updateTs);
    else if (r.issue) issues.push(r.issue);
  }

  // Digital Cookie (Excel)
  let dc = false;
  if (dcFile) {
    const r = loadExcelFile(dcFile, isDigitalCookieFormat, (data) => importDigitalCookie(rec, data), 'Digital Cookie XLSX not recognized');
    dc = r.loaded;
    if (r.loaded) updateSourceStatus(dom.status.dcStatus, dom.status.dcLastSync, dcFile.name, 'DC-', '.xlsx', updateTs);
    else if (r.issue) issues.push(r.issue);
  }

  // Smart Cookie Report (Excel)
  let scReport = false;
  if (scReportFile) {
    const r = loadExcelFile(
      scReportFile,
      (data) => data?.length > 0,
      (data) => importSmartCookieReport(rec, data),
      'Smart Cookie Report empty/unreadable'
    );
    scReport = r.loaded;
    if (r.issue) issues.push(r.issue);
  }

  // Smart Cookie Transfers (Excel) — skipped if API data present
  let scTransfer = false;
  if (!sc && scTransferFile) {
    const r = loadExcelFile(
      scTransferFile,
      (data) => data?.length > 0,
      (data) => importSmartCookie(rec, data),
      'Smart Cookie Transfer empty/unreadable'
    );
    scTransfer = r.loaded;
    if (r.issue) issues.push(r.issue);
  } else if (sc && scTransferFile) {
    rec.metadata.warnings.push({ type: 'SC_TRANSFER_SKIPPED', reason: 'SC API data present', file: scTransferFile.name });
    Logger.warn('Skipping CookieOrders.xlsx import because SC API data is present.');
  }

  return { sc, dc, scReport, scTransfer, issues };
}

async function loadDataFromDisk(showMessages: boolean = true, updateTimestamps: boolean = true): Promise<boolean> {
  try {
    if (showMessages) showStatus('Loading data...', 'success');

    store = createDataStore();
    const result = await ipcRenderer.invoke('scan-in-directory');
    if (!result.success || !result.files?.length) return false;

    // Build dataset list and populate dropdown
    datasetList = buildDatasetList(result.files);
    populateDatasetDropdown(datasetList);

    const loaded = loadSourceFiles(result.files, store, updateTimestamps);
    const anyLoaded = loaded.sc || loaded.dc || loaded.scReport || loaded.scTransfer;

    if (anyLoaded) {
      Logger.debug('Building unified dataset...');
      store.unified = buildUnifiedDataset(store);
      if (store.unified?.metadata?.healthChecks?.warningsCount > 0) {
        Logger.warn('Health check warnings:', store.unified.metadata.warnings);
      }
      Logger.info('Unified dataset ready:', { scouts: store.unified.scouts.size, siteOrders: store.unified.siteOrders });

      await saveUnifiedDatasetToDisk();
      enableReportButtons();
      if (showMessages) showStatus(`✅ Loaded ${result.files.length} file(s)`, 'success');
      return true;
    }

    if (loaded.issues.length > 0 && showMessages) {
      showStatus(`No reports loaded. ${loaded.issues.join(' | ')}`, 'warning');
      renderHealthBanner({
        level: 'warning',
        title: 'No Reports Loaded',
        message: 'Files were found but could not be parsed. See details below.',
        details: loaded.issues.map((msg) => ({ type: 'LOAD_ISSUE', message: msg }))
      });
    }
    return false;
  } catch (error) {
    if (showMessages) showStatus(`Error loading files: ${error.message}`, 'error');
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

const REPORT_CONFIG: Record<string, { button: () => HTMLElement | null; renderReport: () => void }> = {
  troop: {
    button: () => dom.buttons.troopSummaryBtn,
    renderReport: () => render(h(TroopSummaryReport, { data: store.unified }), dom.reportContainer!)
  },
  inventory: {
    button: () => dom.buttons.inventoryReportBtn,
    renderReport: () => render(h(InventoryReport, { data: store.unified, transfers: store.transfers }), dom.reportContainer!)
  },
  summary: {
    button: () => dom.buttons.summaryReportBtn,
    renderReport: () => render(h(ScoutSummaryReport, { data: store.unified }), dom.reportContainer!)
  },
  variety: {
    button: () => dom.buttons.varietyReportBtn,
    renderReport: () => render(h(VarietyReport, { data: store.unified }), dom.reportContainer!)
  },
  'donation-alert': {
    button: () => dom.buttons.donationAlertBtn,
    renderReport: () => render(h(DonationAlertReport, {
      data: store.unified,
      virtualCSAllocations: store.virtualCookieShareAllocations
    }), dom.reportContainer!)
  },
  booth: {
    button: () => dom.buttons.boothReportBtn,
    renderReport: () => render(h(BoothReport, { data: store.unified }), dom.reportContainer!)
  },
  'available-booths': {
    button: () => dom.buttons.availableBoothsBtn,
    renderReport: () => render(h(AvailableBoothsReport, {
      data: store.unified,
      config: {
        filters: appConfig?.boothDayFilters || [],
        ignoredTimeSlots: appConfig?.ignoredTimeSlots || []
      },
      onIgnoreSlot: handleIgnoreSlot,
      onRefresh: handleRefreshBoothAvailability
    }), dom.reportContainer!)
  }
};

async function handleIgnoreSlot(boothId: number, date: string, startTime: string): Promise<void> {
  const ignored = appConfig?.ignoredTimeSlots || [];
  ignored.push({ boothId, date, startTime });
  if (appConfig) appConfig.ignoredTimeSlots = ignored;
  await ipcRenderer.invoke('update-config', { ignoredTimeSlots: ignored });
  generateReport('available-booths');
  if (dom.buttons.availableBoothsBtn) dom.buttons.availableBoothsBtn.textContent = getAvailableBoothsWarningLabel();
}

async function handleRefreshBoothAvailability(): Promise<void> {
  try {
    const result = await ipcRenderer.invoke('refresh-booth-locations');
    if (!result?.success) {
      Logger.error('Booth availability refresh failed:', result?.error);
      return;
    }

    const rawLocations: any[] = result.data || [];
    const updated = rawLocations.map(normalizeBoothLocation);

    store.boothLocations = updated;
    if (store.unified) {
      store.unified.boothLocations = updated;
    }

    generateReport('available-booths');
  } catch (error) {
    Logger.error('Booth availability refresh failed:', error);
  }
}

function generateReport(type: string): void {
  if (!dom.reportContainer) return;

  const unknownTypes = store.unified?.metadata?.healthChecks?.unknownOrderTypes || 0;
  if (unknownTypes > 0) {
    renderHealthBanner({
      level: 'error',
      title: 'Blocked: Unknown Order Types Detected',
      message: `Found ${unknownTypes} unknown Digital Cookie order type(s). Update classification rules before viewing reports.`,
      details: store.unified?.metadata?.warnings || []
    });
    return;
  }

  Object.values(REPORT_CONFIG).forEach((config) => {
    const btn = config.button();
    if (btn) btn.classList.remove('active');
  });

  const config = REPORT_CONFIG[type];
  if (config) {
    render(null, dom.reportContainer);
    config.renderReport();
    const btn = config.button();
    if (btn) btn.classList.add('active');
    dom.reportContainer.classList.add('show');
  }
}

function getBoothWarningLabel(): string {
  const boothReservations = store.unified?.boothReservations || [];
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

function getScoutWarningLabel(): string {
  const hasNegativeInventory = store.unified?.troopTotals?.scouts?.withNegativeInventory > 0;
  const hasUnallocated =
    store.unified?.siteOrders?.directShip?.hasWarning ||
    store.unified?.siteOrders?.girlDelivery?.hasWarning ||
    store.unified?.siteOrders?.boothSale?.hasWarning;
  return hasNegativeInventory || hasUnallocated ? '⚠️ Scouts' : 'Scouts';
}

function getDonationWarningLabel(): string {
  return store.unified?.cookieShare?.reconciled ? 'Donations' : '⚠️ Donations';
}

function getAvailableBoothsWarningLabel(): string {
  const boothLocations = store.unified?.boothLocations || [];
  const filters = appConfig?.boothDayFilters || [];
  const ignored = appConfig?.ignoredTimeSlots || [];
  const count = countAvailableSlots(boothLocations, filters, ignored);
  return count > 0 ? '⚠️ Available Booths' : 'Available Booths';
}

function enableReportButtons(): void {
  const unknownTypes = store.unified?.metadata?.healthChecks?.unknownOrderTypes || 0;

  // All report buttons (viewUnifiedDataBtn always enabled even when blocked)
  const reportButtons = [
    dom.buttons.troopSummaryBtn,
    dom.buttons.inventoryReportBtn,
    dom.buttons.summaryReportBtn,
    dom.buttons.varietyReportBtn,
    dom.buttons.donationAlertBtn,
    dom.buttons.boothReportBtn,
    dom.buttons.availableBoothsBtn
  ];

  if (unknownTypes > 0) {
    reportButtons.forEach((btn) => setButtonDisabled(btn, true));
    setButtonDisabled(dom.buttons.viewUnifiedDataBtn, false);
    renderHealthBanner({
      level: 'error',
      title: 'Blocked: Unknown Order Types Detected',
      message: `Found ${unknownTypes} unknown Digital Cookie order type(s). Update classification rules before viewing reports.`,
      details: store.unified?.metadata?.warnings || []
    });
    return;
  }

  // Enable all buttons
  reportButtons.forEach((btn) => setButtonDisabled(btn, false));
  setButtonDisabled(dom.buttons.viewUnifiedDataBtn, false);

  // Apply warning labels
  if (dom.buttons.summaryReportBtn) dom.buttons.summaryReportBtn.textContent = getScoutWarningLabel();
  if (dom.buttons.donationAlertBtn) dom.buttons.donationAlertBtn.textContent = getDonationWarningLabel();
  if (dom.buttons.boothReportBtn) dom.buttons.boothReportBtn.textContent = getBoothWarningLabel();
  if (dom.buttons.availableBoothsBtn) dom.buttons.availableBoothsBtn.textContent = getAvailableBoothsWarningLabel();

  generateReport('troop');
}

// ============================================================================
// DATA EXPORT
// ============================================================================

function exportUnifiedDataset(): void {
  if (!store.unified) {
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
  const isError = level === 'error';
  const bannerStyle = {
    padding: '15px',
    borderRadius: '8px',
    background: isError ? '#FFEBEE' : '#FFF8E1',
    borderLeft: isError ? '4px solid #C62828' : '4px solid #F57F17',
    color: isError ? '#B71C1C' : '#E65100'
  };

  render(
    h('div', { class: 'report-visual' },
      h('div', { style: bannerStyle },
        h('strong', null, title),
        h('p', { style: { margin: '8px 0 0' } }, message),
        details.length > 0 && h('pre', { style: { margin: '10px 0 0', whiteSpace: 'pre-wrap' } },
          JSON.stringify(details.slice(0, 20), null, 2)
        ),
        details.length > 20 && h('p', { style: { margin: '8px 0 0' } },
          `…and ${details.length - 20} more`
        )
      )
    ),
    dom.reportContainer
  );
}

function serializeUnifiedDataset(): Record<string, any> {
  return {
    scouts: Array.from(store.unified.scouts.entries()).map(([name, scout]) => ({
      name,
      ...scout
    })),
    siteOrders: store.unified.siteOrders,
    troopTotals: store.unified.troopTotals,
    transferBreakdowns: store.unified.transferBreakdowns,
    varieties: store.unified.varieties,
    cookieShare: store.unified.cookieShare,
    metadata: store.unified.metadata
  };
}

async function saveUnifiedDatasetToDisk(): Promise<void> {
  if (!store.unified) {
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
