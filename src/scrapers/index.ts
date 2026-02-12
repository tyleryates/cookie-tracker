import type { Credentials, ProgressCallback, ScrapeResults } from '../types';
import DigitalCookieScraper from './digital-cookie';
import SmartCookieScraper from './smart-cookie';

/**
 * Scraper Orchestrator - Coordinates both scrapers (API-only)
 * Owns the AbortController for cancellation.
 */
class ScraperOrchestrator {
  dataDir: string;
  progressCallback: ProgressCallback;
  private digitalCookieScraper: DigitalCookieScraper | null = null;
  private smartCookieScraper: SmartCookieScraper | null = null;
  private abortController: AbortController | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.progressCallback = null;
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /** Get the Smart Cookie scraper instance (for booth location fetches after sync) */
  getSmartCookieScraper(): SmartCookieScraper | null {
    return this.smartCookieScraper;
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
    const results: ScrapeResults = {
      digitalCookie: null,
      smartCookie: null,
      success: false
    };

    try {
      this.abortController = new AbortController();
      const { signal } = this.abortController;

      this.digitalCookieScraper = new DigitalCookieScraper(this.dataDir, this.progressCallback);
      this.smartCookieScraper = new SmartCookieScraper(this.dataDir, this.progressCallback);

      const [digitalCookieResult, smartCookieResult] = await Promise.all([
        this.digitalCookieScraper.scrape(credentials.digitalCookie, signal),
        this.smartCookieScraper.scrape(credentials.smartCookie, boothIds, signal)
      ]);

      results.digitalCookie = digitalCookieResult;
      results.smartCookie = smartCookieResult;
      results.success = results.digitalCookie.success || results.smartCookie.success;

      return results;
    } catch (error) {
      return {
        ...results,
        success: false,
        error: (error as Error).message
      };
    } finally {
      this.abortController = null;
    }
  }
}

export default ScraperOrchestrator;
