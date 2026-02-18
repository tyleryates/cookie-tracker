// App Reducer — single source of truth for all App state transitions.
// Side effects (IPC calls, timers) stay in the component; only pure state
// transitions live here.

import type { ActiveProfile, AppConfig, EndpointSyncState, ProfileInfo, SyncState, UnifiedDataset } from '../types';

// ============================================================================
// STATE
// ============================================================================

export interface StatusMessage {
  msg: string;
  type: 'success' | 'warning' | 'error';
}

export interface AppState {
  unified: UnifiedDataset | null;
  appConfig: AppConfig | null;
  autoSyncEnabled: boolean;
  autoRefreshBoothsEnabled: boolean;
  activeReport: string | null;
  activePage: 'dashboard' | 'welcome';
  statusMessage: StatusMessage | null;
  syncState: SyncState;
  updateReady: string | null; // version string when update downloaded
  activeProfile: ActiveProfile | null;
  profiles: ProfileInfo[];
}

// ============================================================================
// ACTIONS
// ============================================================================

export type Action =
  | { type: 'SET_STATUS'; msg: string; statusType: StatusMessage['type'] }
  | { type: 'CLEAR_STATUS' }
  | { type: 'SET_WELCOME' }
  | { type: 'LOAD_CONFIG'; config: AppConfig }
  | { type: 'UPDATE_CONFIG'; patch: Partial<AppConfig> }
  | { type: 'SET_UNIFIED'; unified: UnifiedDataset }
  | { type: 'SET_ACTIVE_REPORT'; report: string | null }
  | { type: 'DEFAULT_REPORT' }
  | { type: 'TOGGLE_AUTO_SYNC'; enabled: boolean }
  | { type: 'TOGGLE_AUTO_REFRESH_BOOTHS'; enabled: boolean }
  | {
      type: 'SYNC_ENDPOINT_UPDATE';
      endpoint: string;
      status: EndpointSyncState['status'];
      lastSync?: string;
      cached?: boolean;
      durationMs?: number;
      dataSize?: number;
      httpStatus?: number;
      error?: string;
    }
  | { type: 'SYNC_STARTED' }
  | { type: 'SYNC_FINISHED' }
  | { type: 'BOOTH_REFRESH_STARTED' }
  | { type: 'BOOTH_REFRESH_FINISHED' }
  | { type: 'UPDATE_BOOTH_LOCATIONS'; boothLocations: UnifiedDataset['boothLocations'] }
  | { type: 'IGNORE_SLOT'; config: AppConfig }
  | { type: 'WIPE_DATA'; syncState: SyncState }
  | { type: 'UPDATE_DOWNLOADED'; version: string }
  | { type: 'SET_PROFILES'; profiles: ProfileInfo[]; activeProfile: ActiveProfile };

// ============================================================================
// REDUCER
// ============================================================================

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, statusMessage: { msg: action.msg, type: action.statusType } };

    case 'CLEAR_STATUS':
      return { ...state, statusMessage: null };

    case 'SET_WELCOME':
      return { ...state, activePage: 'welcome' };

    case 'LOAD_CONFIG': {
      const readOnly = state.activeProfile != null && !state.activeProfile.isDefault;
      return {
        ...state,
        appConfig: action.config,
        autoSyncEnabled: readOnly ? false : (action.config.autoSyncEnabled ?? true),
        autoRefreshBoothsEnabled: readOnly ? false : (action.config.autoRefreshBoothsEnabled ?? true)
      };
    }

    case 'UPDATE_CONFIG': {
      if (!state.appConfig) return state;
      const merged = { ...state.appConfig, ...action.patch };
      return {
        ...state,
        appConfig: merged,
        autoSyncEnabled: merged.autoSyncEnabled ?? state.autoSyncEnabled,
        autoRefreshBoothsEnabled: merged.autoRefreshBoothsEnabled ?? state.autoRefreshBoothsEnabled
      };
    }

    case 'SET_UNIFIED':
      return { ...state, unified: action.unified };

    case 'SET_ACTIVE_REPORT':
      return { ...state, activeReport: action.report };

    case 'DEFAULT_REPORT':
      return state.activeReport ? state : { ...state, activeReport: 'inventory' };

    case 'TOGGLE_AUTO_SYNC': {
      const readOnly = state.activeProfile != null && !state.activeProfile.isDefault;
      return { ...state, autoSyncEnabled: readOnly ? false : action.enabled };
    }

    case 'TOGGLE_AUTO_REFRESH_BOOTHS': {
      const readOnly = state.activeProfile != null && !state.activeProfile.isDefault;
      return { ...state, autoRefreshBoothsEnabled: readOnly ? false : action.enabled };
    }

    case 'SYNC_ENDPOINT_UPDATE': {
      const prev = state.syncState.endpoints[action.endpoint] || { status: 'idle', lastSync: null };
      const isSyncing = action.status === 'syncing';
      return {
        ...state,
        syncState: {
          ...state.syncState,
          endpoints: {
            ...state.syncState.endpoints,
            [action.endpoint]: {
              ...prev,
              status: action.status,
              lastSync: action.lastSync ?? prev.lastSync,
              cached: action.cached,
              // Clear previous sync's timing/error when starting a new sync; store when finished
              durationMs: isSyncing ? undefined : (action.durationMs ?? prev.durationMs),
              dataSize: isSyncing ? undefined : (action.dataSize ?? prev.dataSize),
              httpStatus: isSyncing ? undefined : (action.httpStatus ?? prev.httpStatus),
              error: isSyncing ? undefined : (action.error ?? prev.error)
            }
          }
        }
      };
    }

    case 'SYNC_STARTED':
      return { ...state, syncState: { ...state.syncState, syncing: true } };

    case 'SYNC_FINISHED':
      return { ...state, syncState: { ...state.syncState, syncing: false } };

    case 'BOOTH_REFRESH_STARTED':
      return { ...state, syncState: { ...state.syncState, refreshingBooths: true } };

    case 'BOOTH_REFRESH_FINISHED':
      return { ...state, syncState: { ...state.syncState, refreshingBooths: false } };

    case 'UPDATE_BOOTH_LOCATIONS':
      return state.unified ? { ...state, unified: { ...state.unified, boothLocations: action.boothLocations } } : state;

    case 'IGNORE_SLOT':
      return { ...state, appConfig: action.config };

    case 'WIPE_DATA':
      return { ...state, unified: null, appConfig: null, activeReport: null, syncState: action.syncState };

    case 'UPDATE_DOWNLOADED':
      return { ...state, updateReady: action.version };

    case 'SET_PROFILES':
      return { ...state, profiles: action.profiles, activeProfile: action.activeProfile };

    default:
      return state;
  }
}
