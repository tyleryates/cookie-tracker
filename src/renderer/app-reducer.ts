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
      update: { status: EndpointSyncState['status'] } & Partial<Omit<EndpointSyncState, 'status'>>;
    }
  | { type: 'SYNC_STARTED' }
  | { type: 'SYNC_FINISHED' }
  | { type: 'BOOTH_REFRESH_STARTED' }
  | { type: 'BOOTH_REFRESH_FINISHED' }
  | { type: 'UPDATE_BOOTH_LOCATIONS'; boothLocations: UnifiedDataset['boothLocations'] }
  | { type: 'IGNORE_SLOT'; config: AppConfig }
  | { type: 'RESET_DATA'; syncState: SyncState }
  | { type: 'UPDATE_DOWNLOADED'; version: string }
  | { type: 'SET_PROFILES'; profiles: ProfileInfo[]; activeProfile: ActiveProfile };

// ============================================================================
// REDUCER
// ============================================================================

function isReadOnly(state: AppState): boolean {
  return state.activeProfile != null && !state.activeProfile.isDefault;
}

type ActionOfType<T extends Action['type']> = Extract<Action, { type: T }>;
type ActionHandler<T extends Action['type']> = (state: AppState, action: ActionOfType<T>) => AppState;

const ACTION_HANDLERS: { [T in Action['type']]: ActionHandler<T> } = {
  SET_STATUS: (state, action) => ({
    ...state,
    statusMessage: { msg: action.msg, type: action.statusType }
  }),

  CLEAR_STATUS: (state) => ({ ...state, statusMessage: null }),

  SET_WELCOME: (state) => ({ ...state, activePage: 'welcome' }),

  LOAD_CONFIG: (state, action) => {
    const readOnly = isReadOnly(state);
    return {
      ...state,
      appConfig: action.config,
      autoSyncEnabled: readOnly ? false : (action.config.autoSyncEnabled ?? true),
      autoRefreshBoothsEnabled: readOnly ? false : (action.config.autoRefreshBoothsEnabled ?? true)
    };
  },

  UPDATE_CONFIG: (state, action) => {
    if (!state.appConfig) return state;
    const merged = { ...state.appConfig, ...action.patch };
    const result: AppState = { ...state, appConfig: merged };
    if ('autoSyncEnabled' in action.patch) result.autoSyncEnabled = merged.autoSyncEnabled ?? state.autoSyncEnabled;
    if ('autoRefreshBoothsEnabled' in action.patch)
      result.autoRefreshBoothsEnabled = merged.autoRefreshBoothsEnabled ?? state.autoRefreshBoothsEnabled;
    return result;
  },

  SET_UNIFIED: (state, action) => ({ ...state, unified: action.unified }),

  SET_ACTIVE_REPORT: (state, action) => ({ ...state, activeReport: action.report }),

  DEFAULT_REPORT: (state) => (state.activeReport ? state : { ...state, activeReport: 'inventory' }),

  TOGGLE_AUTO_SYNC: (state, action) => {
    const enabled = isReadOnly(state) ? false : action.enabled;
    return {
      ...state,
      autoSyncEnabled: enabled,
      appConfig: state.appConfig ? { ...state.appConfig, autoSyncEnabled: enabled } : state.appConfig
    };
  },

  TOGGLE_AUTO_REFRESH_BOOTHS: (state, action) => {
    const enabled = isReadOnly(state) ? false : action.enabled;
    return {
      ...state,
      autoRefreshBoothsEnabled: enabled,
      appConfig: state.appConfig ? { ...state.appConfig, autoRefreshBoothsEnabled: enabled } : state.appConfig
    };
  },

  SYNC_ENDPOINT_UPDATE: (state, action) => {
    const { update } = action;
    const prev = state.syncState.endpoints[action.endpoint] || { status: 'idle', lastSync: null };
    const isSyncing = update.status === 'syncing';
    // Clear previous sync's timing/error when starting; preserve/update when finished
    const preserveOnSyncEnd = <T>(val: T | undefined, prevVal: T | undefined): T | undefined => (isSyncing ? undefined : (val ?? prevVal));
    return {
      ...state,
      syncState: {
        ...state.syncState,
        endpoints: {
          ...state.syncState.endpoints,
          [action.endpoint]: {
            ...prev,
            status: update.status,
            lastSync: update.lastSync ?? prev.lastSync,
            cached: update.cached,
            durationMs: preserveOnSyncEnd(update.durationMs, prev.durationMs),
            dataSize: preserveOnSyncEnd(update.dataSize, prev.dataSize),
            httpStatus: preserveOnSyncEnd(update.httpStatus, prev.httpStatus),
            error: preserveOnSyncEnd(update.error, prev.error)
          }
        }
      }
    };
  },

  SYNC_STARTED: (state) => ({ ...state, syncState: { ...state.syncState, syncing: true } }),

  SYNC_FINISHED: (state) => ({ ...state, syncState: { ...state.syncState, syncing: false } }),

  BOOTH_REFRESH_STARTED: (state) => ({ ...state, syncState: { ...state.syncState, refreshingBooths: true } }),

  BOOTH_REFRESH_FINISHED: (state) => ({ ...state, syncState: { ...state.syncState, refreshingBooths: false } }),

  UPDATE_BOOTH_LOCATIONS: (state, action) =>
    state.unified ? { ...state, unified: { ...state.unified, boothLocations: action.boothLocations } } : state,

  IGNORE_SLOT: (state, action) => ({ ...state, appConfig: action.config }),

  RESET_DATA: (state, action) => ({
    ...state,
    unified: null,
    appConfig: null,
    activeReport: null,
    syncState: action.syncState
  }),

  UPDATE_DOWNLOADED: (state, action) => ({ ...state, updateReady: action.version }),

  SET_PROFILES: (state, action) => ({
    ...state,
    profiles: action.profiles,
    activeProfile: action.activeProfile
  })
};

export function appReducer(state: AppState, action: Action): AppState {
  const handler = ACTION_HANDLERS[action.type] as (state: AppState, action: Action) => AppState;
  return handler ? handler(state, action) : state;
}
