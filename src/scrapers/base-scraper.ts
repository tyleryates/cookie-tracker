// Base Scraper — shared constructor, progress, and abort logic

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SyncStatus } from '../constants';
import Logger, { getErrorMessage } from '../logger';
import type { ProgressCallback } from '../types';

/** Save data to sync/{filename} as raw JSON (no envelope).
 *  Uses atomic write (temp file + rename) to prevent partial writes on interruption. */
export function savePipelineFile(dataDir: string, filename: string, data: unknown): void {
  try {
    const dir = path.join(dataDir, 'sync');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const target = path.join(dir, filename);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, target);
  } catch (err) {
    Logger.warn('Could not save pipeline file:', getErrorMessage(err));
  }
}

export abstract class BaseScraper {
  dataDir: string;
  currentDir: string;
  progressCallback: ProgressCallback;

  constructor(dataDir: string, progressCallback: ProgressCallback = null) {
    this.dataDir = dataDir;
    this.currentDir = path.join(dataDir, 'sync');
    this.progressCallback = progressCallback;
  }

  sendEndpointStatus(
    endpoint: string,
    status: Exclude<SyncStatus, 'idle'>,
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

  protected throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('Sync cancelled');
  }

  /** Process items in batches with concurrency limiting and abort support */
  protected async processBatched<T, R>(
    items: T[],
    batchSize: number,
    signal: AbortSignal | undefined,
    fn: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      this.throwIfAborted(signal);
      const batch = items.slice(i, i + batchSize);
      results.push(...(await Promise.all(batch.map(fn))));
    }
    return results;
  }
}
