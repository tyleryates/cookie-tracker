// App — Root Preact component. Owns all state, delegates logic to hooks.
// Sub-components (WelcomeContent, SettingsContent, MainContent) extract JSX
// but remain in this file since they're tightly coupled to App state.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'preact/hooks';
import Logger from '../logger';
import type {
  ActiveProfile,
  AppConfig,
  EndpointSyncState,
  HealthChecks,
  ProfileInfo,
  ProfilesConfig,
  SyncState,
  UnifiedDataset,
  Warning
} from '../types';
import { toActiveProfile } from '../types';
import { type AppState, appReducer } from './app-reducer';
import { AppHeader } from './components/app-header';
import { ReportContent, TabBar } from './components/reports-section';
import { SettingsPage, SettingsToggles } from './components/settings-page';
import { computeGroupStatuses, createInitialSyncState, DataHealthChecks, SyncStatusSection } from './components/sync-section';
import { loadAppConfig } from './data-loader';
import { countBoothsNeedingDistribution, getActiveScouts } from './format-utils';
import { useAppInit, useDataLoader, useStatusMessage, useSync } from './hooks';
import { ipcInvoke } from './ipc';
import { encodeSlotKey, summarizeAvailableSlots } from './reports/available-booths-utils';
import { HealthCheckReport } from './reports/health-check';

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
// WELCOME CONTENT
// ============================================================================

function WelcomeContent({ onComplete }: { onComplete: () => void }) {
  return (
    <div class="welcome-page">
      <SettingsPage mode="welcome" onComplete={onComplete} />
    </div>
  );
}

// ============================================================================
// SETTINGS CONTENT
// ============================================================================

interface SettingsContentProps {
  appConfig: AppConfig | null;
  readOnly: boolean;
  onUpdateConfig: (patch: Partial<AppConfig>) => void;
  activeProfile: ActiveProfile | null;
  profiles: ProfileInfo[];
  onSwitchProfile: (dirName: string) => void;
  onDeleteProfile: (dirName: string) => void;
  onExport: () => void;
  hasData: boolean;
  syncState: SyncState;
  availableBoothsEnabled: boolean;
  autoSyncEnabled: boolean;
  autoRefreshBoothsEnabled: boolean;
  onSyncReports: () => void;
  onRefreshBooths: () => void;
  onToggleAutoSync: (enabled: boolean) => void;
  onToggleAutoRefreshBooths: (enabled: boolean) => void;
  healthChecks: HealthChecks | undefined;
  warnings: Warning[];
}

function SettingsContent({
  appConfig,
  readOnly,
  onUpdateConfig,
  activeProfile,
  profiles,
  onSwitchProfile,
  onDeleteProfile,
  onExport,
  hasData,
  syncState,
  availableBoothsEnabled,
  autoSyncEnabled,
  autoRefreshBoothsEnabled,
  onSyncReports,
  onRefreshBooths,
  onToggleAutoSync,
  onToggleAutoRefreshBooths,
  healthChecks,
  warnings
}: SettingsContentProps) {
  return (
    <div class="report-visual sync-tab">
      <SettingsToggles
        appConfig={appConfig}
        readOnly={readOnly}
        onUpdateConfig={onUpdateConfig}
        activeProfile={activeProfile}
        profiles={profiles}
        onSwitchProfile={onSwitchProfile}
        onDeleteProfile={onDeleteProfile}
        onExport={onExport}
        hasData={hasData}
      />
      <SettingsPage mode="settings" />
      <SyncStatusSection
        syncState={syncState}
        availableBoothsEnabled={availableBoothsEnabled}
        autoSyncEnabled={autoSyncEnabled}
        autoRefreshBoothsEnabled={autoRefreshBoothsEnabled}
        onSyncReports={onSyncReports}
        onRefreshBooths={onRefreshBooths}
        onToggleAutoSync={onToggleAutoSync}
        onToggleAutoRefreshBooths={onToggleAutoRefreshBooths}
        readOnly={readOnly}
      />
      {healthChecks && <DataHealthChecks healthChecks={healthChecks} warnings={warnings} />}
    </div>
  );
}

// ============================================================================
// MAIN CONTENT
// ============================================================================

interface MainContentProps {
  activeReport: string | null;
  unified: UnifiedDataset | null;
  appConfig: AppConfig | null;
  syncing: boolean;
  boothSyncState: EndpointSyncState;
  boothResetKey: number;
  readOnly: boolean;
  availableSlotCount: number;
  onSelectReport: (type: string) => void;
  onIgnoreSlot: (boothId: number, date: string, startTime: string) => void;
  onResetIgnored: () => void;
  onRefreshBooths: () => void;
  onSaveBoothIds: (ids: number[]) => void;
  onSaveDayFilters: (filters: string[]) => void;
}

