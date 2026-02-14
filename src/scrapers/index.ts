import type SeasonalData from '../seasonal-data';
import type { Credentials, ProgressCallback, ScrapeResults } from '../types';
import type BoothCache from './booth-cache';
import type { DigitalCookieSession } from './dc-session';
import DigitalCookieScraper from './digital-cookie';
import type { SmartCookieSession } from './sc-session';
import SmartCookieScraper from './smart-cookie';

/**
 * Scraper Orchestrator - Coordinates both scrapers (API-only)
 * Owns the AbortController for cancellation.
 * Accepts pre-existing sessions so they can be reused across syncs.
 * Collects per-endpoint statuses from progress events and returns them in results.
 */
class ScraperOrchestrator {
  dataDir: string;
  progressCallback: ProgressCallback;
  private abortController: AbortController | null = null;
  private seasonalData: SeasonalData | undefined;
  private boothCache: BoothCache | undefined;
  private scSession: SmartCookieSession | undefined;
  private dcSession: DigitalCookieSession | undefined;

  constructor(
    dataDir: string,
    seasonalData?: SeasonalData,
    boothCache?: BoothCache,
    scSession?: SmartCookieSession,
    dcSession?: DigitalCookieSession
  ) {
    this.dataDir = dataDir;
    this.progressCallback = null;
    this.seasonalData = seasonalData;
    this.boothCache = boothCache;
    this.scSession = scSession;
    this.dcSession = dcSession;
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /** Cancel any in-flight sync */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /** Scrape both Digital Cookie and Smart Cookie in parallel */
  async scrapeAll(credentials: Credentials, boothIds: number[] = []): Promise<ScrapeResults> {
    const endpointStatuses: ScrapeResults['endpointStatuses'] = {};

    // Wrap the external callback to also collect final statuses
    const trackingCallback: ProgressCallback = (progress) => {
      this.progressCallback?.(progress);
      if (progress.status === 'synced' || progress.status === 'error') {
        endpointStatuses[progress.endpoint] = {
          status: progress.status,
          lastSync: progress.status === 'synced' ? new Date().toISOString() : undefined,
          durationMs: progress.durationMs,
          dataSize: progress.dataSize,
          httpStatus: progress.httpStatus,
          error: progress.error
        };
      }
    };

    try {
      this.abortController = new AbortController();
      const { signal } = this.abortController;

      const dcScraper = new DigitalCookieScraper(this.dataDir, trackingCallback, this.dcSession);
      const scScraper = new SmartCookieScraper(this.dataDir, trackingCallback, this.scSession);

      const [digitalCookieResult, smartCookieResult] = await Promise.all([
        dcScraper.scrape(credentials.digitalCookie, signal),
        scScraper.scrape(credentials.smartCookie, boothIds, signal, this.seasonalData, this.boothCache)
      ]);

      return {
        digitalCookie: digitalCookieResult,
        smartCookie: smartCookieResult,
        success: digitalCookieResult.success || smartCookieResult.success,
        endpointStatuses
      };
    } catch (error) {
      return {
        digitalCookie: null,
        smartCookie: null,
        success: false,
        error: (error as Error).message,
        endpointStatuses
      };
    } finally {
      this.abortController = null;
    }
  }
}

export default ScraperOrchestrator;
