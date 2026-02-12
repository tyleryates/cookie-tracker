import type { IpcChannelMap, IpcEventMap, IpcResponse } from './types';

interface ElectronAPI {
  invoke<K extends keyof IpcChannelMap>(
    channel: K,
    ...args: IpcChannelMap[K]['request'] extends undefined ? [] : [IpcChannelMap[K]['request']]
  ): Promise<IpcResponse<IpcChannelMap[K]['response']>>;
  on<K extends keyof IpcEventMap>(channel: K, callback: (data: IpcEventMap[K]) => void): () => void;
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
