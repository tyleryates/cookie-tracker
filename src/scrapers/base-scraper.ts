// Base Scraper — shared constructor, progress, and abort logic

import * as path from 'node:path';
import type { ProgressCallback } from '../types';

export function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
}

export abstract class BaseScraper {
  dataDir: string;
  inDir: string;
  progressCallback: ProgressCallback;
  abstract readonly source: 'dc' | 'sc';

  constructor(dataDir: string, progressCallback: ProgressCallback = null) {
    this.dataDir = dataDir;
    this.inDir = path.join(dataDir, 'in');
    this.progressCallback = progressCallback;
  }

  sendProgress(status: string, progress: number): void {
    if (this.progressCallback) {
      this.progressCallback({ source: this.source, status, progress });
    }
  }

  protected checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('Sync cancelled');
  }
}
