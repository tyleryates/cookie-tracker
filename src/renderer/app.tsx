// App — Root Preact component. Owns all state, delegates logic to hooks.

import { useCallback, useReducer, useRef } from 'preact/hooks';
import * as packageJson from '../../package.json';
import Logger from '../logger';
import type { DayFilter } from '../types';
import { type AppState, appReducer } from './app-reducer';
import { ReportContent, TabBar } from './components/reports-section';
import { SettingsPage } from './components/settings-page';
import { computeGroupStatuses, createInitialSyncState, type GroupStatus, SyncTab } from './components/sync-section';
import { DateFormatter } from './format-utils';
import { useAppInit, useDataLoader, useStatusMessage, useSync } from './hooks';
import { ipcInvoke } from './ipc';

const initialState: AppState = {
  unified: null,
  appConfig: null,
  autoSyncEnabled: false,
  autoRefreshBoothsEnabled: false,
  activeReport: null,
  activePage: 'dashboard',
  statusMessage: null,
  syncState: createInitialSyncState(),
  updateReady: null
};

// ============================================================================
// APP HEADER
// ============================================================================

function SyncPill({ label, group }: { label: string; group: GroupStatus }) {
  let statusText: string;
  let modifier = '';
  if (group.status === 'syncing') {
    statusText = 'Syncing\u2026';
    modifier = 'syncing';
  } else if (group.status === 'error') {
    statusText = 'Failed';
    modifier = 'error';
  } else if (group.lastSync) {
    statusText = DateFormatter.toFriendly(group.lastSync);
  } else {
    return null;
  }

  return (
    <span class={`sync-pill ${modifier}`}>
      <span class="sync-pill-label">{label}</span>
      <span class="sync-pill-status">{statusText}</span>
    </span>
  );
}

