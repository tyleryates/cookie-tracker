// App — Root Preact component. Owns all state, delegates logic to hooks.

import { useCallback, useReducer, useRef } from 'preact/hooks';
import type { DayFilter } from '../types';
import { type AppState, appReducer } from './app-reducer';
import { ReportContent, TabBar } from './components/reports-section';
import { SettingsPage } from './components/settings-page';
import { computeOverallStatus, createInitialSyncState, SyncTab } from './components/sync-section';
import { DateFormatter } from './format-utils';
import { useAppInit, useDataLoader, useStatusMessage, useSync } from './hooks';
import { ipcInvoke } from './ipc';

const initialState: AppState = {
  unified: null,
  appConfig: null,
  autoSyncEnabled: false,
  activeReport: null,
  activePage: 'dashboard',
  statusMessage: null,
  syncState: createInitialSyncState(),
  updateReady: null
};

// ============================================================================
// APP HEADER
// ============================================================================

function AppHeader({
  syncing,
  overallStatus,
  onSync,
  onOpenSettings,
  showBackButton,
  onBack,
  isWelcome
}: {
  syncing: boolean;
  overallStatus: ReturnType<typeof computeOverallStatus>;
  onSync: () => void;
  onOpenSettings: () => void;
  showBackButton: boolean;
  onBack: () => void;
  isWelcome: boolean;
}) {
  let syncStatusText = '';
  if (!isWelcome && !showBackButton) {
    if (overallStatus.status === 'syncing') {
      syncStatusText = `Syncing\u2026 (${overallStatus.syncedCount}/${overallStatus.total})`;
    } else if (overallStatus.lastSync) {
      syncStatusText = DateFormatter.toFriendly(overallStatus.lastSync);
    }
  }

  return (
    <div class="app-header">
      {showBackButton && (
        <div class="app-header-actions" style={{ marginRight: '12px' }}>
          <button type="button" class="icon-btn" onClick={onBack} title="Back">
            {'\u2190'}
          </button>
        </div>
      )}
      <span class="app-header-title">{'\uD83C\uDF6A'} Cookie Tracker</span>
      {!isWelcome && (
        <div class="app-header-actions">
          {syncStatusText && <span class="app-header-sync-status">{syncStatusText}</span>}
          {!showBackButton && (
            <button type="button" class="icon-btn" disabled={syncing} onClick={onSync} title="Sync now">
              {syncing ? <span class="spinner" /> : '\u21BB'}
            </button>
          )}
          {!showBackButton && (
            <button type="button" class="icon-btn" onClick={onOpenSettings} title="Settings">
              {'\u2699'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// APP
// ============================================================================

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Hook chain
  const { showStatus } = useStatusMessage(dispatch, state.statusMessage);
  const { loadData, recalculate, exportData } = useDataLoader(dispatch, showStatus);
  const { sync, refreshBooths } = useSync(dispatch, showStatus, loadData, state.appConfig, state.syncState, state.autoSyncEnabled);
  useAppInit(dispatch, loadData);

  // Booth reset key — bumped when user re-clicks "Available Booths" tab
  const boothResetKeyRef = useRef(0);

  const handleToggleAutoSync = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'TOGGLE_AUTO_SYNC', enabled });
      ipcInvoke('update-config', { autoSyncEnabled: enabled });
      showStatus(enabled ? 'Auto sync enabled' : 'Auto sync disabled', 'success');
    },
    [showStatus]
  );

  const handleSelectReport = useCallback((type: string) => {
    if (type === 'available-booths' && stateRef.current.activeReport === 'available-booths') {
      boothResetKeyRef.current += 1;
    }
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

  const overall = computeOverallStatus(state.syncState.endpoints);
  const isSettings = state.activePage === 'settings';
  const isWelcome = state.activePage === 'welcome';

  return (
    <div class="app-shell">
      <AppHeader
        syncing={state.syncState.syncing}
        overallStatus={overall}
        onSync={sync}
        onOpenSettings={() => dispatch({ type: 'OPEN_SETTINGS' })}
        showBackButton={isSettings}
        onBack={handleCloseSettings}
        isWelcome={isWelcome}
      />
      {!isSettings && !isWelcome && (
        <TabBar activeReport={state.activeReport} unified={state.unified} appConfig={state.appConfig} onSelectReport={handleSelectReport} />
      )}
      <div class="app-content">
        {isSettings || isWelcome ? (
          <SettingsPage
            mode={isWelcome ? 'welcome' : 'settings'}
            appConfig={state.appConfig}
            onBack={handleCloseSettings}
            onRecalculate={recalculate}
            onExport={exportData}
            onWipeData={handleWipeData}
            onUpdateConfig={handleUpdateConfig}
            hasData={!!state.unified}
          />
        ) : state.activeReport === 'sync' ? (
          <SyncTab
            syncState={state.syncState}
            autoSyncEnabled={state.autoSyncEnabled}
            onSync={sync}
            onToggleAutoSync={handleToggleAutoSync}
          />
        ) : (
          <ReportContent
            activeReport={state.activeReport}
            unified={state.unified}
            appConfig={state.appConfig}
            boothSyncing={state.syncState.endpoints['sc-booth-availability']?.status === 'syncing'}
            boothResetKey={boothResetKeyRef.current}
            onIgnoreSlot={handleIgnoreSlot}
            onResetIgnored={handleResetIgnored}
            onRefreshBooths={refreshBooths}
            onSaveBoothIds={handleSaveBoothIds}
            onSaveDayFilters={handleSaveDayFilters}
          />
        )}
      </div>
      {state.updateReady && (
        <div class="update-banner">
          Version {state.updateReady} downloaded —{' '}
          <button type="button" class="update-banner-btn" onClick={() => ipcInvoke('quit-and-install')}>
            Restart to update
          </button>
        </div>
      )}
      {state.statusMessage && (
        <div class="toast-container">
          <div class={`toast ${state.statusMessage.type}`}>{state.statusMessage.msg}</div>
        </div>
      )}
    </div>
  );
}
