// useDataLoader — data loading and export

import { useCallback } from 'preact/hooks';
import Logger, { getErrorMessage } from '../../logger';
import type { Action } from '../app-reducer';
import { loadDataFromDisk, saveUnifiedDatasetToDisk } from '../data-loader';
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
        showStatus(`Error loading files: ${getErrorMessage(error)}`, 'error');
        Logger.error('Data load error:', error);
        return false;
      }
    },
    [dispatch, showStatus]
  );

  const exportData = useCallback(async () => {
    try {
      const result = await ipcInvoke('export-data');
      if (result) showStatus('Data exported', 'success');
    } catch (error) {
      showStatus(`Export failed: ${getErrorMessage(error)}`, 'error');
    }
  }, [showStatus]);

  return { loadData, exportData };
}
