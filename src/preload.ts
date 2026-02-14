import type { IpcRendererEvent } from 'electron';
import { contextBridge, ipcRenderer, shell } from 'electron';

const ALLOWED_INVOKE_CHANNELS = new Set([
  'load-data',
  'save-file',
  'load-credentials',
  'save-credentials',
  'load-config',
  'save-config',
  'update-config',
  'scrape-websites',
  'cancel-sync',
  'refresh-booth-locations',
  'fetch-booth-catalog',
  'export-diagnostics',
  'verify-sc',
  'verify-dc',
  'save-seasonal-data',
  'load-seasonal-data',
  'load-timestamps',
  'record-unified-build',
  'wipe-logins',
  'wipe-data',
  'quit-and-install',
  'check-for-updates',
  'log-message'
]);

const ALLOWED_EVENT_CHANNELS = new Set(['scrape-progress', 'update-available', 'update-downloaded']);

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`);
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_EVENT_CHANNELS.has(channel)) throw new Error(`Blocked IPC event channel: ${channel}`);
    const sub = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, sub);
    return () => {
      ipcRenderer.removeListener(channel, sub);
    };
  },
  openExternal: (url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS URLs are allowed');
    return shell.openExternal(url);
  }
});