function MainContent({
  activeReport,
  unified,
  appConfig,
  syncing,
  boothSyncState,
  boothResetKey,
  readOnly,
  availableSlotCount,
  onSelectReport,
  onIgnoreSlot,
  onResetIgnored,
  onRefreshBooths,
  onSaveBoothIds,
  onSaveDayFilters
}: MainContentProps) {
  if (!unified && syncing) {
    return (
      <div class="loading-state">
        <span class="loading-spinner" />
        <p>Loading initial reports...</p>
      </div>
    );
  }
  if (activeReport === 'health-check' && unified) {
    return <HealthCheckReport data={unified} availableSlotCount={availableSlotCount} onNavigate={onSelectReport} />;
  }
  return (
    <ReportContent
      activeReport={activeReport}
      unified={unified}
      appConfig={appConfig}
      boothSyncState={boothSyncState}
      boothResetKey={boothResetKey}
      readOnly={readOnly}
      onIgnoreSlot={onIgnoreSlot}
      onResetIgnored={onResetIgnored}
      onRefreshBooths={onRefreshBooths}
      onSaveBoothIds={onSaveBoothIds}
      onSaveDayFilters={onSaveDayFilters}
    />
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
  const { loadData, exportData } = useDataLoader(dispatch, showStatus);
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
    dispatch({ type: 'TOGGLE_AUTO_SYNC', enabled: true });
    dispatch({ type: 'TOGGLE_AUTO_REFRESH_BOOTHS', enabled: true });
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
    dispatch({ type: 'RESET_DATA', syncState: createInitialSyncState() });

    // Hydrate the new profile's endpoint timestamps
    try {
      const timestamps = await ipcInvoke('load-timestamps');
      for (const [endpoint, meta] of Object.entries(timestamps.endpoints)) {
        dispatch({
          type: 'SYNC_ENDPOINT_UPDATE',
          endpoint,
          update: {
            status: meta.status,
            lastSync: meta.lastSync ?? undefined,
            durationMs: meta.durationMs,
            dataSize: meta.dataSize,
            httpStatus: meta.httpStatus,
            error: meta.error
          }
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
  const availableSlotCount = useMemo(() => {
    const u = state.unified;
    const c = state.appConfig;
    if (!u?.boothLocations) return 0;
    const filters = c?.boothDayFilters || [];
    const ignored = c?.ignoredTimeSlots || [];
    return summarizeAvailableSlots(u.boothLocations, filters, ignored).reduce((sum, b) => sum + b.slotCount, 0);
  }, [state.unified, state.appConfig]);

  const { todoCount, warningCount } = useMemo(() => {
    const u = state.unified;
    if (!u) return { todoCount: 0, warningCount: 0 };
    let todos = 0;
    // Action items
    if (!u.metadata.lastImportDC) todos++;
    if (u.siteOrders.girlDelivery.hasWarning) todos++;
    if (u.siteOrders.directShip.hasWarning) todos++;
    if (u.siteOrders.boothSale.hasWarning || countBoothsNeedingDistribution(u.boothReservations) > 0) todos++;
    if (!u.cookieShare.reconciled) todos++;
    if (availableSlotCount > 0) todos++;
    // Warnings (informational, not action-required)
    let warnings = 0;
    if (u.troopTotals.scouts.withNegativeInventory > 0) warnings++;
    if (getActiveScouts(u.scouts).some(([, s]) => s.totals.$orderStatusCounts.needsApproval > 0)) warnings++;
    return { todoCount: todos, warningCount: warnings };
  }, [state.unified, availableSlotCount]);

  useEffect(() => {
    ipcInvoke('set-dock-badge', { count: todoCount }).catch(() => {});
  }, [todoCount]);

  const isWelcome = state.activePage === 'welcome';
  const readOnly = !!state.activeProfile && !state.activeProfile.isDefault;

  // --- Render ---

  let content: preact.JSX.Element;
  if (isWelcome) {
    content = <WelcomeContent onComplete={handleWelcomeComplete} />;
  } else if (state.activeReport === 'settings') {
    content = (
      <SettingsContent
        appConfig={state.appConfig}
        readOnly={readOnly}
        onUpdateConfig={handleUpdateConfig}
        activeProfile={state.activeProfile}
        profiles={state.profiles}
        onSwitchProfile={handleSwitchProfile}
        onDeleteProfile={handleDeleteProfile}
        onExport={exportData}
        hasData={!!state.unified}
        syncState={state.syncState}
        availableBoothsEnabled={!!state.appConfig?.availableBoothsEnabled}
        autoSyncEnabled={state.autoSyncEnabled}
        autoRefreshBoothsEnabled={state.autoRefreshBoothsEnabled}
        onSyncReports={sync}
        onRefreshBooths={refreshBooths}
        onToggleAutoSync={handleToggleAutoSync}
        onToggleAutoRefreshBooths={handleToggleAutoRefreshBooths}
        healthChecks={state.unified?.metadata.healthChecks}
        warnings={state.unified?.warnings || []}
      />
    );
  } else {
    content = (
      <MainContent
        activeReport={state.activeReport}
        unified={state.unified}
        appConfig={state.appConfig}
        syncing={state.syncState.syncing}
        boothSyncState={state.syncState.endpoints['sc-booth-availability'] || { status: 'idle', lastSync: null }}
        boothResetKey={boothResetKeyRef.current}
        readOnly={readOnly}
        availableSlotCount={availableSlotCount}
        onSelectReport={handleSelectReport}
        onIgnoreSlot={handleIgnoreSlot}
        onResetIgnored={handleResetIgnored}
        onRefreshBooths={refreshBooths}
        onSaveBoothIds={handleSaveBoothIds}
        onSaveDayFilters={handleSaveDayFilters}
      />
    );
  }

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
        settingsActive={state.activeReport === 'settings'}
        onSync={handleHeaderSync}
        onOpenSettings={() => handleSelectReport('settings')}
        isWelcome={isWelcome}
      />
      {!isWelcome && (
        <TabBar
          activeReport={state.activeReport}
          unified={state.unified}
          appConfig={state.appConfig}
          todoCount={todoCount}
          warningCount={warningCount}
          onSelectReport={handleSelectReport}
        />
      )}
      <div class="app-content" ref={contentRef}>
        {content}
      </div>
      {state.statusMessage && (
        <div class="toast-container">
          <div class={`toast ${state.statusMessage.type}`}>{state.statusMessage.msg}</div>
        </div>
      )}
    </div>
  );
}
