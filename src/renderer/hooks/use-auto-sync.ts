// useAutoSync — hourly sync + 15-min booth refresh timers

import { useEffect } from 'preact/hooks';
import Logger from '../../logger';

const AUTO_SYNC_INTERVAL_MS = 3600000; // 1 hour
const BOOTH_REFRESH_INTERVAL_MS = 900000; // 15 minutes

export function useAutoSync(enabled: boolean, sync: () => Promise<void>, refreshBooths: () => Promise<void>) {
  useEffect(() => {
    if (!enabled) return;

    const syncInterval = setInterval(async () => {
      Logger.debug('Auto-sync: Starting hourly sync...');
      try {
        await sync();
        Logger.debug('Auto-sync: Completed successfully');
      } catch (error) {
        Logger.error('Auto-sync error:', error);
      }
    }, AUTO_SYNC_INTERVAL_MS);

    const boothInterval = setInterval(async () => {
      Logger.debug('Booth refresh: Starting 15-min refresh...');
      try {
        await refreshBooths();
        Logger.debug('Booth refresh: Completed');
      } catch (error) {
        Logger.error('Booth refresh error:', error);
      }
    }, BOOTH_REFRESH_INTERVAL_MS);

    Logger.debug('Auto-sync: Started (syncs every hour)');
    Logger.debug('Booth refresh: Started (refreshes every 15 min)');

    return () => {
      clearInterval(syncInterval);
      clearInterval(boothInterval);
      Logger.debug('Auto-sync: Stopped');
      Logger.debug('Booth refresh: Stopped');
    };
  }, [enabled, sync, refreshBooths]);
}
