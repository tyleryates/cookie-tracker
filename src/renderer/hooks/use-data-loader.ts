// useDataLoader — data loading, recalculation, export, dataset switching

import { type MutableRef, useCallback } from 'preact/hooks';
import Logger from '../../logger';
import type { DataFileInfo } from '../../types';
import type { Action, AppState } from '../app-reducer';
import { exportUnifiedDataset, loadDataFromDisk, saveUnifiedDatasetToDisk } from '../data-loader';

export function useDataLoader(
  dispatch: (action: Action) => void,
  showStatus: (msg: string, type: 'success' | 'warning' | 'error') => void,
  stateRef: MutableRef<AppState>
) {
  const loadData = useCallback(
    async (opts?: {
      specificSc?: DataFileInfo | null;
      specificDc?: DataFileInfo | null;
      showMessages?: boolean;
      updateSyncTimestamps?: boolean;
    }) => {
      const showMessages = opts?.showMessages ?? true;
      try {
        if (showMessages) showStatus('Loading data...', 'success');

        const result = await loadDataFromDisk({
          specificSc: opts?.specificSc,
          specificDc: opts?.specificDc
        });

        if (!result) {
          return false;
        }

        dispatch({ type: 'SET_UNIFIED', unified: result.unified, datasetList: result.datasetList });
        if (!opts?.specificSc && !opts?.specificDc) {
          dispatch({ type: 'SET_DATASET_INDEX', index: 0 });
        }

        // Only update sync timestamps on initial load / dataset change — not after
        // a sync, where the sync handler already set the correct status (including errors).
        if (opts?.updateSyncTimestamps) {
          if (result.loaded.scTimestamp) {
            dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'sc', patch: { status: 'synced', lastSync: result.loaded.scTimestamp } });
          }
          if (result.loaded.dcTimestamp) {
            dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'dc', patch: { status: 'synced', lastSync: result.loaded.dcTimestamp } });
          }
        }

        const anyLoaded = result.loaded.sc || result.loaded.dc || result.loaded.scReport || result.loaded.scTransfer;

        if (anyLoaded) {
          await saveUnifiedDatasetToDisk(result.unified);
          dispatch({ type: 'DEFAULT_REPORT' });
          if (showMessages) showStatus(`✅ Loaded ${result.datasetList.length} dataset(s)`, 'success');
          return true;
        }

        if (result.loaded.issues.length > 0 && showMessages) {
          showStatus(`No reports loaded. ${result.loaded.issues.join(' | ')}`, 'warning');
        }
        return false;
      } catch (error) {
        if (showMessages) showStatus(`Error loading files: ${(error as Error).message}`, 'error');
        Logger.error('Data load error:', error);
        return false;
      }
    },
    [dispatch, showStatus]
  );

  const recalculate = useCallback(() => {
    loadData({ showMessages: true });
  }, [loadData]);

  const exportData = useCallback(() => {
    const { unified } = stateRef.current;
    if (!unified) {
      alert('No unified dataset available to export.');
      return;
    }
    exportUnifiedDataset(unified);
  }, [stateRef]);

  const changeDataset = useCallback(
    async (index: number) => {
      const { currentDatasetIndex, datasetList } = stateRef.current;
      if (index === currentDatasetIndex || !datasetList[index]) return;
      dispatch({ type: 'SET_DATASET_INDEX', index });
      const dataset = datasetList[index];
      showStatus('Loading dataset...', 'success');

      const loaded = await loadData({
        specificSc: dataset.scFile,
        specificDc: dataset.dcFile,
        showMessages: false
      });

      if (loaded) {
        showStatus(`Loaded dataset: ${dataset.label}`, 'success');
      }
    },
    [dispatch, showStatus, loadData, stateRef]
  );

  return { loadData, recalculate, exportData, changeDataset };
}
