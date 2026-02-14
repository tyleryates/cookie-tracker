// useSync — sync handler, booth refresh, auto-sync polling, IPC event listeners

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { SYNC_ENDPOINTS } from '../../constants';
import Logger from '../../logger';
import type { AppConfig, SyncState } from '../../types';
import type { Action } from '../app-reducer';
import { ipcInvoke, ipcInvokeRaw, onIpcEvent } from '../ipc';
import { countAvailableSlots } from '../reports/available-booths';

// ============================================================================
// AUTO-SYNC — staleness-based polling
// ============================================================================

const CHECK_INTERVAL_MS = 60_000;

function isStale(lastSync: string | undefined | null, maxAgeMs: number): boolean {
  if (!lastSync) return true;
  return Date.now() - new Date(lastSync).getTime() > maxAgeMs;
}

// ============================================================================
// HOOK
// ============================================================================

export function useSync(
  dispatch: (action: Action) => void,
  showStatus: (msg: string, type: 'success' | 'warning' | 'error') => void,
  loadData: (opts?: { showMessages?: boolean }) => Promise<boolean>,
  appConfig: AppConfig | null,
  syncState: SyncState,
  autoSyncEnabled: boolean,
  autoRefreshBoothsEnabled: boolean
) {
  const refreshBoothsRef = useRef<() => Promise<void>>();
  const appConfigRef = useRef(appConfig);
  appConfigRef.current = appConfig;

  const sync = useCallback(async () => {
    try {
      Logger.info('Sync: starting');
      dispatch({ type: 'SYNC_STARTED' });
      showStatus('Starting API sync for both platforms...', 'success');

      // Also check for app updates (fire-and-forget)
      ipcInvoke('check-for-updates').catch(() => {});

      const result = await ipcInvokeRaw('scrape-websites');
      const errors: string[] = [];
      const parts: string[] = [];

      if (!result.success) {
        errors.push(result.error || 'Unknown error');
      }

      const scrapeData = result.success ? result.data : null;

      if (scrapeData) {
        if (scrapeData.digitalCookie?.success) {
          parts.push('Digital Cookie downloaded');
        } else if (scrapeData.digitalCookie?.error) {
          errors.push(`Digital Cookie: ${scrapeData.digitalCookie.error}`);
        }

        if (scrapeData.smartCookie?.success) {
          parts.push('Smart Cookie downloaded');
        } else if (scrapeData.smartCookie?.error) {
          errors.push(`Smart Cookie: ${scrapeData.smartCookie.error}`);
        }

        if (scrapeData.error) errors.push(scrapeData.error);

        // Apply final per-endpoint statuses from results (authoritative, replaces progress events)
        if (scrapeData.endpointStatuses) {
          for (const [endpoint, info] of Object.entries(scrapeData.endpointStatuses)) {
            dispatch({
              type: 'SYNC_ENDPOINT_UPDATE',
              endpoint,
              status: info.status,
              lastSync: info.lastSync,
              durationMs: info.durationMs,
              dataSize: info.dataSize,
              httpStatus: info.httpStatus,
              error: info.error
            });
          }
        }
      }

      // Reload data if anything succeeded (even partial — e.g. SC ok, DC failed)
      if (parts.length > 0) {
        await loadData({ showMessages: false });
      }

      if (parts.length > 0 && errors.length === 0) {
        Logger.info(`Sync: complete — ${parts.join(', ')}`);
        showStatus(`Sync complete! ${parts.join(', ')}`, 'success');
      } else if (parts.length > 0 && errors.length > 0) {
        Logger.warn(`Sync: partial — ${parts.join(', ')}. Errors: ${errors.join('; ')}`);
        showStatus(`Partial sync: ${parts.join(', ')}. Errors: ${errors.join('; ')}`, 'warning');
      } else if (errors.length > 0) {
        Logger.error(`Sync: failed — ${errors.join('; ')}`);
        showStatus(`Sync failed: ${errors.join('; ')}`, 'error');
      } else {
        Logger.warn('Sync: completed with warnings');
        showStatus('Sync completed with warnings', 'warning');
      }
    } catch (error) {
      showStatus(`Error: ${(error as Error).message}`, 'error');
      Logger.error('Sync error:', error);
    } finally {
      Logger.info('Sync: finished');
      dispatch({ type: 'SYNC_FINISHED' });
    }
  }, [dispatch, showStatus, loadData]);

  const refreshBooths = useCallback(async () => {
    try {
      Logger.info('Booth refresh: starting');
      dispatch({ type: 'BOOTH_REFRESH_STARTED' });

      const updated = await ipcInvoke('refresh-booth-locations');
      dispatch({ type: 'UPDATE_BOOTH_LOCATIONS', boothLocations: updated });

      if (appConfig) {
        const count = countAvailableSlots(updated, appConfig.boothDayFilters, appConfig.ignoredTimeSlots);
        if (count > 0) {
          const msg = `${count} time slot${count === 1 ? '' : 's'} found`;
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('Booths Available', { body: msg, tag: 'booth-availability', requireInteraction: true });
          } else {
            showStatus(`Booths available: ${msg}`, 'success');
          }
        } else {
          showStatus('No available booth slots found', 'success');
        }
      }
    } catch (error) {
      Logger.error('Booth availability refresh failed:', error);
      showStatus(`Booth refresh error: ${(error as Error).message}`, 'error');
    } finally {
      dispatch({ type: 'BOOTH_REFRESH_FINISHED' });
    }
  }, [dispatch, showStatus, appConfig]);
  refreshBoothsRef.current = refreshBooths;

  // IPC event listeners
  useEffect(() => {
    const cleanupProgress = onIpcEvent('scrape-progress', (progress) => {
      // Real-time UI updates: spinners for 'syncing', checkmarks/errors as each endpoint finishes.
      // Final statuses from ScrapeResults confirm these after sync completes.
      dispatch({
        type: 'SYNC_ENDPOINT_UPDATE',
        endpoint: progress.endpoint,
        status: progress.status,
        lastSync: progress.status === 'synced' ? new Date().toISOString() : undefined,
        cached: progress.cached,
        durationMs: progress.durationMs,
        dataSize: progress.dataSize,
        httpStatus: progress.httpStatus,
        error: progress.error
      });
    });

    const cleanupUpdateAvailable = onIpcEvent('update-available', (info) => {
      Logger.info(`Update v${info.version} available, downloading...`);
    });

    const cleanupUpdateDownloaded = onIpcEvent('update-downloaded', (info) => {
      Logger.info(`Update v${info.version} downloaded, ready to install`);
      dispatch({ type: 'UPDATE_DOWNLOADED', version: info.version });
    });

    return () => {
      cleanupProgress();
      cleanupUpdateAvailable();
      cleanupUpdateDownloaded();
    };
  }, [dispatch, showStatus]);

  // Auto-sync polling — uses refs to read latest state without resetting the timer
  const syncStateRef = useRef(syncState);
  syncStateRef.current = syncState;
  const reportsBusyRef = useRef(false);
  const boothsBusyRef = useRef(false);

  // Reports auto-sync effect
  useEffect(() => {
    if (!autoSyncEnabled) return;

    async function checkReports() {
      const state = syncStateRef.current;
      if (state.syncing || reportsBusyRef.current) return;

      const stale = SYNC_ENDPOINTS.filter((ep) => ep.syncAction === 'sync').some((ep) =>
        isStale(state.endpoints[ep.id]?.lastSync, ep.maxAgeMs)
      );

      if (stale) {
        reportsBusyRef.current = true;
        Logger.debug('Auto-sync: report endpoints stale, triggering...');
        try {
          await sync();
          Logger.debug('Auto-sync: reports completed');
        } catch (error) {
          Logger.error('Auto-sync reports error:', error);
        } finally {
          reportsBusyRef.current = false;
        }
      }
    }

    checkReports();
    const interval = setInterval(checkReports, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoSyncEnabled, sync]);

  // Booths auto-refresh effect
  useEffect(() => {
    if (!autoRefreshBoothsEnabled || !appConfig?.availableBoothsEnabled) return;

    async function checkBooths() {
      const state = syncStateRef.current;
      if (state.refreshingBooths || boothsBusyRef.current) return;

      const stale = SYNC_ENDPOINTS.filter((ep) => ep.syncAction === 'refreshBooths').some((ep) =>
        isStale(state.endpoints[ep.id]?.lastSync, ep.maxAgeMs)
      );

      if (stale) {
        boothsBusyRef.current = true;
        Logger.debug('Auto-sync: booth endpoints stale, triggering...');
        try {
          await refreshBooths();
          Logger.debug('Auto-sync: booths completed');
        } catch (error) {
          Logger.error('Auto-sync booths error:', error);
        } finally {
          boothsBusyRef.current = false;
        }
      }
    }

    checkBooths();
    const interval = setInterval(checkBooths, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefreshBoothsEnabled, appConfig?.availableBoothsEnabled, refreshBooths]);

  return { sync, refreshBooths };
}
