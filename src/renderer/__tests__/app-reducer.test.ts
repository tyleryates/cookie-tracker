import { describe, expect, it } from 'vitest';
import type { AppConfig, BoothLocation, DatasetEntry, UnifiedDataset } from '../../types';
import { type AppState, appReducer } from '../app-reducer';
import type { SourceSyncState, SyncState } from '../components/sync-section';

// =============================================================================
// HELPERS
// =============================================================================

function makeSyncState(overrides?: Partial<SyncState>): SyncState {
  const makeSource = (patch?: Partial<SourceSyncState>): SourceSyncState => ({
    status: 'idle',
    lastSync: null,
    progress: 0,
    progressText: '',
    ...patch
  });
  return {
    syncing: false,
    dc: makeSource(overrides?.dc),
    sc: makeSource(overrides?.sc),
    booth: makeSource(overrides?.booth),
    ...overrides
  };
}

function makeState(overrides?: Partial<AppState>): AppState {
  return {
    unified: null,
    appConfig: null,
    datasetList: [],
    currentDatasetIndex: 0,
    autoSyncEnabled: true,
    activeReport: null,
    modalOpen: false,
    statusMessage: null,
    syncState: makeSyncState(),
    showSetupHint: false,
    ...overrides
  };
}

function makeAppConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    autoSyncEnabled: true,
    boothIds: [],
    boothDayFilters: [],
    ignoredTimeSlots: [],
    ...overrides
  };
}

function makeUnifiedDataset(overrides?: Partial<UnifiedDataset>): UnifiedDataset {
  return {
    scouts: new Map(),
    siteOrders: {
      directShip: { orders: [], total: 0, allocated: 0, unallocated: 0, hasWarning: false },
      girlDelivery: { orders: [], total: 0, allocated: 0, unallocated: 0, hasWarning: false },
      boothSale: { orders: [], total: 0, allocated: 0, unallocated: 0, hasWarning: false }
    },
    troopTotals: {
      troopProceeds: 0,
      proceedsRate: 0,
      proceedsDeduction: 0,
      proceedsExemptPackages: 0,
      inventory: 0,
      donations: 0,
      c2tReceived: 0,
      directShip: 0,
      boothDividerT2G: 0,
      virtualBoothT2G: 0,
      girlDelivery: 0,
      girlInventory: 0,
      pendingPickup: 0,
      boothSalesPackages: 0,
      boothSalesDonations: 0,
      packagesCredited: 0,
      grossProceeds: 0,
      scouts: { total: 0, active: 0, inactive: 0, withNegativeInventory: 0 }
    },
    transferBreakdowns: { c2t: [], t2g: [], g2t: [], totals: { c2t: 0, t2gPhysical: 0, g2t: 0 } },
    varieties: { byCookie: {}, inventory: {}, total: 0 },
    cookieShare: {
      digitalCookie: { total: 0, manualEntry: 0 },
      smartCookie: { manualEntries: 0 },
      reconciled: false
    },
    boothReservations: [],
    boothLocations: [],
    metadata: {
      lastImportDC: null,
      lastImportSC: null,
      cookieIdMap: null,
      sources: [],
      unifiedBuildTime: '',
      scoutCount: 0,
      orderCount: 0,
      healthChecks: { warningsCount: 0, unknownOrderTypes: 0, unknownPaymentMethods: 0, unknownTransferTypes: 0 }
    },
    warnings: [],
    virtualCookieShareAllocations: new Map(),
    hasTransferData: false,
    ...overrides
  };
}

// =============================================================================
// SET_STATUS
// =============================================================================

describe('SET_STATUS', () => {
  it('sets statusMessage with msg and type', () => {
    const state = makeState();
    const result = appReducer(state, { type: 'SET_STATUS', msg: 'Sync complete', statusType: 'success' });
    expect(result.statusMessage).toEqual({ msg: 'Sync complete', type: 'success' });
  });

  it('sets warning status type', () => {
    const state = makeState();
    const result = appReducer(state, { type: 'SET_STATUS', msg: 'Partial sync', statusType: 'warning' });
    expect(result.statusMessage).toEqual({ msg: 'Partial sync', type: 'warning' });
  });

  it('sets error status type', () => {
    const state = makeState();
    const result = appReducer(state, { type: 'SET_STATUS', msg: 'Failed', statusType: 'error' });
    expect(result.statusMessage).toEqual({ msg: 'Failed', type: 'error' });
  });

  it('overwrites existing status message', () => {
    const state = makeState({ statusMessage: { msg: 'old', type: 'success' } });
    const result = appReducer(state, { type: 'SET_STATUS', msg: 'new', statusType: 'error' });
    expect(result.statusMessage).toEqual({ msg: 'new', type: 'error' });
  });
});

