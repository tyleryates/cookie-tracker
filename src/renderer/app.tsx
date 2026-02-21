// App — Root Preact component. Owns all state, delegates logic to hooks.
// Sub-components (WelcomeContent, SettingsContent, MainContent) extract JSX
// but remain in this file since they're tightly coupled to App state.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'preact/hooks';
import { SYNC_STATUS } from '../constants';
import Logger, { getErrorMessage } from '../logger';
import type {
  ActiveProfile,
  AppConfig,
  AppConfigPatch,
  BoothFinderConfig,
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
import { encodeSlotKey, summarizeAvailableSlots } from './available-booths-utils';
import { AppHeader } from './components/app-header';
import { ReportContent, TabBar } from './components/reports-section';
import { SettingsPage } from './components/settings-credentials';
import { SettingsToggles } from './components/settings-toggles';
import { DataHealthChecks, SyncStatusSection } from './components/sync-section';
import { loadAppConfig } from './data-loader';
import { countBoothsNeedingDistribution, getActiveScouts } from './format-utils';
import { useAppInit, useDataLoader, useStatusMessage, useSync } from './hooks';
import { ipcInvoke } from './ipc';
import { HealthCheckReport } from './reports/health-check';
import { computeGroupStatuses, createInitialSyncState, hydrateEndpointTimestamps } from './sync-utils';

const initialState: AppState = {
  unified: null,
  appConfig: null,
  autoSync: false,
  boothAutoRefresh: false,
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
  onUpdateConfig: (patch: AppConfigPatch) => void;
  profile: { active: ActiveProfile | null; all: ProfileInfo[]; onSwitch: (dirName: string) => void; onDelete: (dirName: string) => void };
  onExport: () => void;
  hasData: boolean;
  sync: {
    state: SyncState;
    boothFinderEnabled: boolean;
    autoSync: boolean;
    boothAutoRefresh: boolean;
    onSyncReports: () => void;
    onRefreshBooths: () => void;
    onToggleAutoSync: (enabled: boolean) => void;
    onToggleAutoRefreshBooths: (enabled: boolean) => void;
  };
  healthChecks: HealthChecks | undefined;
  warnings: Warning[];
}

function SettingsContent({
  appConfig,
  readOnly,
  onUpdateConfig,
  profile,
  onExport,
  hasData,
  sync,
  healthChecks,
  warnings
}: SettingsContentProps) {
  return (
    <div class="report-visual sync-tab">
      <SettingsToggles
        appConfig={appConfig}
        readOnly={readOnly}
        onUpdateConfig={onUpdateConfig}
        activeProfile={profile.active}
        profiles={profile.all}
        onSwitchProfile={profile.onSwitch}
        onDeleteProfile={profile.onDelete}
        onExport={onExport}
        hasData={hasData}
      />
      <SettingsPage mode="settings" />
      <SyncStatusSection
        syncState={sync.state}
        boothFinderEnabled={sync.boothFinderEnabled}
        autoSync={sync.autoSync}
        boothAutoRefresh={sync.boothAutoRefresh}
        onSyncReports={sync.onSyncReports}
        onRefreshBooths={sync.onRefreshBooths}
        onToggleAutoSync={sync.onToggleAutoSync}
        onToggleAutoRefreshBooths={sync.onToggleAutoRefreshBooths}
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
// HELPERS
// ============================================================================

/** Apply a partial BoothFinderConfig patch to an AppConfig, preserving existing fields. */
function updateBoothConfig(config: AppConfig, patch: Partial<BoothFinderConfig>): AppConfig {
  return { ...config, boothFinder: config.boothFinder ? { ...config.boothFinder, ...patch } : undefined };
}

/** Dispatch a booth config update and persist to disk in one step. */
function dispatchAndPersistBoothConfig(
  config: AppConfig | null,
  patch: Partial<BoothFinderConfig>,
  dispatch: (action: { type: 'LOAD_CONFIG' | 'IGNORE_SLOT'; config: AppConfig }) => void,
  actionType: 'LOAD_CONFIG' | 'IGNORE_SLOT' = 'LOAD_CONFIG'
): void {
  if (config) dispatch({ type: actionType, config: updateBoothConfig(config, patch) });
  ipcInvoke('update-config', { boothFinder: patch }).catch(() => {});
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
    state.autoSync,
    state.boothAutoRefresh
  );
  useAppInit(dispatch, loadData);

  // Booth reset key — bumped when user re-clicks "Available Booths" tab
  const boothResetKeyRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleHeaderSync = useCallback(() => {
    sync();
    if (state.appConfig?.boothFinder?.enabled) refreshBooths();
  }, [sync, refreshBooths, state.appConfig?.boothFinder?.enabled]);

  const handleToggleAutoSync = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'TOGGLE_AUTO_SYNC', enabled });
      ipcInvoke('update-config', { autoSync: enabled }).catch(() => {});
      showStatus(enabled ? 'Auto sync enabled' : 'Auto sync disabled', 'success');
    },
    [showStatus]
  );

  const handleToggleAutoRefreshBooths = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'TOGGLE_AUTO_REFRESH_BOOTHS', enabled });
      ipcInvoke('update-config', { boothFinder: { autoRefresh: enabled } }).catch(() => {});
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
      dispatchAndPersistBoothConfig(stateRef.current.appConfig, { ids: boothIds }, dispatch);
      showStatus(`Booth selection saved (${boothIds.length} booth${boothIds.length === 1 ? '' : 's'})`, 'success');
      refreshBooths();
    },
    [showStatus, refreshBooths]
  );

  const handleSaveDayFilters = useCallback(
    (filters: string[]) => {
      dispatchAndPersistBoothConfig(stateRef.current.appConfig, { dayFilters: filters }, dispatch);
      showStatus('Booth day filters saved', 'success');
    },
    [showStatus]
  );

  const handleResetIgnored = useCallback(async () => {
    await dispatchAndPersistBoothConfig(stateRef.current.appConfig, { ignoredSlots: [] }, dispatch, 'IGNORE_SLOT');
    showStatus('Ignored time slots cleared', 'success');
  }, [showStatus]);

  const handleIgnoreSlot = useCallback(async (boothId: number, date: string, startTime: string) => {
    const updatedIgnoredSlots = [...(stateRef.current.appConfig?.boothFinder?.ignoredSlots || []), encodeSlotKey(boothId, date, startTime)];
    await dispatchAndPersistBoothConfig(stateRef.current.appConfig, { ignoredSlots: updatedIgnoredSlots }, dispatch, 'IGNORE_SLOT');
  }, []);

  const handleUpdateConfig = useCallback((patch: AppConfigPatch) => {
    dispatch({ type: 'UPDATE_CONFIG', patch });
    ipcInvoke('update-config', patch).catch(() => {});
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
      hydrateEndpointTimestamps(timestamps, dispatch);
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
        showStatus(`Profile switch failed: ${getErrorMessage(error)}`, 'error');
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
        showStatus(`Delete failed: ${getErrorMessage(error)}`, 'error');
      }
    },
    [dispatchProfiles, reloadAfterSwitch, showStatus]
  );

  const groups = useMemo(() => computeGroupStatuses(state.syncState.endpoints, state.syncState), [state.syncState]);
  const availableSlotCount = useMemo(() => {
    const u = state.unified;
    const c = state.appConfig;
    if (!u?.boothLocations) return 0;
    const filters = c?.boothFinder?.dayFilters || [];
    const ignored = c?.boothFinder?.ignoredSlots || [];
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
        profile={{ active: state.activeProfile, all: state.profiles, onSwitch: handleSwitchProfile, onDelete: handleDeleteProfile }}
        onExport={exportData}
        hasData={!!state.unified}
        sync={{
          state: state.syncState,
          boothFinderEnabled: !!state.appConfig?.boothFinder?.enabled,
          autoSync: state.autoSync,
          boothAutoRefresh: state.boothAutoRefresh,
          onSyncReports: sync,
          onRefreshBooths: refreshBooths,
          onToggleAutoSync: handleToggleAutoSync,
          onToggleAutoRefreshBooths: handleToggleAutoRefreshBooths
        }}
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
        boothSyncState={state.syncState.endpoints['sc-booth-availability'] || { status: SYNC_STATUS.IDLE, lastSync: null }}
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
        showBooths={!!state.appConfig?.boothFinder?.enabled}
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
      <output class="toast-container" aria-live="polite">
        {state.statusMessage && <div class={`toast ${state.statusMessage.type}`}>{state.statusMessage.msg}</div>}
      </output>
    </div>
  );
}
