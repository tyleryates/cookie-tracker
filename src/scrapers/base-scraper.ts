// Base Scraper — shared constructor, progress, and abort logic

import * as fs from 'node:fs';
import * as path from 'node:path';
import Logger from '../logger';
import type { ProgressCallback } from '../types';

/** Save data to current/{filename} as raw JSON (no envelope) */
export function savePipelineFile(dataDir: string, filename: string, data: unknown): void {
  try {
    const dir = path.join(dataDir, 'current');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2));
  } catch (err) {
    Logger.warn('Could not save pipeline file:', (err as Error).message);
  }
}

export abstract class BaseScraper {
  dataDir: string;
  currentDir: string;
  progressCallback: ProgressCallback;

  constructor(dataDir: string, progressCallback: ProgressCallback = null) {
    this.dataDir = dataDir;
    this.currentDir = path.join(dataDir, 'current');
    this.progressCallback = progressCallback;
  }

  sendEndpointStatus(
    endpoint: string,
    status: 'syncing' | 'synced' | 'error',
    cached?: boolean,
    durationMs?: number,
    dataSize?: number,
    httpStatus?: number,
    error?: string
  ): void {
    if (this.progressCallback) {
      this.progressCallback({ endpoint, status, cached, durationMs, dataSize, httpStatus, error });
    }
  }

  protected checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('Sync cancelled');
  }
}
