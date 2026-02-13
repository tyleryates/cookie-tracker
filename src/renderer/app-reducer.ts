// App Reducer — single source of truth for all App state transitions.
// Side effects (IPC calls, timers) stay in the component; only pure state
// transitions live here.

import type { AppConfig, EndpointSyncState, SyncState, UnifiedDataset } from '../types';

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
  activeReport: string | null;
  activePage: 'dashboard' | 'settings' | 'welcome';
  statusMessage: StatusMessage | null;
  syncState: SyncState;
}

// ============================================================================
// ACTIONS
// ============================================================================

export type Action =
  | { type: 'SET_STATUS'; msg: string; statusType: StatusMessage['type'] }
  | { type: 'CLEAR_STATUS' }
  | { type: 'SET_WELCOME' }
  | { type: 'LOAD_CONFIG'; config: AppConfig }
  | { type: 'SET_UNIFIED'; unified: UnifiedDataset }
  | { type: 'SET_ACTIVE_REPORT'; report: string | null }
  | { type: 'DEFAULT_REPORT' }
  | { type: 'TOGGLE_AUTO_SYNC'; enabled: boolean }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'SYNC_ENDPOINT_UPDATE'; endpoint: string; status: EndpointSyncState['status']; lastSync?: string; cached?: boolean }
  | { type: 'SYNC_STARTED' }
  | { type: 'SYNC_FINISHED' }
  | { type: 'UPDATE_BOOTH_LOCATIONS'; boothLocations: UnifiedDataset['boothLocations'] }
  | { type: 'IGNORE_SLOT'; config: AppConfig }
  | { type: 'WIPE_LOGINS' }
  | { type: 'WIPE_CONFIG' }
  | { type: 'WIPE_DATA'; syncState: SyncState };

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

    case 'LOAD_CONFIG':
      return { ...state, appConfig: action.config, autoSyncEnabled: action.config.autoSyncEnabled ?? true };

    case 'SET_UNIFIED':
      return { ...state, unified: action.unified };

    case 'SET_ACTIVE_REPORT':
      return { ...state, activeReport: action.report };

    case 'DEFAULT_REPORT':
      return state.activeReport ? state : { ...state, activeReport: 'troop' };

    case 'TOGGLE_AUTO_SYNC':
      return { ...state, autoSyncEnabled: action.enabled };

    case 'OPEN_SETTINGS':
      return { ...state, activePage: 'settings' };

    case 'CLOSE_SETTINGS':
      return { ...state, activePage: 'dashboard' };

    case 'SYNC_ENDPOINT_UPDATE': {
      const prev = state.syncState.endpoints[action.endpoint] || { status: 'idle', lastSync: null };
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
              cached: action.cached
            }
          }
        }
      };
    }

    case 'SYNC_STARTED':
      return { ...state, syncState: { ...state.syncState, syncing: true } };

    case 'SYNC_FINISHED':
      return { ...state, syncState: { ...state.syncState, syncing: false } };

    case 'UPDATE_BOOTH_LOCATIONS':
      return state.unified ? { ...state, unified: { ...state.unified, boothLocations: action.boothLocations } } : state;

    case 'IGNORE_SLOT':
      return { ...state, appConfig: action.config };

    case 'WIPE_LOGINS':
      return { ...state, activePage: 'welcome' };

    case 'WIPE_CONFIG':
      return { ...state, appConfig: null };

    case 'WIPE_DATA':
      return { ...state, unified: null, activeReport: null, syncState: action.syncState };

    default:
      return state;
  }
}
