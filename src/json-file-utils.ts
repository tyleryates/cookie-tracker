import * as fs from 'node:fs';
import * as path from 'node:path';
import Logger, { getErrorMessage } from './logger';

/** Load and parse a JSON file, returning null if missing or invalid */
export function loadJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    Logger.warn(`Could not load ${path.basename(filePath)}:`, getErrorMessage(err));
    return null;
  }
}

/** Save data as JSON to a file, creating parent directories if needed.
 *  Uses atomic write (temp file + rename) to prevent partial writes. */
export function saveJsonFile(filePath: string, data: unknown, mode?: number): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', ...(mode ? { mode } : {}) });
    fs.renameSync(tmp, filePath);
  } catch (err) {
    Logger.warn(`Could not save ${path.basename(filePath)}:`, getErrorMessage(err));
  }
}
