// Data Loader — thin IPC wrapper for the renderer.
// All data processing happens in the main process via the data pipeline.

import { PIPELINE_FILES } from '../constants';
import Logger from '../logger';
import type { AppConfig, LoadDataResult, RawDataRow, UnifiedDataset } from '../types';
import { ipcInvoke } from './ipc';

// ============================================================================
// DATA LOADING (delegates to main process)
// ============================================================================

export async function loadDataFromDisk(): Promise<LoadDataResult | null> {
  try {
    return await ipcInvoke('load-data');
  } catch {
    return null;
  }
}

// ============================================================================
// DATA EXPORT
// ============================================================================

function serializeUnifiedDataset(unified: UnifiedDataset): RawDataRow {
  return {
    scouts: Object.entries(unified.scouts).map(([name, scout]) => {
      const { name: _existingName, ...rest } = scout;
      return { name, ...rest };
    }),
    siteOrders: unified.siteOrders,
    troopTotals: unified.troopTotals,
    transferBreakdowns: unified.transferBreakdowns,
    varieties: unified.varieties,
    cookieShare: unified.cookieShare,
    metadata: unified.metadata
  };
}

export async function saveUnifiedDatasetToDisk(unified: UnifiedDataset): Promise<void> {
  try {
    const exportData = serializeUnifiedDataset(unified);
    const jsonStr = JSON.stringify(exportData, null, 2);

    await ipcInvoke('save-file', { filename: PIPELINE_FILES.UNIFIED, content: jsonStr });
    Logger.debug('Unified dataset saved');
    await ipcInvoke('record-unified-build');
  } catch (error) {
    Logger.error('Error saving unified dataset:', error);
  }
}

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    return await ipcInvoke('load-config');
  } catch (err) {
    Logger.error('Failed to load config:', err);
    return {
      autoUpdateEnabled: true,
      autoSyncEnabled: true,
      autoRefreshBoothsEnabled: true,
      availableBoothsEnabled: false,
      boothAlertImessage: false,
      boothAlertRecipient: '',
      boothNotifiedSlots: [],
      boothIds: [],
      boothDayFilters: [],
      ignoredTimeSlots: []
    };
  }
}
