// App — Root Preact component. Owns all state, effects, and callbacks.

import { ipcRenderer, shell } from 'electron';
import { useCallback, useEffect, useReducer, useRef } from 'preact/hooks';
import * as packageJson from '../../package.json';
import { normalizeBoothLocation } from '../data-processing/data-importers';
import Logger from '../logger';
import type { Credentials, ScrapeProgress } from '../types';
import { type AppState, appReducer } from './app-reducer';
import { LoginModal } from './components/login-modal';
import { ReportsSection } from './components/reports-section';
import { createInitialSyncState, SyncSection } from './components/sync-section';
import { exportUnifiedDataset, loadAppConfig, loadDataFromDisk, saveUnifiedDatasetToDisk } from './data-loader';

// ============================================================================
// CONSTANTS
// ============================================================================

const AUTO_SYNC_INTERVAL_MS = 3600000; // 1 hour
const BOOTH_REFRESH_INTERVAL_MS = 900000; // 15 minutes
const STATUS_MESSAGE_TIMEOUT_MS = 5000;

const initialState: AppState = {
  unified: null,
  appConfig: null,
  datasetList: [],
  currentDatasetIndex: 0,
  autoSyncEnabled: true,
  activeReport: null,
  modalOpen: false,
  statusMessage: null,
  syncState: createInitialSyncState(),
  showSetupHint: false
};

