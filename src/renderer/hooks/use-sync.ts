// useSync — sync handler, booth refresh, auto-sync polling, IPC event listeners

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { CHECK_INTERVAL_MS, SYNC_ENDPOINTS } from '../../constants';
import Logger from '../../logger';
import type { AppConfig, SyncState } from '../../types';
import type { Action } from '../app-reducer';
import { pruneExpiredSlots } from '../format-utils';
import { ipcInvoke, ipcInvokeRaw, onIpcEvent } from '../ipc';
import { encodeSlotKey, summarizeAvailableSlots } from '../reports/available-booths-utils';
import { filterNewSlots, formatImessageBody, formatNotificationBody, formatSyncResult, isStale, markNotified } from './sync-formatters';

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
              update: {
                status: info.status,
                lastSync: info.lastSync,
                durationMs: info.durationMs,
                dataSize: info.dataSize,
                httpStatus: info.httpStatus,
                error: info.error
              }
            });
          }
        }
      }

      // Reload data if anything succeeded (even partial — e.g. SC ok, DC failed)
      if (parts.length > 0) {
        await loadData({ showMessages: false });
      }

      const syncMessage = formatSyncResult(parts, errors);
      Logger[syncMessage.logLevel](`Sync: ${syncMessage.logMsg}`);
      showStatus(syncMessage.userMsg, syncMessage.type);
    } catch (error) {
      showStatus(`Error: ${(error as Error).message}`, 'error');
      Logger.error('Sync error:', error);
    } finally {
      Logger.info('Sync: finished');
      dispatch({ type: 'SYNC_FINISHED' });
    }
  }, [dispatch, showStatus, loadData]);

  const refreshBooths = useCallback(async () => {
    const config = appConfigRef.current;
    try {
      Logger.info('Booth refresh: starting');
      dispatch({ type: 'BOOTH_REFRESH_STARTED' });

      const updated = await ipcInvoke('refresh-booth-locations');
      dispatch({ type: 'UPDATE_BOOTH_LOCATIONS', boothLocations: updated });

      if (config) {
        // Prune past ignored time slots (by date, not time)
        const prunedIgnored = pruneExpiredSlots(config.ignoredTimeSlots);
        if (prunedIgnored.length !== config.ignoredTimeSlots.length) {
          dispatch({ type: 'UPDATE_CONFIG', patch: { ignoredTimeSlots: prunedIgnored } });
          ipcInvoke('update-config', { ignoredTimeSlots: prunedIgnored }).catch(() => {});
        }

        // Build set of currently available slot keys from raw booth data
        const currentlyAvailable = new Set<string>();
        for (const loc of updated) {
          for (const d of loc.availableDates || []) {
            for (const s of d.timeSlots) {
              currentlyAvailable.add(encodeSlotKey(loc.id, d.date, s.startTime));
            }
          }
        }

        // Prune notified slots no longer available — reopened slots will re-trigger
        const prevNotifiedSlots = config.boothNotifiedSlots ?? [];
        const notified = new Set(prevNotifiedSlots.filter((key) => currentlyAvailable.has(key)));
        let notifiedDirty = notified.size !== prevNotifiedSlots.length;

        const booths = summarizeAvailableSlots(updated, config.boothDayFilters, prunedIgnored);
        const count = booths.reduce((sum, b) => sum + b.slotCount, 0);
        if (count > 0) {
          const notifBody = formatNotificationBody(booths);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('Booths Available', { body: notifBody, tag: 'booth-availability', requireInteraction: true });
          } else {
            showStatus(`Booths available: ${notifBody}`, 'success');
          }
          if (config.boothAlertImessage && config.boothAlertRecipient) {
            const newBooths = filterNewSlots(booths, notified);
            if (newBooths.length > 0) {
              markNotified(newBooths, notified);
              notifiedDirty = true;
              ipcInvoke('send-imessage', {
                recipient: config.boothAlertRecipient,
                message: formatImessageBody(newBooths)
              }).catch(() => {});
            }
          }
        } else {
          showStatus('No available booth slots found', 'success');
        }

        // Persist notified set if changed (pruned stale entries or added new ones)
        if (notifiedDirty) {
          const updatedSlots = [...notified];
          dispatch({ type: 'UPDATE_CONFIG', patch: { boothNotifiedSlots: updatedSlots } });
          ipcInvoke('update-config', { boothNotifiedSlots: updatedSlots }).catch(() => {});
        }
      }
    } catch (error) {
      Logger.error('Booth availability refresh failed:', error);
      showStatus(`Booth refresh error: ${(error as Error).message}`, 'error');
    } finally {
      dispatch({ type: 'BOOTH_REFRESH_FINISHED' });
    }
  }, [dispatch, showStatus]);
  refreshBoothsRef.current = refreshBooths;

  // IPC event listeners
  useEffect(() => {
    const cleanupProgress = onIpcEvent('scrape-progress', (progress) => {
      // Real-time UI updates: spinners for 'syncing', checkmarks/errors as each endpoint finishes.
      // Final statuses from ScrapeResults confirm these after sync completes.
      dispatch({
        type: 'SYNC_ENDPOINT_UPDATE',
        endpoint: progress.endpoint,
        update: {
          status: progress.status,
          lastSync: progress.status === 'synced' ? new Date().toISOString() : undefined,
          cached: progress.cached,
          durationMs: progress.durationMs,
          dataSize: progress.dataSize,
          httpStatus: progress.httpStatus,
          error: progress.error
        }
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
