/**
 * UI Controller
 * Handles all user interface interactions, modals, progress bars, and event listeners
 */

const { ipcRenderer } = require('electron');
const tippy = require('tippy.js').default;
const { DateFormatter } = require('./html-builder.js');
const { UI_TIMING } = require('../constants.js');

// UI Constants
const TIMEOUTS = {
  STATUS_MESSAGE_HIDE: 5000,  // Hide success message after 5 seconds
  INIT_TOOLTIPS_DELAY: 100    // Delay before initializing tooltips
};

// Global observer for cleanup
let reportObserver = null;

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

async function openLoginModal(loginModal, dcUsername, dcPassword, dcRole, scUsername, scPassword) {
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

function closeLoginModal(loginModal) {
  loginModal.classList.remove('show');
}

async function handleSaveCredentials(dcUsername, dcPassword, dcRole, scUsername, scPassword, loginModal, showStatus, checkLoginStatus) {
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

    // Clear sensitive data from memory immediately after use
    // Note: JavaScript strings are immutable, so this is best-effort only
    // Actual security relies on Electron's safeStorage (OS keychain encryption)
    credentials.digitalCookie.password = '';
    credentials.smartCookie.password = '';
    dcPassword.value = '';
    scPassword.value = '';

    if (result.success) {
      showStatus('Credentials saved successfully', 'success');
      closeLoginModal(loginModal);

      // Update button prominence
      await checkLoginStatus();
    } else {
      showStatus(`Error saving credentials: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// ============================================================================
// WEB REFRESH HANDLER
// ============================================================================

async function handleRefreshFromWeb(
  refreshFromWebBtn,
  dcProgress, dcProgressFill, dcProgressText,
  scProgress, scProgressFill, scProgressText,
  dcStatusEl, scStatusEl, dcLastSync, scLastSync,
  showStatus, updateSyncStatus, loadDataFromDisk
) {
  try {
    // Show progress UI for both scrapers
    initializeProgressBar(dcProgress, dcProgressFill, dcProgressText);
    initializeProgressBar(scProgress, scProgressFill, scProgressText);

    // Set initial status
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

// ============================================================================
// STATUS & PROGRESS UPDATES
// ============================================================================

// Helper function to update source sync status and timestamp
function updateSourceStatus(statusEl, lastSyncEl, filename, prefix, extension, updateTimestamps) {
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

// Helper function to setup timestamp hover behavior (swap between relative and full timestamp)
function setupTimestampHover(element, timestamp) {
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
  element.onmouseenter = function() {
    this.textContent = this.dataset.fullTime;
  };

  element.onmouseleave = function() {
    this.textContent = this.dataset.friendlyTime;
  };

  // Add pointer cursor to indicate interactivity
  element.style.cursor = 'pointer';
}

// Helper function to update sync status for a data source
function updateSyncStatus(source, result, statusEl, lastSyncEl, timestamp, errors) {
  if (result && result.success) {
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
    statusEl.textContent = '✓';
    statusEl.className = 'sync-status synced';
  } else if (progress.progress > 0) {
    statusEl.textContent = '...';
    statusEl.className = 'sync-status syncing';
  }
}

function updateScrapeProgress(progress, dcProgressFill, dcProgressText, scProgressFill, scProgressText) {
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

function showStatus(importStatus, message, type) {
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

// ============================================================================
// TOOLTIP MANAGEMENT
// ============================================================================

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
              boundary: 'viewport',
            },
          },
        ],
      },
    });
  });
}

// Setup MutationObserver for tooltip initialization
function setupReportObserver(reportContainer) {
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

// Cleanup function to prevent memory leaks
function cleanup() {
  if (reportObserver) {
    reportObserver.disconnect();
    reportObserver = null;
  }
}

// ============================================================================
// EVENT SETUP
// ============================================================================

function setupEventListeners(
  configureLoginsBtn, refreshFromWebBtn,
  troopSummaryBtn, inventoryReportBtn, summaryReportBtn, varietyReportBtn, donationAlertBtn, viewUnifiedDataBtn,
  loginModal, closeModal, cancelModal, saveCredentials,
  dcUsername, dcPassword, dcRole, scUsername, scPassword,
  dcProgress, dcProgressFill, dcProgressText,
  scProgress, scProgressFill, scProgressText,
  dcStatusEl, scStatusEl, dcLastSync, scLastSync,
  importStatus, reportContainer,
  generateReport, exportUnifiedDataset, loadDataFromDisk, checkLoginStatusFn
) {
  // Button event listeners
  if (configureLoginsBtn) {
    configureLoginsBtn.addEventListener('click', () => {
      openLoginModal(loginModal, dcUsername, dcPassword, dcRole, scUsername, scPassword);
    });
  }

  if (refreshFromWebBtn) {
    refreshFromWebBtn.addEventListener('click', () => {
      handleRefreshFromWeb(
        refreshFromWebBtn,
        dcProgress, dcProgressFill, dcProgressText,
        scProgress, scProgressFill, scProgressText,
        dcStatusEl, scStatusEl, dcLastSync, scLastSync,
        (msg, type) => showStatus(importStatus, msg, type),
        updateSyncStatus,
        loadDataFromDisk
      );
    });
  }

  if (troopSummaryBtn) troopSummaryBtn.addEventListener('click', () => generateReport('troop'));
  if (inventoryReportBtn) inventoryReportBtn.addEventListener('click', () => generateReport('inventory'));
  if (summaryReportBtn) summaryReportBtn.addEventListener('click', () => generateReport('summary'));
  if (varietyReportBtn) varietyReportBtn.addEventListener('click', () => generateReport('variety'));
  if (donationAlertBtn) donationAlertBtn.addEventListener('click', () => generateReport('donation-alert'));
  if (viewUnifiedDataBtn) viewUnifiedDataBtn.addEventListener('click', () => exportUnifiedDataset());

  // Modal event listeners
  if (closeModal) closeModal.addEventListener('click', () => closeLoginModal(loginModal));
  if (cancelModal) cancelModal.addEventListener('click', () => closeLoginModal(loginModal));
  if (saveCredentials) {
    saveCredentials.addEventListener('click', () => {
      handleSaveCredentials(
        dcUsername, dcPassword, dcRole, scUsername, scPassword,
        loginModal,
        (msg, type) => showStatus(importStatus, msg, type),
        checkLoginStatusFn
      );
    });
  }

  // Close modal when clicking outside
  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) {
        closeLoginModal(loginModal);
      }
    });
  }

  // Listen for scrape progress events
  ipcRenderer.on('scrape-progress', (event, progress) => {
    updateScrapeProgress(progress, dcProgressFill, dcProgressText, scProgressFill, scProgressText);
  });

  // Event delegation for scout row toggles (more efficient than individual listeners)
  if (reportContainer) {
    reportContainer.addEventListener('click', (e) => {
      // Handle scout row toggle
      const scoutRow = e.target.closest('.scout-row');
      if (scoutRow) {
        const index = scoutRow.dataset.scoutIndex;
        const detailRow = reportContainer.querySelector(`.scout-detail[data-scout-index="${index}"]`);
        const icon = scoutRow.querySelector('.expand-icon');

        if (detailRow) {
          if (detailRow.style.display === 'none') {
            detailRow.style.display = 'table-row';
            if (icon) icon.textContent = '▼';
          } else {
            detailRow.style.display = 'none';
            if (icon) icon.textContent = '▶';
          }
        }
      }
    });
  }

  // Auto-update notification handler (notification-only)
  ipcRenderer.on('update-available', (event, info) => {
    const response = confirm(
      `🎉 New version ${info.version} is available!\n\n` +
      `You're currently on version ${require('../package.json').version}\n\n` +
      'Click OK to download the latest version from GitHub.'
    );

    if (response) {
      // Open releases page in default browser
      require('electron').shell.openExternal(
        'https://github.com/tyleryates/cookie-tracker/releases/latest'
      );
      showStatus(importStatus, 'Opening download page...', 'info');
    }
  });

  // Clean up on window unload
  window.addEventListener('beforeunload', cleanup);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  openLoginModal,
  closeLoginModal,
  handleSaveCredentials,
  handleRefreshFromWeb,
  updateSourceStatus,
  updateSyncStatus,
  initializeProgressBar,
  hideProgressBar,
  updateProgressBarAndStatus,
  updateScrapeProgress,
  showStatus,
  checkLoginStatus,
  initializeTooltips,
  setupReportObserver,
  cleanup,
  setupEventListeners
};
