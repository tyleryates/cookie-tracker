import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import archiver from 'archiver';
import { type BrowserWindow, dialog, ipcMain } from 'electron';
import Logger from '../logger';
import type { HandlerDeps } from './types';

/** Recursively verify all extracted entries stay within the temp directory (path traversal + symlink check) */
function validateExtractedZip(dir: string, resolvedRoot: string): void {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.resolve(path.join(dir, entry));
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink detected in ZIP: ${entry}`);
    }
    if (!fullPath.startsWith(resolvedRoot + path.sep) && fullPath !== resolvedRoot) {
      throw new Error(`Path traversal detected in ZIP: ${entry}`);
    }
    if (stat.isDirectory()) validateExtractedZip(fullPath, resolvedRoot);
  }
}

const IMPORT_ALLOWED_EXTENSIONS = new Set(['.json', '.csv', '.xlsx', '.xls', '.html']);

/** Move validated file entries from temp dir to profile dir, filtering by allowed extensions */
function copyAllowedFilesToProfile(tempDir: string, destDir: string): void {
  // Remove credentials if included in the ZIP (security)
  const credInTemp = path.join(tempDir, 'credentials.enc');
  if (fs.existsSync(credInTemp)) fs.unlinkSync(credInTemp);

  for (const entry of fs.readdirSync(tempDir)) {
    const entryPath = path.join(tempDir, entry);
    const stat = fs.lstatSync(entryPath);
    if (stat.isDirectory()) {
      fs.renameSync(entryPath, path.join(destDir, entry));
      continue;
    }
    const ext = path.extname(entry).toLowerCase();
    if (!IMPORT_ALLOWED_EXTENSIONS.has(ext)) {
      Logger.warn(`Skipping unrecognized file type in profile import: ${entry}`);
      continue;
    }
    fs.renameSync(entryPath, path.join(destDir, entry));
  }
}

export function registerProfileHandlers(deps: HandlerDeps): void {
  const { profileDir, mainWindow, activeOrchestrator, initializeProfileManagers, profileManager, rootDataDir, handleIpcError } = deps;

  // Handle export data zip (exports current profile)
  ipcMain.handle(
    'export-data',
    handleIpcError(async () => {
      const win = mainWindow();
      if (!win) throw new Error('No main window');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      // Electron type defs resolve showSaveDialog overload incorrectly with BrowserWindow
      const showSave: (w: BrowserWindow, o: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue> =
        dialog.showSaveDialog.bind(dialog);
      const saveResult = await showSave(win, {
        defaultPath: `cookie-tracker-export-${timestamp}.zip`,
        filters: [{ name: 'Zip Archives', extensions: ['zip'] }]
      });

      if (saveResult.canceled || !saveResult.filePath) return null;
      const filePath = saveResult.filePath;

      // Defensive: exclude credentials even though they live at root, not in profile dirs
      const EXCLUDED_FILES = new Set(['credentials.enc', 'app.log']);

      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      const done = new Promise<void>((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);
      });

      archive.pipe(output);

      const dir = profileDir();
      if (fs.existsSync(dir)) {
        for (const entry of fs.readdirSync(dir)) {
          if (EXCLUDED_FILES.has(entry)) continue;
          const fullPath = path.join(dir, entry);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            archive.directory(fullPath, entry);
          } else if (stat.isFile()) {
            archive.file(fullPath, { name: entry });
          }
        }
      }

      await archive.finalize();
      await done;

      return { path: filePath };
    })
  );

  ipcMain.handle(
    'load-profiles',
    handleIpcError(async () => {
      return profileManager.loadProfiles();
    })
  );

  ipcMain.handle(
    'switch-profile',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { dirName }: { dirName: string }) => {
      Logger.info(`IPC: switch-profile to ${dirName}`);
      // Cancel any active sync
      const orchestrator = activeOrchestrator.get();
      if (orchestrator) {
        orchestrator.cancel();
        activeOrchestrator.set(null);
      }
      const result = profileManager.switchProfile(dirName);
      initializeProfileManagers(result.profileDir);
      return result.config;
    })
  );

  ipcMain.handle(
    'delete-profile',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { dirName }: { dirName: string }) => {
      Logger.info(`IPC: delete-profile ${dirName}`);
      const wasActive = profileManager.loadProfiles().activeProfile === dirName;
      const config = profileManager.deleteProfile(dirName);
      if (wasActive) {
        initializeProfileManagers(path.join(rootDataDir, 'default'));
      }
      return config;
    })
  );

  ipcMain.handle(
    'import-profile',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { name }: { name: string }) => {
      const win = mainWindow();
      if (!win) throw new Error('No main window');
      Logger.info(`IPC: import-profile "${name}"`);

      const showOpen: (w: BrowserWindow, o: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue> =
        dialog.showOpenDialog.bind(dialog);
      const openResult = await showOpen(win, {
        properties: ['openFile'],
        filters: [{ name: 'Zip Archives', extensions: ['zip'] }]
      });

      if (openResult.canceled || openResult.filePaths.length === 0) return null;
      const zipPath = openResult.filePaths[0];

      const { profile, config } = profileManager.createProfile(name);
      const newProfileDir = path.join(rootDataDir, profile.dirName);

      const tempDir = path.join(rootDataDir, `_import_${crypto.randomBytes(8).toString('hex')}`);
      fs.mkdirSync(tempDir, { recursive: true });
      try {
        await new Promise<void>((resolve, reject) => {
          execFile('ditto', ['-xk', zipPath, tempDir], { timeout: 30000 }, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });

        validateExtractedZip(tempDir, path.resolve(tempDir));
        copyAllowedFilesToProfile(tempDir, newProfileDir);
      } finally {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      }

      return config;
    })
  );
}
