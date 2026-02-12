// useSync — sync handler, booth refresh, IPC event listeners

import { useCallback, useEffect } from 'preact/hooks';
import * as packageJson from '../../../package.json';
import Logger from '../../logger';
import type { AppConfig } from '../../types';
import type { Action } from '../app-reducer';
import { ipcInvoke, ipcInvokeRaw, onIpcEvent } from '../ipc';
import { countAvailableSlots } from '../reports/available-booths';

export function useSync(
  dispatch: (action: Action) => void,
  showStatus: (msg: string, type: 'success' | 'warning' | 'error') => void,
  loadData: (opts?: { showMessages?: boolean }) => Promise<boolean>,
  appConfig: AppConfig | null
) {
  const sync = useCallback(async () => {
    try {
      dispatch({ type: 'SYNC_STARTED' });
      showStatus('Starting API sync for both platforms...', 'success');

      const result = await ipcInvokeRaw('scrape-websites');
      const now = new Date().toISOString();
      const errors: string[] = [];
      const parts: string[] = [];

      if (!result.success) {
        errors.push(result.error || 'Unknown error');
      }

      const scrapeData = result.success ? result.data : null;

      // Update DC and SC status
      if (scrapeData) {
        for (const [key, label] of [
          ['dc', 'Digital Cookie'],
          ['sc', 'Smart Cookie']
        ] as const) {
          const sourceKey = key === 'dc' ? 'digitalCookie' : 'smartCookie';
          const sourceResult = scrapeData[sourceKey];
          if (!sourceResult) continue;
          if (sourceResult.success) {
            dispatch({ type: 'SYNC_SOURCE_UPDATE', source: key, patch: { status: 'synced', lastSync: now, progress: 100 } });
            parts.push(`${label} downloaded`);
          } else {
            dispatch({ type: 'SYNC_SOURCE_UPDATE', source: key, patch: { status: 'error', errorMessage: sourceResult.error } });
            if (sourceResult.error) errors.push(`${label}: ${sourceResult.error}`);
          }
        }

        // Booth availability is fetched as part of the SC scrape — update booth timestamp too
        if (scrapeData.smartCookie?.success) {
          dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'booth', patch: { status: 'synced', lastSync: now } });
          ipcInvoke('update-config', { lastBoothSync: now });
        }

        if (scrapeData.error) errors.push(scrapeData.error);
      }

      // Reload data if anything succeeded (even partial — e.g. SC ok, DC failed)
      if (parts.length > 0) {
        await loadData({ showMessages: false });
      }

      if (parts.length > 0 && errors.length === 0) {
        showStatus(`✅ Sync complete! ${parts.join(', ')}`, 'success');
      } else if (parts.length > 0 && errors.length > 0) {
        showStatus(`Partial sync: ${parts.join(', ')}. Errors: ${errors.join('; ')}`, 'warning');
      } else if (errors.length > 0) {
        showStatus(`Sync failed: ${errors.join('; ')}`, 'error');
      } else {
        showStatus('Sync completed with warnings', 'warning');
      }
    } catch (error) {
      showStatus(`Error: ${(error as Error).message}`, 'error');
      Logger.error('Sync error:', error);
    } finally {
      dispatch({ type: 'SYNC_FINISHED' });
    }
  }, [dispatch, showStatus, loadData]);

  const refreshBooths = useCallback(async () => {
    try {
      showStatus('Refreshing booth availability...', 'success');
      dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'booth', patch: { status: 'syncing' } });

      const updated = await ipcInvoke('refresh-booth-locations');
      dispatch({ type: 'UPDATE_BOOTH_LOCATIONS', boothLocations: updated });

      const now = new Date().toISOString();
      dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'booth', patch: { status: 'synced', lastSync: now } });
      ipcInvoke('update-config', { lastBoothSync: now });
      showStatus(`✅ Booth availability refreshed (${updated.length} locations)`, 'success');

      if (appConfig) {
        const count = countAvailableSlots(updated, appConfig.boothDayFilters, appConfig.ignoredTimeSlots);
        if (count > 0) {
          new Notification('Booths Available', {
            body: `${count} time slot${count === 1 ? '' : 's'} found`
          });
        }
      }
    } catch (error) {
      Logger.error('Booth availability refresh failed:', error);
      showStatus(`Booth refresh error: ${(error as Error).message}`, 'error');
      dispatch({ type: 'SYNC_SOURCE_UPDATE', source: 'booth', patch: { status: 'error' } });
    }
  }, [dispatch, showStatus, appConfig]);

  // IPC event listeners
  useEffect(() => {
    const cleanupProgress = onIpcEvent('scrape-progress', (progress) => {
      dispatch({
        type: 'SYNC_SOURCE_UPDATE',
        source: progress.source,
        patch: {
          progress: progress.progress,
          progressText: progress.status,
          status: progress.progress >= 100 ? 'synced' : 'syncing'
        }
      });
    });

    const cleanupUpdate = onIpcEvent('update-available', (info) => {
      const response = confirm(
        `🎉 New version ${info.version} is available!\n\n` +
          `You're currently on version ${packageJson.version}\n\n` +
          'Click OK to download the latest version from GitHub.'
      );
      if (response) {
        window.electronAPI.openExternal('https://github.com/tyleryates/cookie-tracker/releases/latest');
        showStatus('Opening download page...', 'success');
      }
    });

    return () => {
      cleanupProgress();
      cleanupUpdate();
    };
  }, [dispatch, showStatus]);

  return { sync, refreshBooths };
}