// =============================================================================
// CLEAR_STATUS
// =============================================================================

describe('CLEAR_STATUS', () => {
  it('clears statusMessage to null', () => {
    const state = makeState({ statusMessage: { msg: 'hello', type: 'success' } });
    const result = appReducer(state, { type: 'CLEAR_STATUS' });
    expect(result.statusMessage).toBeNull();
  });

  it('is a no-op when statusMessage is already null', () => {
    const state = makeState({ statusMessage: null });
    const result = appReducer(state, { type: 'CLEAR_STATUS' });
    expect(result.statusMessage).toBeNull();
  });
});

// =============================================================================
// SET_SETUP_HINT
// =============================================================================

describe('SET_SETUP_HINT', () => {
  it('sets showSetupHint to true', () => {
    const state = makeState({ showSetupHint: false });
    const result = appReducer(state, { type: 'SET_SETUP_HINT', show: true });
    expect(result.showSetupHint).toBe(true);
  });

  it('sets showSetupHint to false', () => {
    const state = makeState({ showSetupHint: true });
    const result = appReducer(state, { type: 'SET_SETUP_HINT', show: false });
    expect(result.showSetupHint).toBe(false);
  });
});

// =============================================================================
// LOAD_CONFIG
// =============================================================================

describe('LOAD_CONFIG', () => {
  it('sets appConfig from action', () => {
    const config = makeAppConfig({ boothIds: [1, 2, 3] });
    const state = makeState();
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.appConfig).toBe(config);
  });

  it('sets autoSyncEnabled from config', () => {
    const config = makeAppConfig({ autoSyncEnabled: false });
    const state = makeState({ autoSyncEnabled: true });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.autoSyncEnabled).toBe(false);
  });

  it('defaults autoSyncEnabled to true when config omits it', () => {
    const config = makeAppConfig();
    // Force undefined to test the nullish coalescing
    (config as any).autoSyncEnabled = undefined;
    const state = makeState({ autoSyncEnabled: false });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.autoSyncEnabled).toBe(true);
  });

  it('updates booth sync state when lastBoothSync is present', () => {
    const config = makeAppConfig({ lastBoothSync: '2025-01-15T10:00:00Z' });
    const state = makeState();
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.syncState.booth.status).toBe('synced');
    expect(result.syncState.booth.lastSync).toBe('2025-01-15T10:00:00Z');
  });

  it('does not update booth sync state when lastBoothSync is absent', () => {
    const config = makeAppConfig(); // no lastBoothSync
    const originalSyncState = makeSyncState();
    const state = makeState({ syncState: originalSyncState });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.syncState.booth.status).toBe('idle');
    expect(result.syncState.booth.lastSync).toBeNull();
  });

  it('preserves other sync state fields when updating booth', () => {
    const config = makeAppConfig({ lastBoothSync: '2025-01-15T10:00:00Z' });
    const state = makeState({
      syncState: makeSyncState({
        dc: { status: 'synced', lastSync: '2025-01-14T08:00:00Z', progress: 100, progressText: 'Done' }
      })
    });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.syncState.dc.status).toBe('synced');
    expect(result.syncState.dc.lastSync).toBe('2025-01-14T08:00:00Z');
  });
});

// =============================================================================
// SET_UNIFIED
// =============================================================================

describe('SET_UNIFIED', () => {
  it('sets unified and datasetList', () => {
    const unified = makeUnifiedDataset();
    const datasetList: DatasetEntry[] = [{ label: '2025-01-15', scFile: null, dcFile: null, timestamp: '2025-01-15T10:00:00Z' }];
    const state = makeState();
    const result = appReducer(state, { type: 'SET_UNIFIED', unified, datasetList });
    expect(result.unified).toBe(unified);
    expect(result.datasetList).toBe(datasetList);
  });
});

