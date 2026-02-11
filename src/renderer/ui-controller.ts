/**
 * UI Controller
 * Handles all user interface interactions, modals, progress bars, and event listeners
 */

import { ipcRenderer } from 'electron';
import tippy, { type ReferenceElement } from 'tippy.js';
import { UI_TIMING } from '../constants';
import Logger from '../logger';
import type { Credentials } from '../types';
import { DateFormatter } from './html-builder';

// Progress update from scrape events
interface ScrapeProgress {
  status: string;
  progress: number;
  source?: string;
}

interface RefreshFromWebOptions {
  refreshFromWebBtn: HTMLElement | null;
  dcProgress: HTMLElement | null;
  dcProgressFill: HTMLElement | null;
  dcProgressText: HTMLElement | null;
  scProgress: HTMLElement | null;
  scProgressFill: HTMLElement | null;
  scProgressText: HTMLElement | null;
  dcStatusEl: HTMLElement | null;
  scStatusEl: HTMLElement | null;
  dcLastSync: HTMLElement | null;
  scLastSync: HTMLElement | null;
  showStatus: (msg: string, type: string) => void;
  updateSyncStatus: (
    source: string,
    result: Record<string, any>,
    statusEl: HTMLElement | null,
    lastSyncEl: HTMLElement | null,
    timestamp: string,
    errors: string[]
  ) => { success: boolean; message?: string } | null;
  loadDataFromDisk: (...args: any[]) => Promise<boolean>;
}

// UI Constants
const TIMEOUTS = {
  STATUS_MESSAGE_HIDE: 5000 // Hide success message after 5 seconds
};

// Global observer for cleanup
let reportObserver: MutationObserver | null = null;

// ============================================================================
// WEB REFRESH HANDLER
// ============================================================================

