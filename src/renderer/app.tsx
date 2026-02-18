// App — Root Preact component. Owns all state, delegates logic to hooks.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import * as packageJson from '../../package.json';
import Logger from '../logger';
import { type AppConfig, type ProfilesConfig, toActiveProfile, type UnifiedDataset } from '../types';
import { type AppState, appReducer } from './app-reducer';
import { ReportContent, TabBar } from './components/reports-section';
import { SettingsPage } from './components/settings-page';
import { computeGroupStatuses, createInitialSyncState, type GroupStatus, SyncTab } from './components/sync-section';
import { loadAppConfig } from './data-loader';
import { countBoothsNeedingDistribution, DateFormatter } from './format-utils';
import { useAppInit, useDataLoader, useStatusMessage, useSync } from './hooks';
import { ipcInvoke } from './ipc';
import { encodeSlotKey, summarizeAvailableSlots } from './reports/available-booths-utils';

const initialState: AppState = {
  unified: null,
  appConfig: null,
  autoSyncEnabled: false,
  autoRefreshBoothsEnabled: false,
  activeReport: null,
  activePage: 'dashboard',
  statusMessage: null,
  syncState: createInitialSyncState(),
  updateReady: null,
  activeProfile: null,
  profiles: []
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

interface Alert {
  message: string;
  report: string;
}

function computeAlerts(unified: UnifiedDataset | null, appConfig: AppConfig | null): Alert[] {
  if (!unified) return [];
  const alerts: Alert[] = [];

  const hasUnallocated =
    unified.siteOrders?.directShip?.hasWarning || unified.siteOrders?.girlDelivery?.hasWarning || unified.siteOrders?.boothSale?.hasWarning;
  if (hasUnallocated) alerts.push({ message: 'Unallocated troop orders', report: 'troop-sales' });

  if (countBoothsNeedingDistribution(unified.boothReservations || []) > 0)
    alerts.push({ message: 'Booths need distribution', report: 'completed-booths' });

  if ((unified.troopTotals?.scouts?.withNegativeInventory ?? 0) > 0)
    alerts.push({ message: 'Scouts are missing cookies', report: 'scout-inventory' });

  if (unified.cookieShare?.reconciled === false) alerts.push({ message: 'Donations need adjustment', report: 'donation-alert' });

  if (appConfig?.availableBoothsEnabled) {
    const filters = appConfig.boothDayFilters || [];
    const ignored = appConfig.ignoredTimeSlots || [];
    const availableSlots = summarizeAvailableSlots(unified.boothLocations || [], filters, ignored).reduce((sum, b) => sum + b.slotCount, 0);
    if (availableSlots > 0) alerts.push({ message: `${availableSlots} open booth slots`, report: 'available-booths' });
  }

  return alerts;
}

function AlertBadge({
  unified,
  appConfig,
  onSelectReport
}: {
  unified: UnifiedDataset | null;
  appConfig: AppConfig | null;
  onSelectReport: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const alerts = computeAlerts(unified, appConfig);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (alerts.length === 0) return null;

  return (
    <div class="alert-badge-wrapper" ref={wrapperRef}>
      <button type="button" class="alert-badge-btn" onClick={() => setOpen(!open)}>
        {'\u26A0'} {alerts.length}
      </button>
      {open && (
        <div class="alert-dropdown">
          {alerts.map((a) => (
            <button
              type="button"
              key={a.report + a.message}
              class="alert-dropdown-item"
              onClick={() => {
                onSelectReport(a.report);
                setOpen(false);
              }}
            >
              {'\u26A0\uFE0F'} {a.message}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AppHeader({
  syncing,
  readOnly,
  groups,
  showBooths,
  unified,
  appConfig,
  settingsActive,
  onSync,
  onOpenSettings,
  onSelectReport,
  isWelcome
}: {
  syncing: boolean;
  readOnly: boolean;
  groups: ReturnType<typeof computeGroupStatuses>;
  showBooths: boolean;
  unified: UnifiedDataset | null;
  appConfig: AppConfig | null;
  settingsActive: boolean;
  onSync: () => void;
  onOpenSettings: () => void;
  onSelectReport: (type: string) => void;
  isWelcome: boolean;
}) {
  return (
    <div class="app-header">
      <span class="app-header-title">
        {'\uD83C\uDF6A'} Cookie Tracker <span class="app-header-version">v{packageJson.version}</span>
      </span>
      {!isWelcome && (
        <div class="app-header-actions">
          <div class="app-header-sync-pills">
            <SyncPill label="Reports" group={groups.reports} />
            {showBooths && <SyncPill label="Booths" group={groups.booths} />}
          </div>
          <AlertBadge unified={unified} appConfig={appConfig} onSelectReport={onSelectReport} />
          <button type="button" class="icon-btn has-tooltip" disabled={syncing || readOnly} onClick={onSync}>
            {syncing ? <span class="spinner" /> : '\u21BB'}
            <span class="btn-tooltip">Refresh Data</span>
          </button>
          <button type="button" class={`icon-btn has-tooltip${settingsActive ? ' active' : ''}`} onClick={onOpenSettings}>
            {'\u2699'}
            <span class="btn-tooltip">Settings</span>
          </button>
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

  const handleWelcomeComplete = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_REPORT', report: 'inventory' });
    sync();
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
    (filters: string[]) => {
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
    const ignored = [...(config?.ignoredTimeSlots || []), encodeSlotKey(boothId, date, startTime)];
    if (config) {
      dispatch({ type: 'IGNORE_SLOT', config: { ...config, ignoredTimeSlots: ignored } });
    }
    await ipcInvoke('update-config', { ignoredTimeSlots: ignored });
  }, []);

  const handleUpdateConfig = useCallback((patch: Partial<AppConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', patch });
    ipcInvoke('update-config', patch);
  }, []);

  const dispatchProfiles = useCallback(
    (pc: ProfilesConfig) => {
      const active = pc.profiles.find((p) => p.dirName === pc.activeProfile);
      if (active) {
        dispatch({ type: 'SET_PROFILES', profiles: pc.profiles, activeProfile: toActiveProfile(active) });
      }
    },
    [dispatch]
  );

  const reloadAfterSwitch = useCallback(async () => {
    dispatch({ type: 'WIPE_DATA', syncState: createInitialSyncState() });

    // Hydrate the new profile's endpoint timestamps
    try {
      const timestamps = await ipcInvoke('load-timestamps');
      for (const [endpoint, meta] of Object.entries(timestamps.endpoints)) {
        dispatch({
          type: 'SYNC_ENDPOINT_UPDATE',
          endpoint,
          status: meta.status,
          lastSync: meta.lastSync ?? undefined,
          durationMs: meta.durationMs,
          dataSize: meta.dataSize,
          httpStatus: meta.httpStatus,
          error: meta.error
        });
      }
    } catch {
      // Non-fatal — endpoints start as idle
    }

    const config = await loadAppConfig();
    dispatch({ type: 'LOAD_CONFIG', config });
    await loadData({ showMessages: false });
  }, [dispatch, loadData]);

  const handleSwitchProfile = useCallback(
    async (dirName: string) => {
      try {
        const pc = await ipcInvoke('switch-profile', { dirName });
        dispatchProfiles(pc);
        await reloadAfterSwitch();
        showStatus(`Switched to profile: ${pc.profiles.find((p) => p.dirName === dirName)?.name || dirName}`, 'success');
      } catch (error) {
        showStatus(`Profile switch failed: ${(error as Error).message}`, 'error');
      }
    },
    [dispatchProfiles, reloadAfterSwitch, showStatus]
  );

  const handleImportProfile = useCallback(
    async (name: string) => {
      try {
        const pc = await ipcInvoke('import-profile', { name });
        if (!pc) return; // user cancelled file dialog
        // Switch to the newly imported profile (dispatches profiles + reloads data)
        const imported = pc.profiles.find((p) => p.name === name);
        if (imported) {
          await handleSwitchProfile(imported.dirName);
        } else {
          dispatchProfiles(pc);
        }
        showStatus(`Profile "${name}" imported`, 'success');
      } catch (error) {
        showStatus(`Import failed: ${(error as Error).message}`, 'error');
      }
    },
    [dispatchProfiles, handleSwitchProfile, showStatus]
  );

  const handleDeleteProfile = useCallback(
    async (dirName: string) => {
      try {
        const wasActive = stateRef.current.activeProfile?.dirName === dirName;
        const pc = await ipcInvoke('delete-profile', { dirName });
        dispatchProfiles(pc);
        if (wasActive) await reloadAfterSwitch();
        showStatus('Profile deleted', 'success');
      } catch (error) {
        showStatus(`Delete failed: ${(error as Error).message}`, 'error');
      }
    },
    [dispatchProfiles, reloadAfterSwitch, showStatus]
  );

  const groups = useMemo(() => computeGroupStatuses(state.syncState.endpoints, state.syncState), [state.syncState]);
  const isWelcome = state.activePage === 'welcome';
  const readOnly = !!state.activeProfile && !state.activeProfile.isDefault;

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
        readOnly={readOnly}
        groups={groups}
        showBooths={!!state.appConfig?.availableBoothsEnabled}
        unified={state.unified}
        appConfig={state.appConfig}
        settingsActive={state.activeReport === 'settings'}
        onSync={handleHeaderSync}
        onOpenSettings={() => handleSelectReport('settings')}
        onSelectReport={handleSelectReport}
        isWelcome={isWelcome}
      />
      {!isWelcome && (
        <TabBar activeReport={state.activeReport} unified={state.unified} appConfig={state.appConfig} onSelectReport={handleSelectReport} />
      )}
      <div class="app-content" ref={contentRef}>
        {isWelcome || state.activeReport === 'settings' ? (
          <SettingsPage
            mode={isWelcome ? 'welcome' : 'settings'}
            appConfig={state.appConfig}
            autoSyncEnabled={state.autoSyncEnabled}
            autoRefreshBoothsEnabled={state.autoRefreshBoothsEnabled}
            readOnly={readOnly}
            onComplete={isWelcome ? handleWelcomeComplete : undefined}
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
            readOnly={readOnly}
            activeProfile={state.activeProfile}
            profiles={state.profiles}
            onSwitchProfile={handleSwitchProfile}
            onImportProfile={handleImportProfile}
            onDeleteProfile={handleDeleteProfile}
          />
        ) : (
          <ReportContent
            activeReport={state.activeReport}
            unified={state.unified}
            appConfig={state.appConfig}
            boothSyncState={state.syncState.endpoints['sc-booth-availability'] || { status: 'idle', lastSync: null }}
            boothResetKey={boothResetKeyRef.current}
            readOnly={readOnly}
            onIgnoreSlot={handleIgnoreSlot}
            onResetIgnored={handleResetIgnored}
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