// =============================================================================
// SET_DATASET_INDEX
// =============================================================================

describe('SET_DATASET_INDEX', () => {
  it('sets currentDatasetIndex', () => {
    const state = makeState({ currentDatasetIndex: 0 });
    const result = appReducer(state, { type: 'SET_DATASET_INDEX', index: 3 });
    expect(result.currentDatasetIndex).toBe(3);
  });
});

// =============================================================================
// SET_ACTIVE_REPORT
// =============================================================================

describe('SET_ACTIVE_REPORT', () => {
  it('sets activeReport to a report name', () => {
    const state = makeState({ activeReport: null });
    const result = appReducer(state, { type: 'SET_ACTIVE_REPORT', report: 'scout' });
    expect(result.activeReport).toBe('scout');
  });

  it('sets activeReport to null', () => {
    const state = makeState({ activeReport: 'troop' });
    const result = appReducer(state, { type: 'SET_ACTIVE_REPORT', report: null });
    expect(result.activeReport).toBeNull();
  });
});

// =============================================================================
// DEFAULT_REPORT
// =============================================================================

describe('DEFAULT_REPORT', () => {
  it('sets activeReport to troop when no report is active', () => {
    const state = makeState({ activeReport: null });
    const result = appReducer(state, { type: 'DEFAULT_REPORT' });
    expect(result.activeReport).toBe('troop');
  });

  it('is a no-op when a report is already active', () => {
    const state = makeState({ activeReport: 'scout' });
    const result = appReducer(state, { type: 'DEFAULT_REPORT' });
    expect(result.activeReport).toBe('scout');
  });

  it('returns the same state reference when a report is already active', () => {
    const state = makeState({ activeReport: 'booth' });
    const result = appReducer(state, { type: 'DEFAULT_REPORT' });
    expect(result).toBe(state);
  });
});

// =============================================================================
// TOGGLE_AUTO_SYNC
// =============================================================================

describe('TOGGLE_AUTO_SYNC', () => {
  it('sets autoSyncEnabled to true', () => {
    const state = makeState({ autoSyncEnabled: false });
    const result = appReducer(state, { type: 'TOGGLE_AUTO_SYNC', enabled: true });
    expect(result.autoSyncEnabled).toBe(true);
  });

  it('sets autoSyncEnabled to false', () => {
    const state = makeState({ autoSyncEnabled: true });
    const result = appReducer(state, { type: 'TOGGLE_AUTO_SYNC', enabled: false });
    expect(result.autoSyncEnabled).toBe(false);
  });
});

// =============================================================================
// OPEN_MODAL
// =============================================================================

describe('OPEN_MODAL', () => {
  it('sets modalOpen to true', () => {
    const state = makeState({ modalOpen: false });
    const result = appReducer(state, { type: 'OPEN_MODAL' });
    expect(result.modalOpen).toBe(true);
  });
});

// =============================================================================
// CLOSE_MODAL
// =============================================================================

describe('CLOSE_MODAL', () => {
  it('sets modalOpen to false', () => {
    const state = makeState({ modalOpen: true });
    const result = appReducer(state, { type: 'CLOSE_MODAL' });
    expect(result.modalOpen).toBe(false);
  });
});

// =============================================================================
// UPDATE_SYNC
// =============================================================================

describe('UPDATE_SYNC', () => {
  it('merges partial patch into syncState', () => {
    const state = makeState();
    const result = appReducer(state, { type: 'UPDATE_SYNC', patch: { syncing: true } });
    expect(result.syncState.syncing).toBe(true);
    // Other fields preserved
    expect(result.syncState.dc.status).toBe('idle');
  });

  it('can update nested source objects', () => {
    const newDc: SourceSyncState = { status: 'synced', lastSync: '2025-01-15T10:00:00Z', progress: 100, progressText: 'Done' };
    const state = makeState();
    const result = appReducer(state, { type: 'UPDATE_SYNC', patch: { dc: newDc } });
    expect(result.syncState.dc).toEqual(newDc);
  });
});

// =============================================================================
// SYNC_SOURCE_UPDATE
// =============================================================================

