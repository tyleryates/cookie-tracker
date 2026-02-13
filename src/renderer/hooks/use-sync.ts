// useSync — sync handler, booth refresh, auto-sync polling, IPC event listeners

import { useCallback, useEffect, useRef } from 'preact/hooks';
import * as packageJson from '../../../package.json';
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

const SYNC_ACTIONS = ['sync', 'refreshBooths'] as const;
type SyncAction = (typeof SYNC_ACTIONS)[number];

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
  autoSyncEnabled: boolean
) {
  const refreshBoothsRef = useRef<() => Promise<void>>();

  const sync = useCallback(async () => {
    try {
      dispatch({ type: 'SYNC_STARTED' });
      showStatus('Starting API sync for both platforms...', 'success');

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
            dispatch({ type: 'SYNC_ENDPOINT_UPDATE', endpoint, status: info.status, lastSync: info.lastSync });
          }
        }
      }

      // Reload data if anything succeeded (even partial — e.g. SC ok, DC failed)
      if (parts.length > 0) {
        await loadData({ showMessages: false });
        // Also refresh booth availability so the notification fires after sync
        if (refreshBoothsRef.current) {
          await refreshBoothsRef.current();
        }
      }

      if (parts.length > 0 && errors.length === 0) {
        showStatus(`Sync complete! ${parts.join(', ')}`, 'success');
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
      dispatch({ type: 'SYNC_ENDPOINT_UPDATE', endpoint: 'sc-booth-availability', status: 'syncing' });

      const updated = await ipcInvoke('refresh-booth-locations');
      dispatch({ type: 'UPDATE_BOOTH_LOCATIONS', boothLocations: updated });

      const now = new Date().toISOString();
      dispatch({ type: 'SYNC_ENDPOINT_UPDATE', endpoint: 'sc-booth-availability', status: 'synced', lastSync: now });

      if (appConfig) {
        const count = countAvailableSlots(updated, appConfig.boothDayFilters, appConfig.ignoredTimeSlots);
        if (count > 0) {
          new Notification('Booths Available', {
            body: `${count} time slot${count === 1 ? '' : 's'} found`,
            tag: 'booth-availability',
            requireInteraction: true
          });
        }
      }
    } catch (error) {
      Logger.error('Booth availability refresh failed:', error);
      showStatus(`Booth refresh error: ${(error as Error).message}`, 'error');
      dispatch({ type: 'SYNC_ENDPOINT_UPDATE', endpoint: 'sc-booth-availability', status: 'error' });
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
        cached: progress.cached
      });
    });

    const cleanupUpdate = onIpcEvent('update-available', (info) => {
      const response = confirm(
        `New version ${info.version} is available!\n\n` +
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

  // Auto-sync polling — uses refs to read latest state without resetting the timer
  const syncStateRef = useRef(syncState);
  syncStateRef.current = syncState;
  const busyRef = useRef(false);

  useEffect(() => {
    if (!autoSyncEnabled) return;

    const actionFns: Record<SyncAction, () => Promise<void>> = { sync, refreshBooths };

    async function checkAndSync() {
      const state = syncStateRef.current;
      if (state.syncing || busyRef.current) return;

      for (const action of SYNC_ACTIONS) {
        const stale = SYNC_ENDPOINTS.filter((ep) => ep.syncAction === action).some((ep) =>
          isStale(state.endpoints[ep.id]?.lastSync, ep.maxAgeMs)
        );

        if (stale) {
          busyRef.current = true;
          Logger.debug(`Auto-sync: ${action} endpoints stale, triggering...`);
          try {
            await actionFns[action]();
            Logger.debug(`Auto-sync: ${action} completed`);
          } catch (error) {
            Logger.error(`Auto-sync ${action} error:`, error);
          } finally {
            busyRef.current = false;
          }
          return; // One action per check cycle
        }
      }
    }

    // Check immediately (covers app open + enable toggle)
    checkAndSync();

    // Then poll periodically
    const interval = setInterval(checkAndSync, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoSyncEnabled, sync, refreshBooths]);

  return { sync, refreshBooths };
}
