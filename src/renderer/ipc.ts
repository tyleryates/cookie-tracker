// Typed IPC wrappers — compile-time safe channel names, request params, and response types.

import { ipcRenderer } from 'electron';
import type { IpcChannelMap, IpcEventMap, IpcResponse } from '../types';

type HasRequest<K extends keyof IpcChannelMap> = IpcChannelMap[K]['request'] extends undefined ? [] : [IpcChannelMap[K]['request']];

/**
 * Typed `ipcRenderer.invoke` — throws on IPC failure, returns clean response type.
 * Use in call sites that handle errors via try/catch.
 */
export async function ipcInvoke<K extends keyof IpcChannelMap>(channel: K, ...args: HasRequest<K>): Promise<IpcChannelMap[K]['response']> {
  const result: IpcResponse<IpcChannelMap[K]['response']> = await ipcRenderer.invoke(channel, ...args);
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
  return ipcRenderer.invoke(channel, ...args);
}

/**
 * Typed IPC event listener. Returns a cleanup function for use in `useEffect`.
 */
export function onIpcEvent<K extends keyof IpcEventMap>(channel: K, handler: (data: IpcEventMap[K]) => void): () => void {
  const wrapped = (_event: unknown, data: IpcEventMap[K]) => handler(data);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}
