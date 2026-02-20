import * as fs from 'node:fs';
import * as path from 'node:path';
import { ipcMain } from 'electron';
import { loadData } from '../data-pipeline';
import Logger from '../logger';
import type { HandlerDeps } from './types';

export function registerDataHandlers(deps: HandlerDeps): void {
  const { profileDir, profileReadOnly, handleIpcError } = deps;

  // Handle load-data: full data pipeline (scan -> parse -> build -> return UnifiedDataset)
  ipcMain.handle(
    'load-data',
    handleIpcError(async () => {
      Logger.info('IPC: load-data');
      const result = await loadData(profileDir());
      Logger.info(`IPC: load-data complete — ${result ? `${Object.keys(result.unified?.scouts || {}).length} scouts` : 'no data'}`);
      return result;
    })
  );

  // Handle save file (for unified dataset caching — saves to current/)
  ipcMain.handle(
    'save-file',
    handleIpcError(async (_event: Electron.IpcMainInvokeEvent, { filename, content }: { filename: string; content: string }) => {
      if (profileReadOnly()) return { path: '' };
      const currentDir = path.join(profileDir(), 'sync');
      if (!fs.existsSync(currentDir)) fs.mkdirSync(currentDir, { recursive: true });

      // Sanitize filename to prevent path traversal
      const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!sanitizedFilename || sanitizedFilename.startsWith('.')) {
        throw new Error('Invalid filename provided');
      }

      const filePath = path.join(currentDir, sanitizedFilename);
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(currentDir);
      if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
        throw new Error('Path traversal attempt detected');
      }

      fs.writeFileSync(filePath, content, 'utf8');
      return { path: filePath };
    })
  );
}
