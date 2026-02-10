import type { Credentials, ProgressCallback } from '../types';
import DigitalCookieScraper from './digital-cookie';
import SmartCookieScraper from './smart-cookie';

/**
 * Scraper Orchestrator - Coordinates both scrapers (API-only)
 */
class ScraperOrchestrator {
  dataDir: string;
  progressCallback: ProgressCallback;
  digitalCookieScraper: DigitalCookieScraper | null;
  smartCookieScraper: SmartCookieScraper | null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.progressCallback = null;
    this.digitalCookieScraper = null;
    this.smartCookieScraper = null;
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  sendProgress(status: string, progress: number): void {
    if (this.progressCallback) {
      this.progressCallback({ status, progress });
    }
  }

  /** Get the Smart Cookie scraper instance (for on-demand API calls after sync) */
  getSmartCookieScraper(): SmartCookieScraper | null {
    return this.smartCookieScraper;
  }

  /** Scrape both Digital Cookie and Smart Cookie in parallel */
  async scrapeAll(credentials: Credentials): Promise<Record<string, any>> {
    const results = {
      digitalCookie: null,
      smartCookie: null,
      success: false
    };

    try {
      // Create both API scrapers
      this.digitalCookieScraper = new DigitalCookieScraper(this.dataDir, this.progressCallback);
      this.smartCookieScraper = new SmartCookieScraper(this.dataDir, this.progressCallback);

      // Run both scrapers in parallel for maximum speed
      const [digitalCookieResult, smartCookieResult] = await Promise.all([
        this.digitalCookieScraper.scrape(credentials.digitalCookie),
        this.smartCookieScraper.scrape(credentials.smartCookie)
      ]);

      results.digitalCookie = digitalCookieResult;
      results.smartCookie = smartCookieResult;
      results.success = results.digitalCookie.success || results.smartCookie.success;

      this.sendProgress('Complete!', 100);

      return results;
    } catch (error) {
      return {
        ...results,
        success: false,
        error: error.message
      };
    }
  }
}

export default ScraperOrchestrator;
