// Data Loader — thin IPC wrapper for the renderer.
// All data processing happens in the main process via the data pipeline.

import Logger from '../logger';
import type { AppConfig, DataFileInfo, DatasetEntry, LoadDataResult, UnifiedDataset } from '../types';
import { DateFormatter } from './format-utils';
import { ipcInvoke, ipcInvokeRaw } from './ipc';

export type { DatasetEntry };

// ============================================================================
// DATA LOADING (delegates to main process)
// ============================================================================

export async function loadDataFromDisk(options?: {
  specificSc?: DataFileInfo | null;
  specificDc?: DataFileInfo | null;
}): Promise<LoadDataResult | null> {
  const result = await ipcInvokeRaw('load-data', options);

  // Unwrap standardized IPC format { success, data }
  if (!result?.success) return null;
  const data = result.data;
  if (!data) return null;

  // Rehydrate Maps (IPC serializes Map as plain object)
  if (data.unified?.scouts && !(data.unified.scouts instanceof Map)) {
    data.unified.scouts = new Map(Object.entries(data.unified.scouts));
  }
  if (data.unified?.virtualCookieShareAllocations && !(data.unified.virtualCookieShareAllocations instanceof Map)) {
    const raw = data.unified.virtualCookieShareAllocations;
    data.unified.virtualCookieShareAllocations = new Map(Object.entries(raw).map(([k, v]) => [Number(k), v as number]));
  }

  return data;
}

// ============================================================================
// DATA EXPORT
// ============================================================================

function serializeUnifiedDataset(unified: UnifiedDataset): Record<string, any> {
  return {
    scouts: Array.from(unified.scouts.entries()).map(([name, scout]) => {
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
    const timestamp = DateFormatter.toTimestamp();
    const filename = `unified-${timestamp}.json`;

    const result = await ipcInvokeRaw('save-file', {
      filename: filename,
      content: jsonStr,
      type: 'unified'
    });

    if (result.success) {
      Logger.debug(`Unified dataset saved: ${filename}`);
    } else {
      Logger.error('Failed to save unified dataset:', result.error);
    }
  } catch (error) {
    Logger.error('Error saving unified dataset:', error);
  }
}

export function exportUnifiedDataset(unified: UnifiedDataset): void {
  const exportData = serializeUnifiedDataset(unified);
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().split('T')[0];
  a.download = `unified-dataset-${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    return await ipcInvoke('load-config');
  } catch (err) {
    Logger.error('Failed to load config:', err);
    return { autoSyncEnabled: true, boothIds: [], boothDayFilters: [], ignoredTimeSlots: [] };
  }
}