function AppHeader({
  syncing,
  groups,
  showBooths,
  onSync,
  onOpenSettings,
  showBackButton,
  onBack,
  isWelcome
}: {
  syncing: boolean;
  groups: ReturnType<typeof computeGroupStatuses>;
  showBooths: boolean;
  onSync: () => void;
  onOpenSettings: () => void;
  showBackButton: boolean;
  onBack: () => void;
  isWelcome: boolean;
}) {
  const showPills = !isWelcome && !showBackButton;

  return (
    <div class="app-header">
      {showBackButton && (
        <div class="app-header-actions" style={{ marginRight: '12px' }}>
          <button type="button" class="icon-btn" onClick={onBack} title="Back">
            {'\u2190'}
          </button>
        </div>
      )}
      <span class="app-header-title">
        {'\uD83C\uDF6A'} Cookie Tracker <span class="app-header-version">v{packageJson.version}</span>
      </span>
      {!isWelcome && (
        <div class="app-header-actions">
          {showPills && (
            <div class="app-header-sync-pills">
              <SyncPill label="Reports" group={groups.reports} />
              {showBooths && <SyncPill label="Booths" group={groups.booths} />}
            </div>
          )}
          {!showBackButton && (
            <button type="button" class="icon-btn has-tooltip" disabled={syncing} onClick={onSync}>
              {syncing ? <span class="spinner" /> : '\u21BB'}
              <span class="btn-tooltip">Refresh Data</span>
            </button>
          )}
          {!showBackButton && (
            <button type="button" class="icon-btn has-tooltip" onClick={onOpenSettings}>
              {'\u2699'}
              <span class="btn-tooltip">Settings</span>
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
  const { sync, refreshBooths } = useSync(
    dispatch,
    showStatus,
    loadData,
    state.appConfig,
    state.syncState,
    state.autoSyncEnabled,
    state.autoRefreshBoothsEnabled
  );
  useAppInit(dispatch, loadData);

  // Booth reset key — bumped when user re-clicks "Available Booths" tab
  const boothResetKeyRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleHeaderSync = useCallback(() => {
    sync();
    if (state.appConfig?.availableBoothsEnabled) refreshBooths();
  }, [sync, refreshBooths, state.appConfig?.availableBoothsEnabled]);

  const handleToggleAutoSync = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'TOGGLE_AUTO_SYNC', enabled });
      ipcInvoke('update-config', { autoSyncEnabled: enabled });
      showStatus(enabled ? 'Auto sync enabled' : 'Auto sync disabled', 'success');
    },
    [showStatus]
  );

  const handleToggleAutoRefreshBooths = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'TOGGLE_AUTO_REFRESH_BOOTHS', enabled });
      ipcInvoke('update-config', { autoRefreshBoothsEnabled: enabled });
      showStatus(enabled ? 'Auto refresh booths enabled' : 'Auto refresh booths disabled', 'success');
    },
    [showStatus]
  );

  const handleSelectReport = useCallback((type: string) => {
    if (type === 'available-booths' && stateRef.current.activeReport === 'available-booths') {
      boothResetKeyRef.current += 1;
    }
    dispatch({ type: 'SET_ACTIVE_REPORT', report: type });
    contentRef.current?.scrollTo(0, 0);
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

  const handleResetNotified = useCallback(() => {
    dispatch({ type: 'UPDATE_CONFIG', patch: { boothNotifiedSlots: [] } });
    ipcInvoke('update-config', { boothNotifiedSlots: [] });
    showStatus('Message notifications reset', 'success');
  }, [showStatus]);

  const handleWipeData = useCallback(async () => {
    await ipcInvoke('wipe-data');
    dispatch({ type: 'WIPE_DATA', syncState: createInitialSyncState() });
    showStatus('Data wiped', 'success');
  }, [showStatus]);

  const handleIgnoreSlot = useCallback(async (boothId: number, date: string, startTime: string) => {
    const config = stateRef.current.appConfig;
    const ignored = [...(config?.ignoredTimeSlots || []), `${boothId}|${date}|${startTime}`];
    if (config) {
      dispatch({ type: 'IGNORE_SLOT', config: { ...config, ignoredTimeSlots: ignored } });
    }
    await ipcInvoke('update-config', { ignoredTimeSlots: ignored });
  }, []);

  const handleUpdateConfig = useCallback((patch: Partial<import('../types').AppConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', patch });
    ipcInvoke('update-config', patch);
  }, []);

  const groups = computeGroupStatuses(state.syncState.endpoints, state.syncState);
  const isSettings = state.activePage === 'settings';
  const isWelcome = state.activePage === 'welcome';

  return (
    <div class="app-shell">
      {state.updateReady && (
        <div class="update-banner">
          Version {state.updateReady} downloaded —{' '}
          <button
            type="button"
            class="update-banner-btn"
            onClick={() => {
              Logger.info('User clicked Restart to update');
              ipcInvoke('quit-and-install').catch((e) => Logger.error('quit-and-install IPC failed:', e));
            }}
          >
            Restart to update
          </button>
        </div>
      )}
      <AppHeader
        syncing={state.syncState.syncing}
        groups={groups}
        showBooths={!!state.appConfig?.availableBoothsEnabled}
        onSync={handleHeaderSync}
        onOpenSettings={() => dispatch({ type: 'OPEN_SETTINGS' })}
        showBackButton={isSettings}
        onBack={handleCloseSettings}
        isWelcome={isWelcome}
      />
      {!isSettings && !isWelcome && (
        <TabBar activeReport={state.activeReport} unified={state.unified} appConfig={state.appConfig} onSelectReport={handleSelectReport} />
      )}
      <div class="app-content" ref={contentRef}>
        {isSettings || isWelcome ? (
          <SettingsPage
            mode={isWelcome ? 'welcome' : 'settings'}
            appConfig={state.appConfig}
            autoSyncEnabled={state.autoSyncEnabled}
            autoRefreshBoothsEnabled={state.autoRefreshBoothsEnabled}
            onBack={handleCloseSettings}
            onUpdateConfig={handleUpdateConfig}
            onToggleAutoSync={handleToggleAutoSync}
            onToggleAutoRefreshBooths={handleToggleAutoRefreshBooths}
          />
        ) : state.activeReport === 'sync' ? (
          <SyncTab
            syncState={state.syncState}
            availableBoothsEnabled={!!state.appConfig?.availableBoothsEnabled}
            onSyncReports={sync}
            onRefreshBooths={refreshBooths}
            onRecalculate={recalculate}
            onExport={exportData}
            onWipeData={handleWipeData}
            hasData={!!state.unified}
          />
        ) : (
          <ReportContent
            activeReport={state.activeReport}
            unified={state.unified}
            appConfig={state.appConfig}
            boothSyncState={state.syncState.endpoints['sc-booth-availability'] || { status: 'idle', lastSync: null }}
            boothResetKey={boothResetKeyRef.current}
            onIgnoreSlot={handleIgnoreSlot}
            onResetIgnored={handleResetIgnored}
            onResetNotified={handleResetNotified}
            onRefreshBooths={refreshBooths}
            onSaveBoothIds={handleSaveBoothIds}
            onSaveDayFilters={handleSaveDayFilters}
          />
        )}
      </div>
      {state.statusMessage && (
        <div class="toast-container">
          <div class={`toast ${state.statusMessage.type}`}>{state.statusMessage.msg}</div>
        </div>
      )}
    </div>
  );
}
