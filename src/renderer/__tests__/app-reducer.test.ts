import { describe, expect, it } from 'vitest';
import { SYNC_ENDPOINTS } from '../../constants';
import type { AppConfig, BoothLocation, EndpointSyncState, SyncState, UnifiedDataset } from '../../types';
import { type AppState, appReducer } from '../app-reducer';

// =============================================================================
// HELPERS
// =============================================================================

function makeEndpoints(overrides?: Record<string, Partial<EndpointSyncState>>): Record<string, EndpointSyncState> {
  const endpoints: Record<string, EndpointSyncState> = {};
  for (const ep of SYNC_ENDPOINTS) {
    endpoints[ep.id] = { status: 'idle', lastSync: null, ...overrides?.[ep.id] };
  }
  return endpoints;
}

function makeSyncState(overrides?: Partial<SyncState> & { endpointOverrides?: Record<string, Partial<EndpointSyncState>> }): SyncState {
  return {
    syncing: overrides?.syncing ?? false,
    refreshingBooths: overrides?.refreshingBooths ?? false,
    endpoints: overrides?.endpoints ?? makeEndpoints(overrides?.endpointOverrides)
  };
}

function makeState(overrides?: Partial<AppState>): AppState {
  return {
    unified: null,
    appConfig: null,
    autoSyncEnabled: true,
    autoRefreshBoothsEnabled: true,
    activeReport: null,
    activePage: 'dashboard' as const,
    statusMessage: null,
    syncState: makeSyncState(),
    updateReady: null,
    activeProfile: null,
    profiles: [],
    ...overrides
  };
}

function makeAppConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    autoUpdateEnabled: false,
    autoSyncEnabled: true,
    autoRefreshBoothsEnabled: true,
    availableBoothsEnabled: false,
    boothAlertImessage: false,
    boothAlertRecipient: '',
    boothNotifiedSlots: [],
    boothIds: [],
    boothDayFilters: [],
    ignoredTimeSlots: [],
    ...overrides
  };
}

function makeUnifiedDataset(overrides?: Partial<UnifiedDataset>): UnifiedDataset {
  return {
    scouts: {},
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
    transferBreakdowns: { c2t: [], t2tOut: [], t2g: [], g2t: [], totals: { c2t: 0, t2tOut: 0, t2gPhysical: 0, g2t: 0 } },
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
      healthChecks: { warningsCount: 0, unknownOrderTypes: 0, unknownPaymentMethods: 0, unknownTransferTypes: 0, unknownCookieIds: 0 }
    },
    warnings: [],
    virtualCookieShareAllocations: {},
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
// SET_WELCOME
// =============================================================================

describe('SET_WELCOME', () => {
  it('sets activePage to welcome', () => {
    const state = makeState({ activePage: 'dashboard' });
    const result = appReducer(state, { type: 'SET_WELCOME' });
    expect(result.activePage).toBe('welcome');
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

  it('sets autoRefreshBoothsEnabled from config', () => {
    const config = makeAppConfig({ autoRefreshBoothsEnabled: false });
    const state = makeState({ autoRefreshBoothsEnabled: true });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.autoRefreshBoothsEnabled).toBe(false);
  });

  it('defaults autoRefreshBoothsEnabled to true when config omits it', () => {
    const config = makeAppConfig();
    (config as any).autoRefreshBoothsEnabled = undefined;
    const state = makeState({ autoRefreshBoothsEnabled: false });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.autoRefreshBoothsEnabled).toBe(true);
  });

  it('does not modify sync state', () => {
    const config = makeAppConfig();
    const state = makeState();
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.syncState).toBe(state.syncState);
  });
});

// =============================================================================
// SET_UNIFIED
// =============================================================================

