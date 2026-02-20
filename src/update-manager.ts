// Auto-update configuration, event handlers, and installation logic.
// Extracted from main.ts to keep the main process file focused on IPC routing.

import { execFileSync, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app, type BrowserWindow, autoUpdater as nativeUpdater } from 'electron';
import { autoUpdater } from 'electron-updater';
import Logger from './logger';

let downloadedUpdateFile: string | null = null;
let downloadProgressReceived = false;

/**
 * Configure auto-updater settings and wire up all event handlers.
 * Call once at module load time (before app.whenReady).
 */
export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  Logger.info(`Auto-updater configured: autoDownload=true, autoInstallOnAppQuit=true, isPackaged=${app.isPackaged}`);

  autoUpdater.on('checking-for-update', () => {
    Logger.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    Logger.info(`Update available: v${info.version}`);
    getMainWindow()?.webContents.send('update-available', { version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    Logger.info(`No update available (current: v${info.version})`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    const downloadedFile = (info as any).downloadedFile as string | undefined;
    let fileSize: string | undefined;
    if (downloadedFile) {
      try {
        const stat = fs.statSync(downloadedFile);
        fileSize = `${(stat.size / (1024 * 1024)).toFixed(1)}MB`;
      } catch {
        fileSize = 'stat failed';
      }
    }
    Logger.info(
      `Update downloaded: v${info.version}, file=${downloadedFile || 'unknown'}, size=${fileSize || 'unknown'}, hadProgress=${downloadProgressReceived}`
    );
    if (!downloadProgressReceived) {
      Logger.info('Update was cached (no download-progress events received) — file from previous download');
    }
    downloadProgressReceived = false;
    downloadedUpdateFile = downloadedFile || null;
    getMainWindow()?.webContents.send('update-downloaded', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    downloadProgressReceived = true;
    Logger.info(`Update download: ${Math.round(progress.percent)}% (${progress.transferred}/${progress.total})`);
  });

  autoUpdater.on('error', (err) => {
    Logger.error('Auto-updater error:', err.message);
  });

  // Native Squirrel updater events (macOS)
  nativeUpdater.on('checking-for-update', () => Logger.info('Native updater: checking-for-update'));
  nativeUpdater.on('update-available', () => Logger.info('Native updater: update-available'));
  nativeUpdater.on('update-not-available', () => Logger.info('Native updater: update-not-available'));
  nativeUpdater.on('update-downloaded', () => Logger.info('Native updater: update-downloaded'));
  nativeUpdater.on('before-quit-for-update', () => Logger.info('Native updater: before-quit-for-update'));
  nativeUpdater.on('error', (err) => Logger.error('Native updater error:', err.message));
}

/** Check for updates on startup (delayed by 3s). Only runs in packaged builds with auto-update enabled. */
export function checkForUpdatesOnStartup(autoUpdateEnabled: boolean): void {
  if (!app.isPackaged) {
    Logger.info('Skipping update check in development');
    return;
  }
  if (!autoUpdateEnabled) {
    Logger.info('Auto-update disabled in config, skipping update check');
    return;
  }
  Logger.info('Will check for updates in 3 seconds');
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => Logger.error('Update check failed:', err));
  }, 3000);
}

/** Trigger an update check (called from IPC handler). */
export function checkForUpdates(autoUpdateEnabled: boolean): void {
  if (app.isPackaged && autoUpdateEnabled) {
    autoUpdater.checkForUpdates().catch((err) => Logger.error('Update check failed:', err));
  }
}

/**
 * macOS manual install: extract the downloaded zip, spawn a detached script
 * to replace the app bundle after this process exits.
 * Returns true if the install was initiated (app will exit), false to fall through.
 */
function performManualMacOSInstall(downloadedFile: string): boolean {
  const currentAppPath = app.getAppPath().replace(/\/Contents\/Resources\/app(\.asar)?$/, '');
  Logger.info(`quit-and-install: manual install — currentApp=${currentAppPath}`);

  const tempDir = path.join(os.tmpdir(), `cookie-tracker-update-${crypto.randomBytes(8).toString('hex')}`);
  try {
    Logger.info(`quit-and-install: extracting ${downloadedFile} to ${tempDir}`);
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
    execFileSync('ditto', ['-xk', downloadedFile, tempDir]);

    const entries = fs.readdirSync(tempDir).filter((f) => f.endsWith('.app'));
    if (entries.length === 0) {
      throw new Error('No .app bundle found in update zip');
    }
    const newAppPath = path.join(tempDir, entries[0]);
    Logger.info(`quit-and-install: found ${entries[0]}, spawning update script`);

    // Spawn a detached shell script that waits for this process to exit,
    // replaces the app bundle, relaunches, and cleans up.
    // Passes paths as positional arguments to avoid shell injection.
    const scriptPath = path.join(tempDir, 'update.sh');
    const scriptContent = [
      '#!/bin/bash',
      'while kill -0 $4 2>/dev/null; do sleep 0.5; done',
      'rm -rf "$1"',
      'mv "$2" "$1"',
      'open "$1"',
      'rm -rf "$3"'
    ].join('\n');
    fs.writeFileSync(scriptPath, scriptContent, { mode: 0o700 });

    spawn(scriptPath, [currentAppPath, newAppPath, tempDir, String(process.pid)], { detached: true, stdio: 'ignore' }).unref();
    Logger.info('quit-and-install: update script spawned, exiting app');
    Logger.close();
    app.exit(0);
    return true;
  } catch (err) {
    Logger.error('quit-and-install: manual install failed:', err);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      Logger.warn('quit-and-install: failed to clean up temp directory:', cleanupErr);
    }
    return false;
  }
}

/** Try standard Squirrel/electron-updater quit-and-install with fallback timeout */
function performStandardInstall(getMainWindow: () => BrowserWindow | null): void {
  Logger.info('quit-and-install: trying standard quitAndInstall()');
  app.removeAllListeners('window-all-closed');
  app.removeAllListeners('activate');
  const win = getMainWindow();
  if (win) win.removeAllListeners('close');

  nativeUpdater.once('before-quit-for-update', () => {
    Logger.info('quit-and-install: before-quit-for-update fired, calling app.exit()');
    app.exit();
  });

  autoUpdater.quitAndInstall();

  // Fallback: force exit after 5s if nothing happened
  setTimeout(() => {
    Logger.info('quit-and-install: fallback timeout, calling app.exit(0)');
    app.exit(0);
  }, 5000);
}

/** Quit the app and install the downloaded update. Handles macOS manual install workaround. */
export async function quitAndInstall(getMainWindow: () => BrowserWindow | null): Promise<void> {
  Logger.info('IPC: quit-and-install — starting');
  Logger.info(`quit-and-install: platform=${process.platform}, downloadedFile=${downloadedUpdateFile}`);

  const updateFile = downloadedUpdateFile;
  if (process.platform === 'darwin' && updateFile && fs.existsSync(updateFile) && performManualMacOSInstall(updateFile)) {
    return; // App is exiting via the manual install script
  }

  performStandardInstall(getMainWindow);
}
