// App — Root Preact component. Owns all state, delegates logic to hooks.

import { useCallback, useReducer, useRef } from 'preact/hooks';
import * as packageJson from '../../package.json';
import type { Credentials, DayFilter } from '../types';
import { type AppState, appReducer } from './app-reducer';
import { LoginModal } from './components/login-modal';
import { ReportsSection } from './components/reports-section';
import { createInitialSyncState, SyncSection } from './components/sync-section';
import { useAppInit, useAutoSync, useDataLoader, useStatusMessage, useSync } from './hooks';
import { ipcInvoke } from './ipc';

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

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Hook chain
  const { showStatus } = useStatusMessage(dispatch, state.statusMessage);
  const { loadData, recalculate, exportData, changeDataset } = useDataLoader(dispatch, showStatus, stateRef);
  const { sync, refreshBooths } = useSync(dispatch, showStatus, loadData, state.appConfig);
  useAutoSync(state.autoSyncEnabled, sync, refreshBooths);
  const { checkLoginStatus } = useAppInit(dispatch, loadData);

  // Remaining inline callbacks (too small to extract)
  const handleToggleAutoSync = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'TOGGLE_AUTO_SYNC', enabled });
      ipcInvoke('update-config', { autoSyncEnabled: enabled });
      showStatus(enabled ? 'Auto-sync enabled (syncs every hour)' : 'Auto-sync disabled', 'success');
    },
    [showStatus]
  );

  const handleSelectReport = useCallback((type: string) => {
    dispatch({ type: 'SET_ACTIVE_REPORT', report: type });
  }, []);

  const handleSaveCredentials = useCallback(
    async (_credentials: Credentials) => {
      dispatch({ type: 'CLOSE_MODAL' });
      await checkLoginStatus();
    },
    [checkLoginStatus]
  );

  const handleSaveBoothIds = useCallback(
    async (boothIds: number[]) => {
      const updatedConfig = await ipcInvoke('update-config', { boothIds });
      dispatch({ type: 'LOAD_CONFIG', config: updatedConfig });
      showStatus(`Booth selection saved (${boothIds.length} booth${boothIds.length === 1 ? '' : 's'})`, 'success');
      refreshBooths();
    },
    [showStatus, refreshBooths]
  );

  const handleSaveDayFilters = useCallback(
    async (filters: DayFilter[]) => {
      const updatedConfig = await ipcInvoke('update-config', { boothDayFilters: filters });
      dispatch({ type: 'LOAD_CONFIG', config: updatedConfig });
      showStatus('Booth day filters saved', 'success');
    },
    [showStatus]
  );

  const handleResetIgnored = useCallback(async () => {
    const config = stateRef.current.appConfig;
    if (config) {
      dispatch({ type: 'IGNORE_SLOT', config: { ...config, ignoredTimeSlots: [] } });
    }
    await ipcInvoke('update-config', { ignoredTimeSlots: [] });
    showStatus('Ignored time slots cleared', 'success');
  }, [showStatus]);

  const handleIgnoreSlot = useCallback(async (boothId: number, date: string, startTime: string) => {
    const config = stateRef.current.appConfig;
    const ignored = [...(config?.ignoredTimeSlots || []), { boothId, date, startTime }];
    if (config) {
      dispatch({ type: 'IGNORE_SLOT', config: { ...config, ignoredTimeSlots: ignored } });
    }
    await ipcInvoke('update-config', { ignoredTimeSlots: ignored });
  }, []);

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
            onSync={sync}
            onToggleAutoSync={handleToggleAutoSync}
            onDatasetChange={changeDataset}
            onConfigureLogins={() => dispatch({ type: 'OPEN_MODAL' })}
            onRecalculate={recalculate}
            onExport={exportData}
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
          onResetIgnored={handleResetIgnored}
          onRefreshBooths={refreshBooths}
          onSaveBoothIds={handleSaveBoothIds}
          onSaveDayFilters={handleSaveDayFilters}
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