describe('SET_UNIFIED', () => {
  it('sets unified', () => {
    const unified = makeUnifiedDataset();
    const state = makeState();
    const result = appReducer(state, { type: 'SET_UNIFIED', unified });
    expect(result.unified).toBe(unified);
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
// TOGGLE_AUTO_REFRESH_BOOTHS
// =============================================================================

describe('TOGGLE_AUTO_REFRESH_BOOTHS', () => {
  it('sets autoRefreshBoothsEnabled to true', () => {
    const state = makeState({ autoRefreshBoothsEnabled: false });
    const result = appReducer(state, { type: 'TOGGLE_AUTO_REFRESH_BOOTHS', enabled: true });
    expect(result.autoRefreshBoothsEnabled).toBe(true);
  });

  it('sets autoRefreshBoothsEnabled to false', () => {
    const state = makeState({ autoRefreshBoothsEnabled: true });
    const result = appReducer(state, { type: 'TOGGLE_AUTO_REFRESH_BOOTHS', enabled: false });
    expect(result.autoRefreshBoothsEnabled).toBe(false);
  });
});

// =============================================================================
// OPEN_SETTINGS
// =============================================================================

describe('OPEN_SETTINGS', () => {
  it('sets activePage to settings', () => {
    const state = makeState({ activePage: 'dashboard' });
    const result = appReducer(state, { type: 'OPEN_SETTINGS' });
    expect(result.activePage).toBe('settings');
  });
});

// =============================================================================
// CLOSE_SETTINGS
// =============================================================================

describe('CLOSE_SETTINGS', () => {
  it('sets activePage to dashboard', () => {
    const state = makeState({ activePage: 'settings' });
    const result = appReducer(state, { type: 'CLOSE_SETTINGS' });
    expect(result.activePage).toBe('dashboard');
  });
});

// =============================================================================
// SYNC_ENDPOINT_UPDATE
// =============================================================================

describe('SYNC_ENDPOINT_UPDATE', () => {
  it('updates a single endpoint status', () => {
    const state = makeState();
    const result = appReducer(state, { type: 'SYNC_ENDPOINT_UPDATE', endpoint: 'sc-orders', status: 'syncing' });
    expect(result.syncState.endpoints['sc-orders'].status).toBe('syncing');
    expect(result.syncState.endpoints['sc-orders'].lastSync).toBeNull();
  });

  it('updates endpoint status and lastSync', () => {
    const state = makeState();
    const result = appReducer(state, {
      type: 'SYNC_ENDPOINT_UPDATE',
      endpoint: 'dc-troop-report',
      status: 'synced',
      lastSync: '2025-01-15T12:00:00Z'
    });
    expect(result.syncState.endpoints['dc-troop-report'].status).toBe('synced');
    expect(result.syncState.endpoints['dc-troop-report'].lastSync).toBe('2025-01-15T12:00:00Z');
  });

  it('preserves lastSync when not provided', () => {
    const state = makeState({
      syncState: makeSyncState({
        endpointOverrides: { 'sc-orders': { status: 'synced', lastSync: '2025-01-14T08:00:00Z' } }
      })
    });
    const result = appReducer(state, { type: 'SYNC_ENDPOINT_UPDATE', endpoint: 'sc-orders', status: 'syncing' });
    expect(result.syncState.endpoints['sc-orders'].status).toBe('syncing');
    expect(result.syncState.endpoints['sc-orders'].lastSync).toBe('2025-01-14T08:00:00Z');
  });

  it('preserves other endpoints when updating one', () => {
    const state = makeState({
      syncState: makeSyncState({
        endpointOverrides: { 'dc-troop-report': { status: 'synced', lastSync: '2025-01-14T08:00:00Z' } }
      })
    });
    const result = appReducer(state, { type: 'SYNC_ENDPOINT_UPDATE', endpoint: 'sc-orders', status: 'syncing' });
    expect(result.syncState.endpoints['dc-troop-report'].status).toBe('synced');
    expect(result.syncState.endpoints['sc-orders'].status).toBe('syncing');
  });

  it('sets error status', () => {
    const state = makeState();
    const result = appReducer(state, { type: 'SYNC_ENDPOINT_UPDATE', endpoint: 'sc-reservations', status: 'error' });
    expect(result.syncState.endpoints['sc-reservations'].status).toBe('error');
  });

  it('stores durationMs and dataSize when synced', () => {
    const state = makeState();
    const result = appReducer(state, {
      type: 'SYNC_ENDPOINT_UPDATE',
      endpoint: 'sc-orders',
      status: 'synced',
      lastSync: '2025-01-15T12:00:00Z',
      durationMs: 1200,
      dataSize: 245000
    });
    expect(result.syncState.endpoints['sc-orders'].durationMs).toBe(1200);
    expect(result.syncState.endpoints['sc-orders'].dataSize).toBe(245000);
  });

  it('clears durationMs and dataSize when status transitions to syncing', () => {
    const state = makeState({
      syncState: makeSyncState({
        endpointOverrides: { 'sc-orders': { status: 'synced', lastSync: '2025-01-14T08:00:00Z', durationMs: 500, dataSize: 1000 } }
      })
    });
    const result = appReducer(state, { type: 'SYNC_ENDPOINT_UPDATE', endpoint: 'sc-orders', status: 'syncing' });
    expect(result.syncState.endpoints['sc-orders'].durationMs).toBeUndefined();
    expect(result.syncState.endpoints['sc-orders'].dataSize).toBeUndefined();
  });

  it('preserves durationMs from previous sync when not provided in update', () => {
    const state = makeState({
      syncState: makeSyncState({
        endpointOverrides: { 'sc-orders': { status: 'synced', lastSync: '2025-01-14T08:00:00Z', durationMs: 500, dataSize: 1000 } }
      })
    });
    const result = appReducer(state, {
      type: 'SYNC_ENDPOINT_UPDATE',
      endpoint: 'sc-orders',
      status: 'synced',
      lastSync: '2025-01-15T10:00:00Z'
    });
    expect(result.syncState.endpoints['sc-orders'].durationMs).toBe(500);
    expect(result.syncState.endpoints['sc-orders'].dataSize).toBe(1000);
  });

  it('stores httpStatus and error on error status', () => {
    const state = makeState();
    const result = appReducer(state, {
      type: 'SYNC_ENDPOINT_UPDATE',
      endpoint: 'sc-orders',
      status: 'error',
      httpStatus: 401,
      error: 'Unauthorized'
    });
    expect(result.syncState.endpoints['sc-orders'].httpStatus).toBe(401);
    expect(result.syncState.endpoints['sc-orders'].error).toBe('Unauthorized');
  });

  it('clears httpStatus and error when status transitions to syncing', () => {
    const state = makeState({
      syncState: makeSyncState({
        endpointOverrides: {
          'sc-orders': { status: 'error', lastSync: '2025-01-14T08:00:00Z', httpStatus: 401, error: 'Unauthorized' }
        }
      })
    });
    const result = appReducer(state, { type: 'SYNC_ENDPOINT_UPDATE', endpoint: 'sc-orders', status: 'syncing' });
    expect(result.syncState.endpoints['sc-orders'].httpStatus).toBeUndefined();
    expect(result.syncState.endpoints['sc-orders'].error).toBeUndefined();
  });

  it('preserves httpStatus from previous sync when not provided in update', () => {
    const state = makeState({
      syncState: makeSyncState({
        endpointOverrides: {
          'sc-orders': { status: 'error', lastSync: '2025-01-14T08:00:00Z', httpStatus: 403, error: 'Forbidden' }
        }
      })
    });
    const result = appReducer(state, {
      type: 'SYNC_ENDPOINT_UPDATE',
      endpoint: 'sc-orders',
      status: 'error'
    });
    expect(result.syncState.endpoints['sc-orders'].httpStatus).toBe(403);
    expect(result.syncState.endpoints['sc-orders'].error).toBe('Forbidden');
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

  it('does not reset endpoint states', () => {
    const state = makeState({
      syncState: makeSyncState({
        endpointOverrides: {
          'sc-orders': { status: 'synced', lastSync: '2025-01-14T08:00:00Z' },
          'dc-troop-report': { status: 'synced', lastSync: '2025-01-14T09:00:00Z' }
        }
      })
    });
    const result = appReducer(state, { type: 'SYNC_STARTED' });
    expect(result.syncState.endpoints['sc-orders'].status).toBe('synced');
    expect(result.syncState.endpoints['sc-orders'].lastSync).toBe('2025-01-14T08:00:00Z');
    expect(result.syncState.endpoints['dc-troop-report'].status).toBe('synced');
  });

  it('preserves booth endpoint states', () => {
    const state = makeState({
      syncState: makeSyncState({
        endpointOverrides: {
          'sc-booth-availability': { status: 'synced', lastSync: '2025-01-14T07:00:00Z' }
        }
      })
    });
    const result = appReducer(state, { type: 'SYNC_STARTED' });
    expect(result.syncState.endpoints['sc-booth-availability'].status).toBe('synced');
    expect(result.syncState.endpoints['sc-booth-availability'].lastSync).toBe('2025-01-14T07:00:00Z');
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

  it('preserves all endpoint states', () => {
    const state = makeState({
      syncState: makeSyncState({
        syncing: true,
        endpointOverrides: {
          'sc-orders': { status: 'synced', lastSync: '2025-01-15T10:00:00Z' },
          'sc-direct-ship': { status: 'error' }
        }
      })
    });
    const result = appReducer(state, { type: 'SYNC_FINISHED' });
    expect(result.syncState.endpoints['sc-orders'].status).toBe('synced');
    expect(result.syncState.endpoints['sc-direct-ship'].status).toBe('error');
  });
});

// =============================================================================
// BOOTH_REFRESH_STARTED
// =============================================================================

describe('BOOTH_REFRESH_STARTED', () => {
  it('sets refreshingBooths to true', () => {
    const state = makeState();
    const result = appReducer(state, { type: 'BOOTH_REFRESH_STARTED' });
    expect(result.syncState.refreshingBooths).toBe(true);
  });

  it('does not affect syncing state', () => {
    const state = makeState({ syncState: makeSyncState({ syncing: true }) });
    const result = appReducer(state, { type: 'BOOTH_REFRESH_STARTED' });
    expect(result.syncState.syncing).toBe(true);
    expect(result.syncState.refreshingBooths).toBe(true);
  });

  it('preserves endpoint states', () => {
    const state = makeState({
      syncState: makeSyncState({
        endpointOverrides: { 'sc-orders': { status: 'synced', lastSync: '2025-01-14T08:00:00Z' } }
      })
    });
    const result = appReducer(state, { type: 'BOOTH_REFRESH_STARTED' });
    expect(result.syncState.endpoints['sc-orders'].status).toBe('synced');
  });
});

// =============================================================================
// BOOTH_REFRESH_FINISHED
// =============================================================================

describe('BOOTH_REFRESH_FINISHED', () => {
  it('sets refreshingBooths to false', () => {
    const state = makeState({ syncState: makeSyncState({ refreshingBooths: true }) });
    const result = appReducer(state, { type: 'BOOTH_REFRESH_FINISHED' });
    expect(result.syncState.refreshingBooths).toBe(false);
  });

  it('does not affect syncing state', () => {
    const state = makeState({ syncState: makeSyncState({ syncing: true, refreshingBooths: true }) });
    const result = appReducer(state, { type: 'BOOTH_REFRESH_FINISHED' });
    expect(result.syncState.syncing).toBe(true);
    expect(result.syncState.refreshingBooths).toBe(false);
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
      ignoredTimeSlots: ['42|2025-02-01|10:00']
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
// SET_PROFILES
// =============================================================================

describe('SET_PROFILES', () => {
  it('sets profiles and activeProfile', () => {
    const state = makeState();
    const profiles = [
      { name: 'default', dirName: 'default', createdAt: '2025-01-01T00:00:00Z' },
      { name: 'snapshot', dirName: 'snapshot', createdAt: '2025-01-02T00:00:00Z' }
    ];
    const result = appReducer(state, {
      type: 'SET_PROFILES',
      profiles,
      activeProfile: { dirName: 'snapshot', name: 'snapshot', isDefault: false }
    });
    expect(result.profiles).toEqual(profiles);
    expect(result.activeProfile).toEqual({ dirName: 'snapshot', name: 'snapshot', isDefault: false });
  });

  it('sets default profile', () => {
    const state = makeState();
    const profiles = [{ name: 'default', dirName: 'default', createdAt: '2025-01-01T00:00:00Z' }];
    const result = appReducer(state, {
      type: 'SET_PROFILES',
      profiles,
      activeProfile: { dirName: 'default', name: 'default', isDefault: true }
    });
    expect(result.activeProfile?.isDefault).toBe(true);
  });
});

// =============================================================================
// LOAD_CONFIG with non-default profile
// =============================================================================

describe('LOAD_CONFIG with non-default profile', () => {
  it('forces autoSyncEnabled to false on non-default profile', () => {
    const config = makeAppConfig({ autoSyncEnabled: true });
    const state = makeState({
      activeProfile: { dirName: 'snapshot', name: 'snapshot', isDefault: false }
    });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.autoSyncEnabled).toBe(false);
  });

  it('forces autoRefreshBoothsEnabled to false on non-default profile', () => {
    const config = makeAppConfig({ autoRefreshBoothsEnabled: true });
    const state = makeState({
      activeProfile: { dirName: 'snapshot', name: 'snapshot', isDefault: false }
    });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.autoRefreshBoothsEnabled).toBe(false);
  });

  it('respects config values on default profile', () => {
    const config = makeAppConfig({ autoSyncEnabled: true, autoRefreshBoothsEnabled: true });
    const state = makeState({
      activeProfile: { dirName: 'default', name: 'default', isDefault: true }
    });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.autoSyncEnabled).toBe(true);
    expect(result.autoRefreshBoothsEnabled).toBe(true);
  });

  it('respects config values when activeProfile is null', () => {
    const config = makeAppConfig({ autoSyncEnabled: true });
    const state = makeState({ activeProfile: null });
    const result = appReducer(state, { type: 'LOAD_CONFIG', config });
    expect(result.autoSyncEnabled).toBe(true);
  });
});

// =============================================================================
// TOGGLE guards for non-default profiles
// =============================================================================

describe('TOGGLE actions on non-default profile', () => {
  it('TOGGLE_AUTO_SYNC stays false on non-default profile', () => {
    const state = makeState({
      activeProfile: { dirName: 'snapshot', name: 'snapshot', isDefault: false },
      autoSyncEnabled: false
    });
    const result = appReducer(state, { type: 'TOGGLE_AUTO_SYNC', enabled: true });
    expect(result.autoSyncEnabled).toBe(false);
  });

  it('TOGGLE_AUTO_REFRESH_BOOTHS stays false on non-default profile', () => {
    const state = makeState({
      activeProfile: { dirName: 'snapshot', name: 'snapshot', isDefault: false },
      autoRefreshBoothsEnabled: false
    });
    const result = appReducer(state, { type: 'TOGGLE_AUTO_REFRESH_BOOTHS', enabled: true });
    expect(result.autoRefreshBoothsEnabled).toBe(false);
  });

  it('TOGGLE_AUTO_SYNC works on default profile', () => {
    const state = makeState({
      activeProfile: { dirName: 'default', name: 'default', isDefault: true },
      autoSyncEnabled: false
    });
    const result = appReducer(state, { type: 'TOGGLE_AUTO_SYNC', enabled: true });
    expect(result.autoSyncEnabled).toBe(true);
  });

  it('TOGGLE_AUTO_REFRESH_BOOTHS works on default profile', () => {
    const state = makeState({
      activeProfile: { dirName: 'default', name: 'default', isDefault: true },
      autoRefreshBoothsEnabled: false
    });
    const result = appReducer(state, { type: 'TOGGLE_AUTO_REFRESH_BOOTHS', enabled: true });
    expect(result.autoRefreshBoothsEnabled).toBe(true);
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
    const result = appReducer(state, { type: 'OPEN_SETTINGS' });
    expect(result).not.toBe(state);
  });
});