describe('SYNC_SOURCE_UPDATE', () => {
  it('merges patch into dc source', () => {
    const state = makeState();
    const result = appReducer(state, {
      type: 'SYNC_SOURCE_UPDATE',
      source: 'dc',
      patch: { status: 'syncing', progress: 50, progressText: 'Downloading orders...' }
    });
    expect(result.syncState.dc.status).toBe('syncing');
    expect(result.syncState.dc.progress).toBe(50);
    expect(result.syncState.dc.progressText).toBe('Downloading orders...');
    // lastSync preserved from initial state
    expect(result.syncState.dc.lastSync).toBeNull();
  });

  it('merges patch into sc source', () => {
    const state = makeState();
    const result = appReducer(state, {
      type: 'SYNC_SOURCE_UPDATE',
      source: 'sc',
      patch: { status: 'synced', lastSync: '2025-01-15T12:00:00Z' }
    });
    expect(result.syncState.sc.status).toBe('synced');
    expect(result.syncState.sc.lastSync).toBe('2025-01-15T12:00:00Z');
  });

  it('merges patch into booth source', () => {
    const state = makeState();
    const result = appReducer(state, {
      type: 'SYNC_SOURCE_UPDATE',
      source: 'booth',
      patch: { status: 'error', errorMessage: 'Network failure' }
    });
    expect(result.syncState.booth.status).toBe('error');
    expect(result.syncState.booth.errorMessage).toBe('Network failure');
  });

  it('preserves other sources when updating one', () => {
    const state = makeState({
      syncState: makeSyncState({
        dc: { status: 'synced', lastSync: '2025-01-14T08:00:00Z', progress: 100, progressText: 'Done' }
      })
    });
    const result = appReducer(state, {
      type: 'SYNC_SOURCE_UPDATE',
      source: 'sc',
      patch: { status: 'syncing' }
    });
    expect(result.syncState.dc.status).toBe('synced');
    expect(result.syncState.sc.status).toBe('syncing');
  });
});

// =============================================================================
// SYNC_STARTED
// =============================================================================

describe('SYNC_STARTED', () => {
  it('sets syncing to true', () => {
    const state = makeState();
    const result = appReducer(state, { type: 'SYNC_STARTED' });
    expect(result.syncState.syncing).toBe(true);
  });

  it('resets dc progress to syncing state', () => {
    const state = makeState({
      syncState: makeSyncState({
        dc: { status: 'synced', lastSync: '2025-01-14T08:00:00Z', progress: 100, progressText: 'Done' }
      })
    });
    const result = appReducer(state, { type: 'SYNC_STARTED' });
    expect(result.syncState.dc.status).toBe('syncing');
    expect(result.syncState.dc.progress).toBe(0);
    expect(result.syncState.dc.progressText).toBe('Starting...');
  });

  it('resets sc progress to syncing state', () => {
    const state = makeState({
      syncState: makeSyncState({
        sc: { status: 'synced', lastSync: '2025-01-14T08:00:00Z', progress: 100, progressText: 'Done' }
      })
    });
    const result = appReducer(state, { type: 'SYNC_STARTED' });
    expect(result.syncState.sc.status).toBe('syncing');
    expect(result.syncState.sc.progress).toBe(0);
    expect(result.syncState.sc.progressText).toBe('Starting...');
  });

  it('preserves dc and sc lastSync values', () => {
    const state = makeState({
      syncState: makeSyncState({
        dc: { status: 'synced', lastSync: '2025-01-14T08:00:00Z', progress: 100, progressText: 'Done' },
        sc: { status: 'synced', lastSync: '2025-01-14T09:00:00Z', progress: 100, progressText: 'Done' }
      })
    });
    const result = appReducer(state, { type: 'SYNC_STARTED' });
    expect(result.syncState.dc.lastSync).toBe('2025-01-14T08:00:00Z');
    expect(result.syncState.sc.lastSync).toBe('2025-01-14T09:00:00Z');
  });

  it('does not reset booth state', () => {
    const state = makeState({
      syncState: makeSyncState({
        booth: { status: 'synced', lastSync: '2025-01-14T07:00:00Z', progress: 0, progressText: '' }
      })
    });
    const result = appReducer(state, { type: 'SYNC_STARTED' });
    expect(result.syncState.booth.status).toBe('synced');
    expect(result.syncState.booth.lastSync).toBe('2025-01-14T07:00:00Z');
  });
});