async function handleRefreshFromWeb(opts: RefreshFromWebOptions): Promise<void> {
  const {
    refreshFromWebBtn,
    dcProgress,
    dcProgressFill,
    dcProgressText,
    scProgress,
    scProgressFill,
    scProgressText,
    dcStatusEl,
    scStatusEl,
    dcLastSync,
    scLastSync,
    showStatus,
    updateSyncStatus,
    loadDataFromDisk
  } = opts;

  const refreshBtn = refreshFromWebBtn as HTMLButtonElement | null;
  let progressInitialized = false;

  try {
    // Show progress UI for both scrapers
    initializeProgressBar(dcProgress, dcProgressFill, dcProgressText);
    initializeProgressBar(scProgress, scProgressFill, scProgressText);
    progressInitialized = true;

    // Set initial status
    dcStatusEl.textContent = 'Syncing...';
    dcStatusEl.className = 'sync-status syncing';
    scStatusEl.textContent = 'Syncing...';
    scStatusEl.className = 'sync-status syncing';

    showStatus('Starting API sync for both platforms...', 'success');

    // Disable button during scraping
    if (refreshBtn) refreshBtn.disabled = true;

    // Start API scraping (both run in parallel)
    const result = await ipcRenderer.invoke('scrape-websites');

    const now = new Date();
    const errors: string[] = [];
    const parts: string[] = [];

    // Update status for both data sources
    const dcStatus = updateSyncStatus('Digital Cookie', result.digitalCookie, dcStatusEl, dcLastSync, now.toISOString(), errors);
    const scStatus = updateSyncStatus('Smart Cookie', result.smartCookie, scStatusEl, scLastSync, now.toISOString(), errors);

    if (dcStatus?.success) parts.push(dcStatus.message);
    if (scStatus?.success) parts.push(scStatus.message);

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
    showStatus(`Error: ${(error as Error).message}`, 'error');
    Logger.error(error);
  } finally {
    if (progressInitialized) {
      hideProgressBar(dcProgress);
      hideProgressBar(scProgress);
    }
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// ============================================================================
// STATUS & PROGRESS UPDATES
// ============================================================================

function updateSourceStatus(
  statusEl: HTMLElement | null,
  lastSyncEl: HTMLElement | null,
  filename: string,
  prefix: string,
  extension: string,
  updateTimestamps: boolean
): void {
  statusEl.textContent = '✓';
  statusEl.className = 'sync-status synced';

  if (updateTimestamps) {
    // Extract timestamp from filename (e.g., DC-2026-02-04-16-30-45.xlsx)
    const timestampStr = filename.replace(prefix, '').replace(extension, '');
    // Convert from YYYY-MM-DD-HH-MM-SS to YYYY-MM-DDTHH:MM:SS
    const isoTimestamp = timestampStr.replace(/-(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
    setupTimestampHover(lastSyncEl, isoTimestamp);
    lastSyncEl.style.color = '#666';
  }
}

function setupTimestampHover(element: HTMLElement | null, timestamp: string): void {
  if (!element) return;
  const friendlyTime = DateFormatter.toFriendly(timestamp);
  const fullTime = DateFormatter.toFullTimestamp(timestamp);

  // Set initial text to friendly time
  element.textContent = friendlyTime;

  // Store both values as data attributes
  element.dataset.friendlyTime = friendlyTime;
  element.dataset.fullTime = fullTime;

  // Remove any existing listeners to avoid duplicates
  element.onmouseenter = null;
  element.onmouseleave = null;

  // Add hover behavior
  element.onmouseenter = () => {
    element.textContent = element.dataset.fullTime || '';
  };

  element.onmouseleave = () => {
    element.textContent = element.dataset.friendlyTime || '';
  };

  // Add pointer cursor to indicate interactivity
  element.style.cursor = 'pointer';
}

function updateSyncStatus(
  source: string,
  result: Record<string, any>,
  statusEl: HTMLElement | null,
  lastSyncEl: HTMLElement | null,
  timestamp: string,
  errors: string[]
): { success: boolean; message?: string } | null {
  if (result?.success) {
    statusEl.textContent = '✓';
    statusEl.className = 'sync-status synced';
    setupTimestampHover(lastSyncEl, timestamp);
    lastSyncEl.style.color = '#666';
    return { success: true, message: `${source} downloaded` };
  } else if (result && !result.success) {
    statusEl.textContent = '✗';
    statusEl.className = 'sync-status error';
    lastSyncEl.textContent = 'Failed';
    lastSyncEl.style.color = '#EF4444';
    if (result.error) errors.push(`${source}: ${result.error}`);
    return { success: false };
  }
  return null;
}

function initializeProgressBar(
  progressEl: HTMLElement | null,
  fillEl: HTMLElement | null,
  textEl: HTMLElement | null,
  initialText: string = 'Starting...'
): void {
  progressEl.style.display = 'block';
  fillEl.style.width = '0%';
  textEl.textContent = initialText;
}

function hideProgressBar(progressEl: HTMLElement | null): void {
  progressEl.style.display = 'none';
}

function updateProgressBarAndStatus(
  fillEl: HTMLElement | null,
  textEl: HTMLElement | null,
  statusEl: HTMLElement | null,
  progress: ScrapeProgress,
  statusPrefix: string
): void {
  fillEl.style.width = `${progress.progress}%`;
  textEl.textContent = progress.status.replace(statusPrefix, '').replace('Smart Cookie: ', '');

  if (progress.progress >= 100) {
    statusEl.textContent = '✓';
    statusEl.className = 'sync-status synced';
  } else if (progress.progress > 0) {
    statusEl.textContent = '...';
    statusEl.className = 'sync-status syncing';
  }
}

function updateScrapeProgress(
  progress: ScrapeProgress,
  dcProgressFill: HTMLElement | null,
  dcProgressText: HTMLElement | null,
  scProgressFill: HTMLElement | null,
  scProgressText: HTMLElement | null
): void {
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

function showStatus(importStatus: HTMLElement | null, message: string, type: string): void {
  importStatus.textContent = message;
  importStatus.className = `sync-status-message ${type}`;
  importStatus.style.display = 'block';

  // Auto-hide success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      importStatus.style.display = 'none';
    }, TIMEOUTS.STATUS_MESSAGE_HIDE);
  }
}

// ============================================================================
// LOGIN STATUS CHECK
// ============================================================================

async function checkLoginStatus(): Promise<void> {
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
  } catch {
    // Non-fatal: app works without saved credentials
  }
}

// ============================================================================
// TOOLTIP MANAGEMENT
// ============================================================================

// Initialize Tippy.js tooltips for dynamically created elements
function initializeTooltips(): void {
  const tooltipElements = document.querySelectorAll('.tooltip-cell[data-tooltip]');
  tooltipElements.forEach((element: Element) => {
    // Skip if already initialized
    if ((element as ReferenceElement)._tippy) return;

    tippy(element, {
      content: element.getAttribute('data-tooltip'),
      allowHTML: false,
      interactive: true, // Allow hovering over tooltip to select text
      delay: [UI_TIMING.TOOLTIP_DELAY_SHOW, UI_TIMING.TOOLTIP_DELAY_HIDE],
      placement: 'top',
      arrow: false,
      theme: 'dark',
      maxWidth: 'none', // Allow tooltip to expand to content width
      popperOptions: {
        modifiers: [
          {
            name: 'preventOverflow',
            options: {
              boundary: 'viewport'
            }
          }
        ]
      }
    });
  });
}

function setupReportObserver(reportContainer: HTMLElement | null): void {
  // Disconnect existing observer if any
  if (reportObserver) {
    reportObserver.disconnect();
  }

  // Call initializeTooltips whenever report container changes
  if (reportContainer) {
    reportObserver = new MutationObserver(() => {
      initializeTooltips();
    });
    reportObserver.observe(reportContainer, { childList: true, subtree: true });
  }
}

function cleanup(): void {
  if (reportObserver) {
    reportObserver.disconnect();
    reportObserver = null;
  }
}

// ============================================================================
// EVENT SETUP
// ============================================================================

/** Wire up login modal: open, close, save credentials */
function setupModalHandlers(
  modal: Record<string, any>,
  fields: Record<string, any>,
  statusMsg: (msg: string, type: string) => void,
  checkLoginStatusFn: () => Promise<void>
): void {
  const { loginModal, closeModal, cancelModal, saveCredentials } = modal;
  const { dcUsername, dcPassword, dcRole, scUsername, scPassword } = fields;

  const closeModalFn = () => loginModal.classList.remove('show');

  const openModalFn = async () => {
    try {
      const result = await ipcRenderer.invoke('load-credentials');
      if (result.success && result.credentials) {
        dcUsername.value = result.credentials.digitalCookie.username || '';
        dcPassword.value = result.credentials.digitalCookie.password || '';
        dcRole.value = result.credentials.digitalCookie.role || '';
        scUsername.value = result.credentials.smartCookie.username || '';
        scPassword.value = result.credentials.smartCookie.password || '';
      }
    } catch (error) {
      Logger.error('Error loading credentials:', error);
    }
    loginModal.classList.add('show');
  };

  const saveCredentialsFn = async () => {
    try {
      const credentials: Credentials = {
        digitalCookie: { username: dcUsername!.value.trim(), password: dcPassword!.value.trim(), role: dcRole!.value.trim() },
        smartCookie: { username: scUsername!.value.trim(), password: scPassword!.value.trim() }
      };

      const result = await ipcRenderer.invoke('save-credentials', credentials);

      // Best-effort memory clearing (JS strings are immutable; real security is OS keychain)
      credentials.digitalCookie.password = '';
      credentials.smartCookie.password = '';
      if (dcPassword) dcPassword.value = '';
      if (scPassword) scPassword.value = '';

      if (result.success) {
        statusMsg('Credentials saved successfully', 'success');
        closeModalFn();
        await checkLoginStatusFn();
      } else {
        statusMsg(`Error saving credentials: ${result.error}`, 'error');
      }
    } catch (error) {
      statusMsg(`Error: ${(error as Error).message}`, 'error');
    }
  };

  if (loginModal)
    loginModal.addEventListener('click', (e: Event) => {
      if (e.target === loginModal) closeModalFn();
    });
  if (closeModal) closeModal.addEventListener('click', closeModalFn);
  if (cancelModal) cancelModal.addEventListener('click', closeModalFn);
  if (saveCredentials) saveCredentials.addEventListener('click', saveCredentialsFn);

  // Expose openModal to the configure button
  return openModalFn as any;
}

/** Wire up expandable row toggles via event delegation */
function setupRowToggleDelegation(reportContainer: HTMLElement): void {
  reportContainer.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const scoutRow = target.closest('.scout-row') as HTMLElement | null;
    if (scoutRow) {
      const detailRow = reportContainer.querySelector(
        `.scout-detail[data-scout-index="${scoutRow.dataset.scoutIndex}"]`
      ) as HTMLElement | null;
      toggleDetailRow(detailRow, scoutRow.querySelector('.expand-icon'));
    }

    const boothRow = target.closest('.booth-row') as HTMLElement | null;
    if (boothRow) {
      const detailRow = boothRow.nextElementSibling as HTMLElement | null;
      if (detailRow?.classList.contains('detail-row')) {
        toggleDetailRow(detailRow, boothRow.querySelector('.expand-icon'));
      }
    }
  });
}

