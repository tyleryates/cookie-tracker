// Typed IPC wrappers — compile-time safe channel names, request params, and response types.

import type { IpcChannelMap, IpcEventMap, IpcResponse } from '../types';

type HasRequest<K extends keyof IpcChannelMap> = IpcChannelMap[K]['request'] extends undefined ? [] : [IpcChannelMap[K]['request']];

/**
 * Typed `ipcRenderer.invoke` — throws on IPC failure, returns clean response type.
 * Use in call sites that handle errors via try/catch.
 */
export async function ipcInvoke<K extends keyof IpcChannelMap>(channel: K, ...args: HasRequest<K>): Promise<IpcChannelMap[K]['response']> {
  const result: IpcResponse<IpcChannelMap[K]['response']> = await window.electronAPI.invoke(channel, ...args);
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/**
 * Typed `ipcRenderer.invoke` — returns raw `IpcResponse<T>` for call sites
 * that inspect success/error manually (like handleSync).
 */
export async function ipcInvokeRaw<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: HasRequest<K>
): Promise<IpcResponse<IpcChannelMap[K]['response']>> {
  return window.electronAPI.invoke(channel, ...args);
}

/**
 * Typed IPC event listener. Returns a cleanup function for use in `useEffect`.
 */
export function onIpcEvent<K extends keyof IpcEventMap>(channel: K, handler: (data: IpcEventMap[K]) => void): () => void {
  return window.electronAPI.on(channel, handler as (...args: any[]) => void);
}
