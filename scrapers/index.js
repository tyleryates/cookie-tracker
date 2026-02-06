const DigitalCookieScraper = require('./digital-cookie');
const SmartCookieScraper = require('./smart-cookie');

/**
 * Scraper Orchestrator - Coordinates both scrapers
 * Both now use API-only approach (no browser automation needed!)
 */
class ScraperOrchestrator {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.progressCallback = null;
    this.digitalCookieScraper = null;
    this.smartCookieScraper = null;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  sendProgress(status, progress) {
    if (this.progressCallback) {
      this.progressCallback({ status, progress });
    }
  }

  /**
   * Scrape both Digital Cookie and Smart Cookie
   * Both use API-only approach for speed and reliability
   */
  async scrapeAll(credentials) {
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

  /**
   * Scrape only Digital Cookie
   * Note: Currently unused - reserved for future selective sync feature
   */
  async scrapeDigitalCookie(credentials) {
    this.digitalCookieScraper = new DigitalCookieScraper(this.dataDir, this.progressCallback);
    return await this.digitalCookieScraper.scrape(credentials);
  }

  /**
   * Scrape only Smart Cookie
   * Note: Currently unused - reserved for future selective sync feature
   */
  async scrapeSmartCookie(credentials) {
    this.smartCookieScraper = new SmartCookieScraper(this.dataDir, this.progressCallback);
    return await this.smartCookieScraper.scrape(credentials);
  }
}

module.exports = ScraperOrchestrator;
