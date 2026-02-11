interface ElectronAPI {
  invoke(channel: string, ...args: any[]): Promise<any>;
  on(channel: string, callback: (...args: any[]) => void): () => void;
  openExternal(url: string): Promise<void>;
}

interface Window {
  electronAPI: ElectronAPI;
}
