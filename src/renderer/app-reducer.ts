// App Reducer — single source of truth for all App state transitions.
// Side effects (IPC calls, timers) stay in the component; only pure state
// transitions live here.

import type { AppConfig, DatasetEntry, UnifiedDataset } from '../types';
import type { SyncState } from './components/sync-section';

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
  datasetList: DatasetEntry[];
  currentDatasetIndex: number;
  autoSyncEnabled: boolean;
  activeReport: string | null;
  modalOpen: boolean;
  statusMessage: StatusMessage | null;
  syncState: SyncState;
  showSetupHint: boolean;
}

// ============================================================================
// ACTIONS
// ============================================================================

type Action =
  | { type: 'SET_STATUS'; msg: string; statusType: StatusMessage['type'] }
  | { type: 'CLEAR_STATUS' }
  | { type: 'SET_SETUP_HINT'; show: boolean }
  | { type: 'LOAD_CONFIG'; config: AppConfig }
  | { type: 'SET_UNIFIED'; unified: UnifiedDataset; datasetList: DatasetEntry[] }
  | { type: 'SET_DATASET_INDEX'; index: number }
  | { type: 'SET_ACTIVE_REPORT'; report: string | null }
  | { type: 'DEFAULT_REPORT' }
  | { type: 'TOGGLE_AUTO_SYNC'; enabled: boolean }
  | { type: 'OPEN_MODAL' }
  | { type: 'CLOSE_MODAL' }
  | { type: 'UPDATE_SYNC'; patch: Partial<SyncState> }
  | { type: 'SYNC_SOURCE_UPDATE'; source: 'dc' | 'sc' | 'booth'; patch: Partial<SyncState['dc']> }
  | { type: 'SYNC_STARTED' }
  | { type: 'SYNC_FINISHED' }
  | { type: 'UPDATE_BOOTH_LOCATIONS'; boothLocations: UnifiedDataset['boothLocations'] }
  | { type: 'IGNORE_SLOT'; config: AppConfig };

// ============================================================================
// REDUCER
// ============================================================================

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, statusMessage: { msg: action.msg, type: action.statusType } };

    case 'CLEAR_STATUS':
      return { ...state, statusMessage: null };

    case 'SET_SETUP_HINT':
      return { ...state, showSetupHint: action.show };

    case 'LOAD_CONFIG':
      return {
        ...state,
        appConfig: action.config,
        autoSyncEnabled: action.config.autoSyncEnabled ?? true,
        syncState: action.config.lastBoothSync
          ? {
              ...state.syncState,
              booth: { ...state.syncState.booth, status: 'synced', lastSync: action.config.lastBoothSync }
            }
          : state.syncState
      };

    case 'SET_UNIFIED':
      return { ...state, unified: action.unified, datasetList: action.datasetList };

    case 'SET_DATASET_INDEX':
      return { ...state, currentDatasetIndex: action.index };

    case 'SET_ACTIVE_REPORT':
      return { ...state, activeReport: action.report };

    case 'DEFAULT_REPORT':
      return state.activeReport ? state : { ...state, activeReport: 'troop' };

    case 'TOGGLE_AUTO_SYNC':
      return { ...state, autoSyncEnabled: action.enabled };

    case 'OPEN_MODAL':
      return { ...state, modalOpen: true };

    case 'CLOSE_MODAL':
      return { ...state, modalOpen: false };

    case 'UPDATE_SYNC':
      return { ...state, syncState: { ...state.syncState, ...action.patch } };

    case 'SYNC_SOURCE_UPDATE':
      return {
        ...state,
        syncState: {
          ...state.syncState,
          [action.source]: { ...state.syncState[action.source], ...action.patch }
        }
      };

    case 'SYNC_STARTED':
      return {
        ...state,
        syncState: {
          ...state.syncState,
          syncing: true,
          dc: { ...state.syncState.dc, status: 'syncing', progress: 0, progressText: 'Starting...' },
          sc: { ...state.syncState.sc, status: 'syncing', progress: 0, progressText: 'Starting...' }
        }
      };

    case 'SYNC_FINISHED':
      return { ...state, syncState: { ...state.syncState, syncing: false } };

    case 'UPDATE_BOOTH_LOCATIONS':
      return state.unified ? { ...state, unified: { ...state.unified, boothLocations: action.boothLocations } } : state;

    case 'IGNORE_SLOT':
      return { ...state, appConfig: action.config };

    default:
      return state;
  }
}
