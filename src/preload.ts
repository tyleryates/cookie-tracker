import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const sub = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, sub);
    return () => {
      ipcRenderer.removeListener(channel, sub);
    };
  },
  openExternal: (url: string) => shell.openExternal(url)
});