function setupEventListeners(config: Record<string, any>): void {
  const { buttons, modal, fields, progress, status, reportContainer, actions } = config;
  const { dcProgress, dcProgressFill, dcProgressText, scProgress, scProgressFill, scProgressText } = progress;
  const { dcStatus: dcStatusEl, scStatus: scStatusEl, dcLastSync, scLastSync, importStatus } = status;
  const { generateReport, exportUnifiedDataset, loadDataFromDisk, checkLoginStatus: checkLoginStatusFn } = actions;

  const statusMsg = (msg: string, type: string) => showStatus(importStatus, msg, type);

  // Modal
  const openModal = setupModalHandlers(modal, fields, statusMsg, checkLoginStatusFn);
  if (buttons.configureLoginsBtn) buttons.configureLoginsBtn.addEventListener('click', openModal);

  // Sync
  const refreshOpts: RefreshFromWebOptions = {
    refreshFromWebBtn: buttons.refreshFromWebBtn,
    dcProgress,
    dcProgressFill,
    dcProgressText,
    scProgress,
    scProgressFill,
    scProgressText,
    dcStatusEl,
    scStatusEl,
    dcLastSync,
    scLastSync,
    showStatus: statusMsg,
    updateSyncStatus,
    loadDataFromDisk
  };
  if (buttons.refreshFromWebBtn) buttons.refreshFromWebBtn.addEventListener('click', () => handleRefreshFromWeb(refreshOpts));

  // Report buttons
  const reportBindings: [HTMLElement | null, string][] = [
    [buttons.troopSummaryBtn, 'troop'],
    [buttons.inventoryReportBtn, 'inventory'],
    [buttons.summaryReportBtn, 'summary'],
    [buttons.varietyReportBtn, 'variety'],
    [buttons.donationAlertBtn, 'donation-alert'],
    [buttons.boothReportBtn, 'booth'],
    [buttons.availableBoothsBtn, 'available-booths']
  ];
  reportBindings.forEach(([btn, type]) => {
    if (btn) btn.addEventListener('click', () => generateReport(type));
  });

  // Action buttons
  if (buttons.recalculateBtn) buttons.recalculateBtn.addEventListener('click', () => loadDataFromDisk());
  if (buttons.viewUnifiedDataBtn) buttons.viewUnifiedDataBtn.addEventListener('click', () => exportUnifiedDataset());

  // IPC listeners
  ipcRenderer.on('scrape-progress', (_event, prog: ScrapeProgress) => {
    updateScrapeProgress(prog, dcProgressFill, dcProgressText, scProgressFill, scProgressText);
  });

  ipcRenderer.on('update-available', (_event, info: { version: string }) => {
    const response = confirm(
      `🎉 New version ${info.version} is available!\n\n` +
        `You're currently on version ${require('../../package.json').version}\n\n` +
        'Click OK to download the latest version from GitHub.'
    );
    if (response) {
      require('electron').shell.openExternal('https://github.com/tyleryates/cookie-tracker/releases/latest');
      showStatus(importStatus, 'Opening download page...', 'info');
    }
  });

  // Row toggle delegation
  if (reportContainer) setupRowToggleDelegation(reportContainer);

  window.addEventListener('beforeunload', cleanup);
}

// ============================================================================
// ROW TOGGLE HELPER
// ============================================================================

function toggleDetailRow(detailRow: HTMLElement | null, icon: Element | null): void {
  if (!detailRow) return;
  if (detailRow.style.display === 'none') {
    detailRow.style.display = 'table-row';
    if (icon) icon.textContent = '▼';
  } else {
    detailRow.style.display = 'none';
    if (icon) icon.textContent = '▶';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  handleRefreshFromWeb,
  updateSourceStatus,
  updateSyncStatus,
  showStatus,
  checkLoginStatus,
  setupReportObserver,
  setupEventListeners
};
export type { RefreshFromWebOptions };
