import { execFile } from 'node:child_process';
import { app, ipcMain } from 'electron';
import { IMESSAGE_TIMEOUT_MS } from '../constants';
import Logger from '../logger';
import type { SeasonalDataFiles } from '../seasonal-data';
import { checkForUpdates, quitAndInstall } from '../update-manager';
import type { HandlerDeps } from './types';

export function registerMiscHandlers(deps: HandlerDeps): void {
  const { profileReadOnly, configManager, seasonalData, mainWindow, loadTimestamps, saveTimestamps, handleIpcError } = deps;

  // Renderer log relay — fire-and-forget, no response needed
  ipcMain.handle(
    'log-message',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, line: string) => {
      if (typeof line !== 'string' || line.length > 10000) return;
      Logger.appendLine(line);
    })
  );

  // Handle save seasonal data
  ipcMain.handle(
    'save-seasonal-data',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, data: Partial<SeasonalDataFiles>) => {
      if (profileReadOnly()) return;
      seasonalData().saveAll(data);
    })
  );

  // Handle load seasonal data
  ipcMain.handle(
    'load-seasonal-data',
    handleIpcError(async () => {
      return seasonalData().loadAll();
    })
  );

  // Load persisted timestamps (for restart survival + UI display)
  ipcMain.handle(
    'load-timestamps',
    handleIpcError(async () => {
      return loadTimestamps();
    })
  );

  // Record when unified dataset was last built
  ipcMain.handle(
    'record-unified-build',
    handleIpcError(async () => {
      if (profileReadOnly()) return;
      const ts = loadTimestamps();
      ts.lastUnifiedBuild = new Date().toISOString();
      saveTimestamps(ts);
    })
  );

  ipcMain.handle(
    'quit-and-install',
    handleIpcError(async () => quitAndInstall(() => mainWindow()))
  );

  ipcMain.handle(
    'check-for-updates',
    handleIpcError(async () => checkForUpdates(configManager().loadConfig().autoUpdate))
  );

  // Handle send iMessage via AppleScript
  ipcMain.handle(
    'send-imessage',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { recipient, message }: { recipient: string; message: string }) => {
      if (!recipient || typeof recipient !== 'string' || recipient.length > 256) throw new Error('Invalid recipient');
      if (!message || typeof message !== 'string' || message.length > 10000) throw new Error('Invalid message');
      Logger.info(`IPC: send-imessage to ${recipient}`);
      // Pass message and recipient as arguments to avoid AppleScript string injection
      const script = `on run {msg, rcpt}
  tell application "Messages"
    send msg to buddy rcpt of (service 1 whose service type is iMessage)
  end tell
end run`;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const proc = execFile('osascript', ['-e', script, message, recipient], (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) {
            Logger.error('iMessage send failed:', error.message);
            reject(error);
          } else {
            Logger.info('iMessage sent successfully');
            resolve();
          }
        });
        // Kill osascript if it hangs (e.g. macOS permission prompt, Messages.app not responding)
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          proc.kill();
          reject(new Error('iMessage send timed out'));
        }, IMESSAGE_TIMEOUT_MS);
      });
    })
  );

  // Handle dock badge (macOS)
  ipcMain.handle(
    'set-dock-badge',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { count }: { count: number }) => {
      if (app.dock) {
        app.dock.setBadge(count > 0 ? String(count) : '');
      }
    })
  );
}