// ============================================================================
// APP COMPONENT
// ============================================================================

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Refs for stable access in callbacks that don't re-render
  const stateRef = useRef(state);
  stateRef.current = state;

  // --- Helpers ---
  const showStatus = useCallback((msg: string, type: 'success' | 'warning' | 'error') => {
    dispatch({ type: 'SET_STATUS', msg, statusType: type });
  }, []);

  const checkLoginStatus = useCallback(async () => {
    try {
      const result = await ipcRenderer.invoke('load-credentials');
      if (result.success && result.credentials) {
        const dc = result.credentials.digitalCookie;
        const sc = result.credentials.smartCookie;
        dispatch({ type: 'SET_SETUP_HINT', show: !(dc.username && dc.password && sc.username && sc.password) });
      } else {
        dispatch({ type: 'SET_SETUP_HINT', show: true });
      }
    } catch {
      // Non-fatal
    }
  }, []);

  // --- Core data operations ---
  const doLoadDataFromDisk = useCallback(
    async (opts?: { specificSc?: any; specificDc?: any; showMessages?: boolean; updateSyncTimestamps?: boolean }) => {
      const showMessages = opts?.showMessages ?? true;
      try {
        if (showMessages) showStatus('Loading data...', 'success');

        const result = await loadDataFromDisk({
          specificSc: opts?.specificSc,
          specificDc: opts?.specificDc
        });

        if (!result) {
          return false;
        }

        dispatch({ type: 'SET_UNIFIED', unified: result.unified, datasetList: result.datasetList });
        if (!opts?.specificSc && !opts?.specificDc) {
          dispatch({ type: 'SET_DATASET_INDEX', index: 0 });
        }

        // Only update sync timestamps on initial load / dataset change — not after
        // a sync, where the sync handler already set the correct status (including errors).
        if (opts?.updateSyncTimestamps) {
          if (result.loaded.scTimestamp) {
            dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'sc', patch: { status: 'synced', lastSync: result.loaded.scTimestamp } });
          }
          if (result.loaded.dcTimestamp) {
            dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'dc', patch: { status: 'synced', lastSync: result.loaded.dcTimestamp } });
          }
        }

        const anyLoaded = result.loaded.sc || result.loaded.dc || result.loaded.scReport || result.loaded.scTransfer;

        if (anyLoaded) {
          await saveUnifiedDatasetToDisk(result.unified);
          dispatch({ type: 'DEFAULT_REPORT' });
          if (showMessages) showStatus(`✅ Loaded ${result.datasetList.length} dataset(s)`, 'success');
          return true;
        }

        if (result.loaded.issues.length > 0 && showMessages) {
          showStatus(`No reports loaded. ${result.loaded.issues.join(' | ')}`, 'warning');
        }
        return false;
      } catch (error) {
        if (showMessages) showStatus(`Error loading files: ${(error as Error).message}`, 'error');
        Logger.error('Data load error:', error);
        return false;
      }
    },
    [showStatus]
  );

  // --- Sync handler ---
  const handleSync = useCallback(async () => {
    try {
      dispatch({ type: 'SYNC_STARTED' });
      showStatus('Starting API sync for both platforms...', 'success');

      const result = await ipcRenderer.invoke('scrape-websites');
      const now = new Date().toISOString();
      const errors: string[] = [];
      const parts: string[] = [];

      // Update DC and SC status
      for (const [key, label] of [
        ['dc', 'Digital Cookie'],
        ['sc', 'Smart Cookie']
      ] as const) {
        const sourceKey = key === 'dc' ? 'digitalCookie' : 'smartCookie';
        const sourceResult = result[sourceKey];
        if (!sourceResult) continue;
        if (sourceResult.success) {
          dispatch({ type: 'SYNC_SOURCE_UPDATE', source: key, patch: { status: 'synced', lastSync: now, progress: 100 } });
          parts.push(`${label} downloaded`);
        } else {
          dispatch({ type: 'SYNC_SOURCE_UPDATE', source: key, patch: { status: 'error', errorMessage: sourceResult.error } });
          if (sourceResult.error) errors.push(`${label}: ${sourceResult.error}`);
        }
      }

      if (result.error) errors.push(result.error);

      // Reload data if anything succeeded (even partial — e.g. SC ok, DC failed)
      if (parts.length > 0) {
        await doLoadDataFromDisk({ showMessages: false });
      }

      if (parts.length > 0 && errors.length === 0) {
        showStatus(`✅ Sync complete! ${parts.join(', ')}`, 'success');
      } else if (parts.length > 0 && errors.length > 0) {
        showStatus(`Partial sync: ${parts.join(', ')}. Errors: ${errors.join('; ')}`, 'warning');
      } else if (errors.length > 0) {
        showStatus(`Sync failed: ${errors.join('; ')}`, 'error');
      } else {
        showStatus('Sync completed with warnings', 'warning');
      }
    } catch (error) {
      showStatus(`Error: ${(error as Error).message}`, 'error');
      Logger.error('Sync error:', error);
    } finally {
      dispatch({ type: 'SYNC_FINISHED' });
    }
  }, [showStatus, doLoadDataFromDisk]);

  // --- Booth refresh ---
  const handleRefreshBoothAvailability = useCallback(async () => {
    try {
      showStatus('Refreshing booth availability...', 'success');
      dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'booth', patch: { status: 'syncing' } });

      const result = await ipcRenderer.invoke('refresh-booth-locations');
      if (!result?.success) {
        Logger.error('Booth availability refresh failed:', result?.error);
        showStatus(`Booth refresh failed: ${result?.error || 'Unknown error'}`, 'error');
        dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'booth', patch: { status: 'error', errorMessage: result?.error } });
        return;
      }

      const rawLocations: any[] = result.data || [];
      const updated = rawLocations.map(normalizeBoothLocation);
      dispatch({ type: 'UPDATE_BOOTH_LOCATIONS', boothLocations: updated });

      const now = new Date().toISOString();
      dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'booth', patch: { status: 'synced', lastSync: now } });
      ipcRenderer.invoke('update-config', { lastBoothSync: now });
      showStatus(`✅ Booth availability refreshed (${updated.length} locations)`, 'success');
    } catch (error) {
      Logger.error('Booth availability refresh failed:', error);
      showStatus(`Booth refresh error: ${(error as Error).message}`, 'error');
      dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'booth', patch: { status: 'error' } });
    }
  }, [showStatus]);

  // --- Callbacks ---
  const handleToggleAutoSync = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'TOGGLE_AUTO_SYNC', enabled });
      ipcRenderer.invoke('update-config', { autoSyncEnabled: enabled });
      showStatus(enabled ? 'Auto-sync enabled (syncs every hour)' : 'Auto-sync disabled', 'success');
    },
    [showStatus]
  );

  const handleDatasetChange = useCallback(
    async (index: number) => {
      const { currentDatasetIndex, datasetList } = stateRef.current;
      if (index === currentDatasetIndex || !datasetList[index]) return;
      dispatch({ type: 'SET_DATASET_INDEX', index });
      const dataset = datasetList[index];
      showStatus('Loading dataset...', 'success');

      const loaded = await doLoadDataFromDisk({
        specificSc: dataset.scFile,
        specificDc: dataset.dcFile,
        showMessages: false
      });

      if (loaded) {
        showStatus(`Loaded dataset: ${dataset.label}`, 'success');
      }
    },
    [showStatus, doLoadDataFromDisk]
  );

  const handleSelectReport = useCallback((type: string) => {
    dispatch({ type: 'SET_ACTIVE_REPORT', report: type });
  }, []);

  const handleExport = useCallback(() => {
    const { unified } = stateRef.current;
    if (!unified) {
      alert('No unified dataset available to export.');
      return;
    }
    exportUnifiedDataset(unified);
  }, []);

  const handleRecalculate = useCallback(() => {
    doLoadDataFromDisk({ showMessages: true });
  }, [doLoadDataFromDisk]);

  const handleSaveCredentials = useCallback(
    async (_credentials: Credentials) => {
      dispatch({ type: 'CLOSE_MODAL' });
      await checkLoginStatus();
    },
    [checkLoginStatus]
  );

  const handleIgnoreSlot = useCallback(async (boothId: number, date: string, startTime: string) => {
    const config = stateRef.current.appConfig;
    const ignored = [...(config?.ignoredTimeSlots || []), { boothId, date, startTime }];
    if (config) {
      dispatch({ type: 'IGNORE_SLOT', config: { ...config, ignoredTimeSlots: ignored } });
    }
    await ipcRenderer.invoke('update-config', { ignoredTimeSlots: ignored });
  }, []);

  // --- Effects ---

  // Init effect
  useEffect(() => {
    (async () => {
      const config = await loadAppConfig();
      dispatch({ type: 'LOAD_CONFIG', config });
      await doLoadDataFromDisk({ showMessages: false, updateSyncTimestamps: true });
      await checkLoginStatus();
    })();
  }, []);

  // Auto-sync effect
  useEffect(() => {
    if (!state.autoSyncEnabled) return;

    const syncInterval = setInterval(async () => {
      Logger.debug('Auto-sync: Starting hourly sync...');
      try {
        await handleSync();
        Logger.debug('Auto-sync: Completed successfully');
      } catch (error) {
        Logger.error('Auto-sync error:', error);
      }
    }, AUTO_SYNC_INTERVAL_MS);

    const boothInterval = setInterval(async () => {
      Logger.debug('Booth refresh: Starting 15-min refresh...');
      try {
        await handleRefreshBoothAvailability();
        Logger.debug('Booth refresh: Completed');
      } catch (error) {
        Logger.error('Booth refresh error:', error);
      }
    }, BOOTH_REFRESH_INTERVAL_MS);

    Logger.debug('Auto-sync: Started (syncs every hour)');
    Logger.debug('Booth refresh: Started (refreshes every 15 min)');

    return () => {
      clearInterval(syncInterval);
      clearInterval(boothInterval);
      Logger.debug('Auto-sync: Stopped');
      Logger.debug('Booth refresh: Stopped');
    };
  }, [state.autoSyncEnabled, handleSync, handleRefreshBoothAvailability]);

  // IPC progress listener
  useEffect(() => {
    const onProgress = (_event: any, progress: ScrapeProgress) => {
      dispatch({
        type: 'SYNC_SOURCE_UPDATE',
        source: progress.source,
        patch: {
          progress: progress.progress,
          progressText: progress.status,
          status: progress.progress >= 100 ? 'synced' : 'syncing'
        }
      });
    };

    const onUpdateAvailable = (_event: any, info: { version: string }) => {
      const response = confirm(
        `🎉 New version ${info.version} is available!\n\n` +
          `You're currently on version ${packageJson.version}\n\n` +
          'Click OK to download the latest version from GitHub.'
      );
      if (response) {
        shell.openExternal('https://github.com/tyleryates/cookie-tracker/releases/latest');
        showStatus('Opening download page...', 'success');
      }
    };

    ipcRenderer.on('scrape-progress', onProgress);
    ipcRenderer.on('update-available', onUpdateAvailable);

    return () => {
      ipcRenderer.removeListener('scrape-progress', onProgress);
      ipcRenderer.removeListener('update-available', onUpdateAvailable);
    };
  }, [showStatus]);

  // Status message auto-hide effect
  useEffect(() => {
    if (!state.statusMessage || state.statusMessage.type !== 'success') return;

    const timeout = setTimeout(() => {
      dispatch({ type: 'CLEAR_STATUS' });
    }, STATUS_MESSAGE_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [state.statusMessage]);

  // --- Render ---
  return (
    <div class="container">
      <header>
        <h1>{'🍪 Girl Scout Cookie Tracker'}</h1>
        <p>Smart Cookie + Digital Cookie</p>
      </header>

      <main>
        <section class="import-section">
          <h2>Data Sync & Status</h2>
          <SyncSection
            syncState={state.syncState}
            datasets={state.datasetList}
            currentDatasetIndex={state.currentDatasetIndex}
            autoSyncEnabled={state.autoSyncEnabled}
            statusMessage={state.statusMessage}
            showSetupHint={state.showSetupHint}
            onSync={handleSync}
            onToggleAutoSync={handleToggleAutoSync}
            onDatasetChange={handleDatasetChange}
            onConfigureLogins={() => dispatch({ type: 'OPEN_MODAL' })}
            onRecalculate={handleRecalculate}
            onExport={handleExport}
            hasData={!!state.unified}
          />
        </section>

        <ReportsSection
          activeReport={state.activeReport}
          unified={state.unified}
          appConfig={state.appConfig}
          boothSyncing={state.syncState.booth.status === 'syncing'}
          onSelectReport={handleSelectReport}
          onIgnoreSlot={handleIgnoreSlot}
          onRefreshBooths={handleRefreshBoothAvailability}
        />
      </main>

      {state.modalOpen && (
        <LoginModal onClose={() => dispatch({ type: 'CLOSE_MODAL' })} onSave={handleSaveCredentials} showStatus={showStatus} />
      )}

      <footer class="app-footer">
        <span>v{packageJson.version}</span>
      </footer>
    </div>
  );
}
