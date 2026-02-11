// App — Root Preact component. Owns all state, effects, and callbacks.

import { ipcRenderer } from 'electron';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import * as packageJson from '../../package.json';
import { normalizeBoothLocation } from '../data-processing/data-importers';
import { createDataStore, type DataStore } from '../data-store';
import Logger from '../logger';
import type { AppConfig, Credentials, ScrapeProgress } from '../types';
import { LoginModal } from './components/login-modal';
import { ReportsSection } from './components/reports-section';
import { createInitialSyncState, SyncSection, type SyncState } from './components/sync-section';
import { type DatasetEntry, exportUnifiedDataset, loadAppConfig, loadDataFromDisk, saveUnifiedDatasetToDisk } from './data-loader';

// ============================================================================
// CONSTANTS
// ============================================================================

const AUTO_SYNC_INTERVAL_MS = 3600000; // 1 hour
const BOOTH_REFRESH_INTERVAL_MS = 900000; // 15 minutes
const STATUS_MESSAGE_TIMEOUT_MS = 5000;

// ============================================================================
// APP COMPONENT
// ============================================================================

export function App() {
  // --- State ---
  const [store, setStore] = useState<DataStore>(() => createDataStore());
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [datasetList, setDatasetList] = useState<DatasetEntry[]>([]);
  const [currentDatasetIndex, setCurrentDatasetIndex] = useState(0);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ msg: string; type: string } | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(createInitialSyncState);
  const [showSetupHint, setShowSetupHint] = useState(false);

  // Refs for stable callback references
  const storeRef = useRef(store);
  storeRef.current = store;
  const appConfigRef = useRef(appConfig);
  appConfigRef.current = appConfig;

  // --- Helpers ---
  const showStatus = useCallback((msg: string, type: string) => {
    setStatusMessage({ msg, type });
  }, []);

  const checkLoginStatus = useCallback(async () => {
    try {
      const result = await ipcRenderer.invoke('load-credentials');
      if (result.success && result.credentials) {
        const dc = result.credentials.digitalCookie;
        const sc = result.credentials.smartCookie;
        setShowSetupHint(!(dc.username && dc.password && sc.username && sc.password));
      } else {
        setShowSetupHint(true);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  // --- Core data operations ---
  const doLoadDataFromDisk = useCallback(
    async (opts?: { specificSc?: any; specificDc?: any; showMessages?: boolean }) => {
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

        setStore(result.store);
        setDatasetList(result.datasetList);
        if (!opts?.specificSc && !opts?.specificDc) {
          setCurrentDatasetIndex(0);
        }

        // Update sync timestamps from loaded files
        if (result.loaded.scTimestamp) {
          setSyncState((prev) => ({
            ...prev,
            sc: { ...prev.sc, status: 'synced', lastSync: result.loaded.scTimestamp }
          }));
        }
        if (result.loaded.dcTimestamp) {
          setSyncState((prev) => ({
            ...prev,
            dc: { ...prev.dc, status: 'synced', lastSync: result.loaded.dcTimestamp }
          }));
        }

        const anyLoaded = result.loaded.sc || result.loaded.dc || result.loaded.scReport || result.loaded.scTransfer;

        if (anyLoaded) {
          await saveUnifiedDatasetToDisk(result.store);
          // Auto-select troop report on first load if no report active
          setActiveReport((prev) => prev || 'troop');
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
      setSyncState((prev) => ({
        ...prev,
        syncing: true,
        dc: { ...prev.dc, status: 'syncing', progress: 0, progressText: 'Starting...' },
        sc: { ...prev.sc, status: 'syncing', progress: 0, progressText: 'Starting...' }
      }));

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
          setSyncState((prev) => ({ ...prev, [key]: { ...prev[key], status: 'synced', lastSync: now, progress: 100 } }));
          parts.push(`${label} downloaded`);
        } else {
          setSyncState((prev) => ({ ...prev, [key]: { ...prev[key], status: 'error', errorMessage: sourceResult.error } }));
          if (sourceResult.error) errors.push(`${label}: ${sourceResult.error}`);
        }
      }

      if (result.error) errors.push(result.error);

      if (result.success && parts.length > 0) {
        showStatus(`✅ Sync complete! ${parts.join(', ')}`, 'success');
        await doLoadDataFromDisk({ showMessages: false });
      } else if (errors.length > 0) {
        showStatus(`Sync failed: ${errors.join('; ')}`, 'error');
      } else {
        showStatus('Sync completed with warnings', 'warning');
      }
    } catch (error) {
      showStatus(`Error: ${(error as Error).message}`, 'error');
      Logger.error(error);
    } finally {
      setSyncState((prev) => ({ ...prev, syncing: false }));
    }
  }, [showStatus, doLoadDataFromDisk]);

  // --- Booth refresh ---
  const handleRefreshBoothAvailability = useCallback(async () => {
    try {
      showStatus('Refreshing booth availability...', 'success');
      setSyncState((prev) => ({
        ...prev,
        booth: { ...prev.booth, status: 'syncing' }
      }));

      const result = await ipcRenderer.invoke('refresh-booth-locations');
      if (!result?.success) {
        Logger.error('Booth availability refresh failed:', result?.error);
        showStatus(`Booth refresh failed: ${result?.error || 'Unknown error'}`, 'error');
        setSyncState((prev) => ({
          ...prev,
          booth: { ...prev.booth, status: 'error', errorMessage: result?.error }
        }));
        return;
      }

      const rawLocations: any[] = result.data || [];
      const updated = rawLocations.map(normalizeBoothLocation);

      setStore((prev) => {
        const next = { ...prev, boothLocations: updated };
        if (next.unified) {
          next.unified = { ...next.unified, boothLocations: updated };
        }
        return next;
      });

      const now = new Date().toISOString();
      setSyncState((prev) => ({
        ...prev,
        booth: { ...prev.booth, status: 'synced', lastSync: now }
      }));
      ipcRenderer.invoke('update-config', { lastBoothSync: now });
      showStatus(`✅ Booth availability refreshed (${updated.length} locations)`, 'success');
    } catch (error) {
      Logger.error('Booth availability refresh failed:', error);
      showStatus(`Booth refresh error: ${(error as Error).message}`, 'error');
      setSyncState((prev) => ({
        ...prev,
        booth: { ...prev.booth, status: 'error' }
      }));
    }
  }, [showStatus]);

  // --- Callbacks ---
  const handleToggleAutoSync = useCallback(
    (enabled: boolean) => {
      setAutoSyncEnabled(enabled);
      ipcRenderer.invoke('update-config', { autoSyncEnabled: enabled });
      showStatus(enabled ? 'Auto-sync enabled (syncs every hour)' : 'Auto-sync disabled', 'success');
    },
    [showStatus]
  );

  const handleDatasetChange = useCallback(
    async (index: number) => {
      if (index === currentDatasetIndex || !datasetList[index]) return;
      setCurrentDatasetIndex(index);
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
    [currentDatasetIndex, datasetList, showStatus, doLoadDataFromDisk]
  );

  const handleSelectReport = useCallback((type: string) => {
    setActiveReport(type);
  }, []);

  const handleExport = useCallback(() => {
    if (!storeRef.current.unified) {
      alert('No unified dataset available to export.');
      return;
    }
    exportUnifiedDataset(storeRef.current);
  }, []);

  const handleRecalculate = useCallback(() => {
    doLoadDataFromDisk({ showMessages: true });
  }, [doLoadDataFromDisk]);

  const handleSaveCredentials = useCallback(
    async (_credentials: Credentials) => {
      setModalOpen(false);
      await checkLoginStatus();
    },
    [checkLoginStatus]
  );

  const handleIgnoreSlot = useCallback(async (boothId: number, date: string, startTime: string) => {
    const config = appConfigRef.current;
    const ignored = [...(config?.ignoredTimeSlots || []), { boothId, date, startTime }];
    if (config) {
      const updated = { ...config, ignoredTimeSlots: ignored };
      setAppConfig(updated);
    }
    await ipcRenderer.invoke('update-config', { ignoredTimeSlots: ignored });
    // Re-render available-booths report happens automatically via state change
  }, []);

  // --- Effects ---

  // Init effect
  useEffect(() => {
    (async () => {
      const config = await loadAppConfig();
      setAppConfig(config);
      setAutoSyncEnabled(config.autoSyncEnabled ?? true);
      if (config.lastBoothSync) {
        setSyncState((prev) => ({
          ...prev,
          booth: { ...prev.booth, status: 'synced', lastSync: config.lastBoothSync }
        }));
      }
      await doLoadDataFromDisk({ showMessages: false });
      await checkLoginStatus();
    })();
  }, []);

  // Auto-sync effect
  useEffect(() => {
    if (!autoSyncEnabled) return;

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
  }, [autoSyncEnabled, handleSync, handleRefreshBoothAvailability]);

  // IPC progress listener
  useEffect(() => {
    const onProgress = (_event: any, progress: ScrapeProgress) => {
      setSyncState((prev) => ({
        ...prev,
        [progress.source]: {
          ...prev[progress.source],
          progress: progress.progress,
          progressText: progress.status,
          status: progress.progress >= 100 ? 'synced' : 'syncing'
        }
      }));
    };

    const onUpdateAvailable = (_event: any, info: { version: string }) => {
      const response = confirm(
        `🎉 New version ${info.version} is available!\n\n` +
          `You're currently on version ${packageJson.version}\n\n` +
          'Click OK to download the latest version from GitHub.'
      );
      if (response) {
        require('electron').shell.openExternal('https://github.com/tyleryates/cookie-tracker/releases/latest');
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
    if (!statusMessage || statusMessage.type !== 'success') return;

    const timeout = setTimeout(() => {
      setStatusMessage(null);
    }, STATUS_MESSAGE_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [statusMessage]);

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
            syncState={syncState}
            datasets={datasetList}
            currentDatasetIndex={currentDatasetIndex}
            autoSyncEnabled={autoSyncEnabled}
            statusMessage={statusMessage}
            showSetupHint={showSetupHint}
            onSync={handleSync}
            onToggleAutoSync={handleToggleAutoSync}
            onDatasetChange={handleDatasetChange}
            onConfigureLogins={() => setModalOpen(true)}
            onRecalculate={handleRecalculate}
            onExport={handleExport}
            hasData={!!store.unified}
          />
        </section>

        <ReportsSection
          activeReport={activeReport}
          store={store}
          appConfig={appConfig}
          onSelectReport={handleSelectReport}
          onIgnoreSlot={handleIgnoreSlot}
          onRefreshBooths={handleRefreshBoothAvailability}
        />
      </main>

      {modalOpen && <LoginModal onClose={() => setModalOpen(false)} onSave={handleSaveCredentials} showStatus={showStatus} />}

      <footer class="app-footer">
        <span>v{packageJson.version}</span>
      </footer>
    </div>
  );
}
