// Data Loader — thin IPC wrapper for the renderer.
// All data processing happens in the main process via the data pipeline.

import { ipcRenderer } from 'electron';
import Logger from '../logger';
import type { AppConfig, DataFileInfo, UnifiedDataset } from '../types';
import { DateFormatter } from './format-utils';

// ============================================================================
// TYPES (mirrored from data-pipeline.ts for renderer use)
// ============================================================================

export interface DatasetEntry {
  label: string;
  scFile: DataFileInfo | null;
  dcFile: DataFileInfo | null;
  timestamp: string;
}

interface LoadedSources {
  sc: boolean;
  dc: boolean;
  scReport: boolean;
  scTransfer: boolean;
  issues: string[];
  scTimestamp: string | null;
  dcTimestamp: string | null;
}

interface LoadDataResult {
  unified: UnifiedDataset;
  datasetList: DatasetEntry[];
  loaded: LoadedSources;
}

// ============================================================================
// DATA LOADING (delegates to main process)
// ============================================================================

export async function loadDataFromDisk(options?: {
  specificSc?: DataFileInfo | null;
  specificDc?: DataFileInfo | null;
}): Promise<LoadDataResult | null> {
  const result = await ipcRenderer.invoke('load-data', options);

  // Handle IPC wrapper format
  if (result && typeof result === 'object' && 'success' in result) {
    if (!result.success) return null;
    return result.data || null;
  }

  if (!result) return null;

  // Rehydrate the Map (IPC serializes Map as plain object)
  if (result.unified?.scouts && !(result.unified.scouts instanceof Map)) {
    result.unified.scouts = new Map(Object.entries(result.unified.scouts));
  }
  if (result.unified?.virtualCookieShareAllocations && !(result.unified.virtualCookieShareAllocations instanceof Map)) {
    const raw = result.unified.virtualCookieShareAllocations;
    result.unified.virtualCookieShareAllocations = new Map(Object.entries(raw).map(([k, v]) => [Number(k), v as number]));
  }

  return result;
}

// ============================================================================
// DATA EXPORT
// ============================================================================

function serializeUnifiedDataset(unified: UnifiedDataset): Record<string, any> {
  return {
    scouts: Array.from(unified.scouts.entries()).map(([name, scout]) => ({
      name,
      ...scout
    })),
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

    const result = await ipcRenderer.invoke('save-file', {
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
    const result = await ipcRenderer.invoke('load-config');
    if (result && typeof result === 'object' && 'success' in result) {
      return result.data;
    }
    return result;
  } catch (err) {
    Logger.error('Failed to load config:', err);
    return { autoSyncEnabled: true, boothIds: [], boothDayFilters: [], ignoredTimeSlots: [] };
  }
}
