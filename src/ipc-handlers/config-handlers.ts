import { ipcMain } from 'electron';
import type { AppConfigPatch } from '../types';
import { validateConfigPatch } from '../validators';
import type { HandlerDeps } from './types';

export function registerConfigHandlers(deps: HandlerDeps): void {
  const { configManager, profileReadOnly, handleIpcError } = deps;

  // Handle config operations
  ipcMain.handle(
    'load-config',
    handleIpcError(async () => {
      return configManager().loadConfig();
    })
  );

  ipcMain.handle(
    'update-config',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, partial: AppConfigPatch) => {
      if (profileReadOnly()) return configManager().loadConfig();
      const validation = validateConfigPatch(partial);
      if (!validation.valid) throw new Error(`Invalid config patch: ${validation.issues.join(', ')}`);
      const updated = configManager().updateConfig(partial);
      return updated;
    })
  );
}
