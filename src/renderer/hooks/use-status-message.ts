// useStatusMessage — status banner callback + auto-hide effect

import { useCallback, useEffect } from 'preact/hooks';
import type { Action, StatusMessage } from '../app-reducer';

const STATUS_MESSAGE_TIMEOUT_MS = 3000;

export function useStatusMessage(dispatch: (action: Action) => void, statusMessage: StatusMessage | null) {
  const showStatus = useCallback(
    (msg: string, type: 'success' | 'warning' | 'error') => {
      dispatch({ type: 'SET_STATUS', msg, statusType: type });
    },
    [dispatch]
  );

  // Auto-hide success messages (errors/warnings stay until manually dismissed or replaced)
  useEffect(() => {
    if (!statusMessage || statusMessage.type !== 'success') return;

    const timeout = setTimeout(() => {
      dispatch({ type: 'CLEAR_STATUS' });
    }, STATUS_MESSAGE_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [statusMessage, dispatch]);

  return { showStatus };
}
