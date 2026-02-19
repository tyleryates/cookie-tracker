// useDataLoader — data loading, recalculation, export

import { useCallback } from 'preact/hooks';
import Logger from '../../logger';
import type { Action } from '../app-reducer';
import { loadDataFromDisk, loadDebugData, saveUnifiedDatasetToDisk } from '../data-loader';
import { ipcInvoke } from '../ipc';

export function useDataLoader(
  dispatch: (action: Action) => void,
  showStatus: (msg: string, type: 'success' | 'warning' | 'error') => void
) {
  const loadData = useCallback(
    async (opts?: { showMessages?: boolean }) => {
      const showMessages = opts?.showMessages ?? true;
      try {
        if (showMessages) showStatus('Loading data...', 'success');

        const result = await loadDataFromDisk();

        if (!result) {
          return false;
        }

        dispatch({ type: 'SET_UNIFIED', unified: result.unified });

        const anyLoaded = result.loaded.sc || result.loaded.dc || result.loaded.scReport || result.loaded.scTransfer;

        if (anyLoaded) {
          await saveUnifiedDatasetToDisk(result.unified);
          dispatch({ type: 'DEFAULT_REPORT' });
          if (showMessages) showStatus('Data loaded', 'success');
          return true;
        }

        if (result.loaded.issues.length > 0 && showMessages) {
          showStatus(`No reports loaded. ${result.loaded.issues.join(' | ')}`, 'warning');
        }
        return false;
      } catch (error) {
        // Always show load errors — even when showMessages is false (called from sync/init),
        // errors should be visible to the user
        showStatus(`Error loading files: ${(error as Error).message}`, 'error');
        Logger.error('Data load error:', error);
        return false;
      }
    },
    [dispatch, showStatus]
  );

  const recalculate = useCallback(() => {
    loadData({ showMessages: true });
  }, [loadData]);

  const exportData = useCallback(async () => {
    try {
      const result = await ipcInvoke('export-data');
      if (result) showStatus('Data exported', 'success');
    } catch (error) {
      showStatus(`Export failed: ${(error as Error).message}`, 'error');
    }
  }, [showStatus]);

  const injectDebug = useCallback(async () => {
    try {
      showStatus('Injecting debug data...', 'success');
      const result = await loadDebugData();
      if (!result) {
        showStatus('No data to inject into — load data first', 'warning');
        return;
      }
      dispatch({ type: 'SET_UNIFIED', unified: result.unified });
      showStatus('Debug data injected', 'success');
    } catch (error) {
      showStatus(`Debug inject failed: ${(error as Error).message}`, 'error');
      Logger.error('Debug inject error:', error);
    }
  }, [dispatch, showStatus]);

  return { loadData, recalculate, exportData, injectDebug };
}
