// Data Loader — thin IPC wrapper for the renderer.
// All data processing happens in the main process via the data pipeline.

import { PIPELINE_FILES } from '../constants';
import Logger from '../logger';
import type { AppConfig, LoadDataResult, UnifiedDataset } from '../types';
import { ipcInvoke, ipcInvokeRaw } from './ipc';

// ============================================================================
// DATA LOADING (delegates to main process)
// ============================================================================

export async function loadDataFromDisk(): Promise<LoadDataResult | null> {
  const result = await ipcInvokeRaw('load-data');

  // Unwrap standardized IPC format { success, data }
  if (!result?.success) return null;
  const data = result.data;
  if (!data) return null;

  return data;
}

// ============================================================================
// DATA EXPORT
// ============================================================================

function serializeUnifiedDataset(unified: UnifiedDataset): Record<string, any> {
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

    const result = await ipcInvokeRaw('save-file', { filename: PIPELINE_FILES.UNIFIED, content: jsonStr });

    if (result.success) {
      Logger.debug('Unified dataset saved');
      // Record build timestamp
      await ipcInvokeRaw('record-unified-build');
    } else {
      Logger.error('Failed to save unified dataset:', result.error);
    }
  } catch (error) {
    Logger.error('Error saving unified dataset:', error);
  }
}

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    return await ipcInvoke('load-config');
  } catch (err) {
    Logger.error('Failed to load config:', err);
    return { autoSyncEnabled: true, boothIds: [], boothDayFilters: [], ignoredTimeSlots: [] };
  }
}
