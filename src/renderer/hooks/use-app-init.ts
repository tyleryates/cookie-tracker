// useAppInit — app initialization (load config, data, hydrate sync timestamps)

import { useEffect } from 'preact/hooks';
import Logger from '../../logger';
import { toActiveProfile } from '../../types';
import type { Action } from '../app-reducer';
import { loadAppConfig } from '../data-loader';
import { pruneExpiredSlots } from '../format-utils';
import { ipcInvoke } from '../ipc';

export function useAppInit(dispatch: (action: Action) => void, loadData: (opts?: { showMessages?: boolean }) => Promise<boolean>) {
  useEffect(() => {
    (async () => {
      // Load profile info first — reducer uses it to force auto-sync off for non-default
      try {
        const profilesConfig = await ipcInvoke('load-profiles');
        const active = profilesConfig.profiles.find((p) => p.dirName === profilesConfig.activeProfile);
        if (active) {
          dispatch({ type: 'SET_PROFILES', profiles: profilesConfig.profiles, activeProfile: toActiveProfile(active) });
        }
      } catch {
        // Non-fatal — profiles default to empty
      }

      const config = await loadAppConfig();

      // Hydrate per-endpoint sync timestamps BEFORE enabling auto-sync.
      // LOAD_CONFIG sets autoSyncEnabled which triggers the auto-sync effect,
      // so timestamps must be in state first to avoid a spurious full sync.
      try {
        const timestamps = await ipcInvoke('load-timestamps');
        for (const [endpoint, meta] of Object.entries(timestamps.endpoints)) {
          dispatch({
            type: 'SYNC_ENDPOINT_UPDATE',
            endpoint,
            update: {
              status: meta.status,
              lastSync: meta.lastSync ?? undefined,
              durationMs: meta.durationMs,
              dataSize: meta.dataSize,
              httpStatus: meta.httpStatus,
              error: meta.error
            }
          });
        }
      } catch {
        // Non-fatal — endpoints start as idle, auto-sync will catch them
      }

      // Prune past ignored time slots on startup
      const pruned = pruneExpiredSlots(config.ignoredTimeSlots);
      if (pruned.length !== config.ignoredTimeSlots.length) {
        config.ignoredTimeSlots = pruned;
        ipcInvoke('update-config', { ignoredTimeSlots: pruned }).catch(() => {});
      }

      dispatch({ type: 'LOAD_CONFIG', config });
      await loadData({ showMessages: false });

      // Check if both logins are verified — if not, show welcome page
      const [credsResult, seasonalResult] = await Promise.allSettled([ipcInvoke('load-credentials'), ipcInvoke('load-seasonal-data')]);
      if (credsResult.status === 'rejected') Logger.warn('Failed to load credentials:', credsResult.reason);
      if (seasonalResult.status === 'rejected') Logger.warn('Failed to load seasonal data:', seasonalResult.reason);
      const creds = credsResult.status === 'fulfilled' ? credsResult.value : null;
      const seasonal = seasonalResult.status === 'fulfilled' ? seasonalResult.value : null;
      const scOk = !!(creds?.smartCookie?.username && creds?.smartCookie?.hasPassword && seasonal?.troop);
      const dcOk = !!(creds?.digitalCookie?.username && creds?.digitalCookie?.hasPassword && seasonal?.dcRoles?.length);
      if (!scOk || !dcOk) {
        dispatch({ type: 'SET_WELCOME' });
      }
    })();
  }, []);
}
