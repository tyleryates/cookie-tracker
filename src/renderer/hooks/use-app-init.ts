// useAppInit — app initialization (load config, data, check login status)

import { useCallback, useEffect } from 'preact/hooks';
import type { Action } from '../app-reducer';
import { loadAppConfig } from '../data-loader';
import { ipcInvoke } from '../ipc';

export function useAppInit(
  dispatch: (action: Action) => void,
  loadData: (opts?: { showMessages?: boolean; updateSyncTimestamps?: boolean }) => Promise<boolean>
) {
  const checkLoginStatus = useCallback(async () => {
    try {
      const creds = await ipcInvoke('load-credentials');
      const dc = creds.digitalCookie;
      const sc = creds.smartCookie;
      dispatch({ type: 'SET_SETUP_HINT', show: !(dc.username && dc.password && sc.username && sc.password) });
    } catch {
      dispatch({ type: 'SET_SETUP_HINT', show: true });
    }
  }, [dispatch]);

  // Init effect
  useEffect(() => {
    (async () => {
      const config = await loadAppConfig();
      dispatch({ type: 'LOAD_CONFIG', config });
      await loadData({ showMessages: false, updateSyncTimestamps: true });
      await checkLoginStatus();
    })();
  }, []);

  return { checkLoginStatus };
}
