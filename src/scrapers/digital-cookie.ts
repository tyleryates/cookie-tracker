import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_COUNCIL_ID } from '../constants';
import Logger from '../logger';
import type { ProgressCallback, ScrapeSourceResult } from '../types';
import { BaseScraper, getTimestamp } from './base-scraper';
import { DigitalCookieSession } from './dc-session';
import { requestWithRetry } from './request-utils';

/**
 * Digital Cookie Scraper
 *
 * Uses a DigitalCookieSession for all authenticated requests.
 * Supports AbortSignal for cancellation.
 */
class DigitalCookieScraper extends BaseScraper {
  readonly source = 'dc' as const;
  session: DigitalCookieSession;

  constructor(dataDir: string, progressCallback: ProgressCallback = null) {
    super(dataDir, progressCallback);
    this.session = new DigitalCookieSession();
  }

  /** Download export file */
  async downloadExport(councilId = DEFAULT_COUNCIL_ID, signal?: AbortSignal): Promise<string> {
    this.checkAborted(signal);
    this.sendProgress('Preparing export...', 50);

    const { troopId, serviceUnitId } = this.session.extractTroopInfo(this.session.selectedRoleName!);

    this.sendProgress('Generating report...', 60);

    const generateResponse = await this.session.client.get('/ajaxCall/generateReport', {
      params: {
        reportType: 'TROOP_ORDER_REPORT',
        troopId,
        serviceUnitId,
        councilId
      }
    });

    const result = generateResponse.data;
    if (result.errorCode !== '0') {
      throw new Error(`Report generation failed (errorCode=${result.errorCode}): ${result.errorMessage || JSON.stringify(result)}`);
    }

    const responseData = JSON.parse(result.responseData);
    const fileName = responseData.fileName;

    if (!fileName || responseData.statusCode !== 'Success') {
      throw new Error('Report generation did not return a valid file name');
    }

    this.checkAborted(signal);
    this.sendProgress('Downloading file...', 75);

    const downloadResponse = await this.session.client.get(`/ajaxCall/downloadFile/TROOP_ORDER_REPORT/${fileName}`, {
      responseType: 'arraybuffer'
    });

    // Save file
    const timestamp = getTimestamp();
    const filePath = path.join(this.inDir, `DC-${timestamp}.xlsx`);

    if (!fs.existsSync(this.inDir)) {
      fs.mkdirSync(this.inDir, { recursive: true });
    }

    fs.writeFileSync(filePath, downloadResponse.data);

    this.sendProgress('Export complete', 90);
    return filePath;
  }

  /** Main scrape method. Accepts AbortSignal for cancellation. */
  async scrape(
    credentials: { username: string; password: string; role?: string; councilId?: string },
    signal?: AbortSignal
  ): Promise<ScrapeSourceResult> {
    if (!credentials?.username || !credentials?.password) {
      return { success: false, source: 'Digital Cookie', error: 'Username and password are required' };
    }

    try {
      this.checkAborted(signal);
      const councilId = credentials.councilId || DEFAULT_COUNCIL_ID;

      // Login via session
      this.sendProgress('Getting CSRF token...', 5);
      this.sendProgress('Logging in...', 15);
      await this.session.login(credentials.username, credentials.password, credentials.role || '');
      this.sendProgress('Login successful', 40);

      this.checkAborted(signal);

      // Download export with retry
      const filePath = await requestWithRetry(
        () => this.downloadExport(councilId, signal),
        () => this.session.relogin(),
        { logPrefix: 'Digital Cookie: Download Export', rateLimit: false }
      );

      this.sendProgress('Complete', 100);

      return { success: true, source: 'Digital Cookie', filePath };
    } catch (error) {
      if (signal?.aborted) {
        return { success: false, source: 'Digital Cookie', error: 'Sync cancelled' };
      }
      Logger.error('Digital Cookie scrape failed:', error);
      return { success: false, source: 'Digital Cookie', error: (error as Error).message };
    }
  }
}

export default DigitalCookieScraper;