// =============================================================================
// SYNC_FINISHED
// =============================================================================

describe('SYNC_FINISHED', () => {
  it('sets syncing to false', () => {
    const state = makeState({ syncState: makeSyncState({ syncing: true }) });
    const result = appReducer(state, { type: 'SYNC_FINISHED' });
    expect(result.syncState.syncing).toBe(false);
  });

  it('preserves source sync states', () => {
    const state = makeState({
      syncState: makeSyncState({
        syncing: true,
        dc: { status: 'synced', lastSync: '2025-01-15T10:00:00Z', progress: 100, progressText: 'Done' },
        sc: { status: 'synced', lastSync: '2025-01-15T10:05:00Z', progress: 100, progressText: 'Done' }
      })
    });
    const result = appReducer(state, { type: 'SYNC_FINISHED' });
    expect(result.syncState.dc.status).toBe('synced');
    expect(result.syncState.sc.status).toBe('synced');
  });
});

// =============================================================================
// UPDATE_BOOTH_LOCATIONS
// =============================================================================

describe('UPDATE_BOOTH_LOCATIONS', () => {
  it('updates boothLocations in unified when unified is present', () => {
    const unified = makeUnifiedDataset({ boothLocations: [] });
    const state = makeState({ unified });
    const newLocations: BoothLocation[] = [
      {
        id: 1,
        storeName: 'Walmart',
        address: { street: '123 Main', city: 'Springfield', state: 'IL', zip: '62701' },
        reservationType: 'distributed',
        notes: ''
      }
    ];
    const result = appReducer(state, { type: 'UPDATE_BOOTH_LOCATIONS', boothLocations: newLocations });
    expect(result.unified!.boothLocations).toBe(newLocations);
  });

  it('is a no-op when unified is null', () => {
    const state = makeState({ unified: null });
    const newLocations: BoothLocation[] = [
      {
        id: 2,
        storeName: 'Target',
        address: { street: '456 Oak', city: 'Shelbyville', state: 'IL', zip: '62565' },
        reservationType: 'distributed',
        notes: ''
      }
    ];
    const result = appReducer(state, { type: 'UPDATE_BOOTH_LOCATIONS', boothLocations: newLocations });
    expect(result.unified).toBeNull();
  });

  it('returns the same state reference when unified is null', () => {
    const state = makeState({ unified: null });
    const result = appReducer(state, { type: 'UPDATE_BOOTH_LOCATIONS', boothLocations: [] });
    expect(result).toBe(state);
  });

  it('preserves other unified fields when updating booth locations', () => {
    const unified = makeUnifiedDataset({ hasTransferData: true });
    const state = makeState({ unified });
    const result = appReducer(state, { type: 'UPDATE_BOOTH_LOCATIONS', boothLocations: [] });
    expect(result.unified!.hasTransferData).toBe(true);
  });
});

// =============================================================================
// IGNORE_SLOT
// =============================================================================

describe('IGNORE_SLOT', () => {
  it('sets appConfig from action', () => {
    const config = makeAppConfig({
      ignoredTimeSlots: [{ boothId: 42, date: '2025-02-01', startTime: '10:00' }]
    });
    const state = makeState();
    const result = appReducer(state, { type: 'IGNORE_SLOT', config });
    expect(result.appConfig).toBe(config);
  });

  it('replaces existing appConfig', () => {
    const oldConfig = makeAppConfig({ boothIds: [1] });
    const newConfig = makeAppConfig({ boothIds: [1, 2, 3] });
    const state = makeState({ appConfig: oldConfig });
    const result = appReducer(state, { type: 'IGNORE_SLOT', config: newConfig });
    expect(result.appConfig).toBe(newConfig);
    expect(result.appConfig!.boothIds).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// IMMUTABILITY
// =============================================================================

describe('immutability', () => {
  it('does not mutate the original state', () => {
    const state = makeState();
    const original = { ...state };
    appReducer(state, { type: 'SET_STATUS', msg: 'test', statusType: 'success' });
    expect(state.statusMessage).toBe(original.statusMessage);
  });

  it('returns a new object for state-changing actions', () => {
    const state = makeState();
    const result = appReducer(state, { type: 'OPEN_MODAL' });
    expect(result).not.toBe(state);
  });
});
