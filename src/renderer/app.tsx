// App — Root Preact component. Owns all state, delegates logic to hooks.

import { useCallback, useReducer, useRef } from 'preact/hooks';
import * as packageJson from '../../package.json';
import type { DayFilter } from '../types';
import { type AppState, appReducer } from './app-reducer';
import { ReportsSection } from './components/reports-section';
import { SettingsPage } from './components/settings-page';
import { createInitialSyncState, SyncSection } from './components/sync-section';
import { useAppInit, useDataLoader, useStatusMessage, useSync } from './hooks';
import { ipcInvoke } from './ipc';

const initialState: AppState = {
  unified: null,
  appConfig: null,
  autoSyncEnabled: false,
  activeReport: null,
  activePage: 'dashboard',
  statusMessage: null,
  syncState: createInitialSyncState()
};

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Hook chain
  const { showStatus } = useStatusMessage(dispatch, state.statusMessage);
  const { loadData, recalculate, exportData } = useDataLoader(dispatch, showStatus);
  const { sync, refreshBooths } = useSync(dispatch, showStatus, loadData, state.appConfig, state.syncState, state.autoSyncEnabled);
  useAppInit(dispatch, loadData);

  // Remaining inline callbacks (too small to extract)
  const handleToggleAutoSync = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'TOGGLE_AUTO_SYNC', enabled });
      ipcInvoke('update-config', { autoSyncEnabled: enabled });
      showStatus(enabled ? 'Auto sync enabled' : 'Auto sync disabled', 'success');
    },
    [showStatus]
  );

  const handleSelectReport = useCallback((type: string) => {
    dispatch({ type: 'SET_ACTIVE_REPORT', report: type });
  }, []);

  const handleCloseSettings = useCallback(() => {
    const wasWelcome = stateRef.current.activePage === 'welcome';
    dispatch({ type: 'CLOSE_SETTINGS' });
    if (wasWelcome) sync();
  }, [sync]);

  const handleSaveBoothIds = useCallback(
    (boothIds: number[]) => {
      const current = stateRef.current.appConfig;
      if (current) dispatch({ type: 'LOAD_CONFIG', config: { ...current, boothIds } });
      showStatus(`Booth selection saved (${boothIds.length} booth${boothIds.length === 1 ? '' : 's'})`, 'success');
      ipcInvoke('update-config', { boothIds });
      refreshBooths();
    },
    [showStatus, refreshBooths]
  );

  const handleSaveDayFilters = useCallback(
    (filters: DayFilter[]) => {
      const current = stateRef.current.appConfig;
      if (current) dispatch({ type: 'LOAD_CONFIG', config: { ...current, boothDayFilters: filters } });
      showStatus('Booth day filters saved', 'success');
      ipcInvoke('update-config', { boothDayFilters: filters });
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

  const handleWipeData = useCallback(async () => {
    await ipcInvoke('wipe-data');
    dispatch({ type: 'WIPE_DATA', syncState: createInitialSyncState() });
    showStatus('Data wiped', 'success');
  }, [showStatus]);

  const handleIgnoreSlot = useCallback(async (boothId: number, date: string, startTime: string) => {
    const config = stateRef.current.appConfig;
    const ignored = [...(config?.ignoredTimeSlots || []), { boothId, date, startTime }];
    if (config) {
      dispatch({ type: 'IGNORE_SLOT', config: { ...config, ignoredTimeSlots: ignored } });
    }
    await ipcInvoke('update-config', { ignoredTimeSlots: ignored });
  }, []);

  const handleUpdateConfig = useCallback(async (patch: Partial<import('../types').AppConfig>) => {
    const updatedConfig = await ipcInvoke('update-config', patch);
    dispatch({ type: 'LOAD_CONFIG', config: updatedConfig });
  }, []);

  if (state.activePage === 'settings' || state.activePage === 'welcome') {
    return (
      <div class="container">
        <header>
          <h1>{'\uD83C\uDF6A Girl Scout Cookie Tracker'}</h1>
          <p>Smart Cookie + Digital Cookie</p>
        </header>
        <main>
          <section class="import-section">
            <SettingsPage
              mode={state.activePage === 'welcome' ? 'welcome' : 'settings'}
              appConfig={state.appConfig}
              onBack={handleCloseSettings}
              onRecalculate={recalculate}
              onExport={exportData}
              onWipeData={handleWipeData}
              onUpdateConfig={handleUpdateConfig}
              hasData={!!state.unified}
            />
          </section>
        </main>
        <footer class="app-footer">
          <span>v{packageJson.version}</span>
        </footer>
      </div>
    );
  }

  return (
    <div class="container">
      <header>
        <h1>{'\uD83C\uDF6A Girl Scout Cookie Tracker'}</h1>
        <p>Smart Cookie + Digital Cookie</p>
      </header>

      <main>
        <section class="import-section">
          <div class="section-header-row">
            <h2>Data Sync & Status</h2>
            <button type="button" class="btn btn-secondary" onClick={() => dispatch({ type: 'OPEN_SETTINGS' })}>
              Settings
            </button>
          </div>
          <SyncSection
            syncState={state.syncState}
            autoSyncEnabled={state.autoSyncEnabled}
            statusMessage={state.statusMessage}
            onSync={sync}
            onToggleAutoSync={handleToggleAutoSync}
          />
        </section>

        <ReportsSection
          activeReport={state.activeReport}
          unified={state.unified}
          appConfig={state.appConfig}
          boothSyncing={state.syncState.endpoints['sc-booth-availability']?.status === 'syncing'}
          onSelectReport={handleSelectReport}
          onIgnoreSlot={handleIgnoreSlot}
          onResetIgnored={handleResetIgnored}
          onRefreshBooths={refreshBooths}
          onSaveBoothIds={handleSaveBoothIds}
          onSaveDayFilters={handleSaveDayFilters}
        />
      </main>

      <footer class="app-footer">
        <span>v{packageJson.version}</span>
      </footer>
    </div>
  );
}
