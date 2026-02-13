// useAppInit — app initialization (load config, data, hydrate sync timestamps)

import { useEffect } from 'preact/hooks';
import type { Action } from '../app-reducer';
import { loadAppConfig } from '../data-loader';
import { ipcInvoke } from '../ipc';

export function useAppInit(dispatch: (action: Action) => void, loadData: (opts?: { showMessages?: boolean }) => Promise<boolean>) {
  useEffect(() => {
    (async () => {
      const config = await loadAppConfig();

      // Hydrate per-endpoint sync timestamps BEFORE enabling auto-sync.
      // LOAD_CONFIG sets autoSyncEnabled which triggers the auto-sync effect,
      // so timestamps must be in state first to avoid a spurious full sync.
      try {
        const timestamps = await ipcInvoke('load-timestamps');
        for (const [endpoint, lastSync] of Object.entries(timestamps.endpoints)) {
          dispatch({ type: 'SYNC_ENDPOINT_UPDATE', endpoint, status: 'synced', lastSync });
        }
      } catch {
        // Non-fatal — endpoints start as idle, auto-sync will catch them
      }

      dispatch({ type: 'LOAD_CONFIG', config });
      await loadData({ showMessages: false });

      // Check if both logins are verified — if not, show welcome page
      try {
        const [creds, seasonal] = await Promise.all([ipcInvoke('load-credentials'), ipcInvoke('load-seasonal-data')]);
        const scOk = !!(creds.smartCookie.username && creds.smartCookie.password && seasonal.troop);
        const dcOk = !!(creds.digitalCookie.username && creds.digitalCookie.password && seasonal.dcRoles?.length);
        if (!scOk || !dcOk) {
          dispatch({ type: 'SET_WELCOME' });
        }
      } catch {
        dispatch({ type: 'SET_WELCOME' });
      }
    })();
  }, []);
}
