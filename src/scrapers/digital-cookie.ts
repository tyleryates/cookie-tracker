import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_COUNCIL_ID, PIPELINE_FILES } from '../constants';
import Logger from '../logger';
import type { ProgressCallback, ScrapeSourceResult } from '../types';
import { BaseScraper } from './base-scraper';
import { DigitalCookieSession } from './dc-session';

/**
 * Digital Cookie Scraper
 *
 * Uses a DigitalCookieSession for all authenticated requests.
 * Supports AbortSignal for cancellation.
 */
class DigitalCookieScraper extends BaseScraper {
  session: DigitalCookieSession;

  constructor(dataDir: string, progressCallback: ProgressCallback = null, session?: DigitalCookieSession) {
    super(dataDir, progressCallback);
    this.session = session || new DigitalCookieSession();
  }

  /** Download export file */
  async downloadExport(councilId = DEFAULT_COUNCIL_ID, signal?: AbortSignal): Promise<string> {
    this.checkAborted(signal);

    const { troopId, serviceUnitId } = this.session.extractTroopInfo(this.session.selectedRoleName!);

    this.sendEndpointStatus('dc-troop-report', 'syncing');

    const generateResponse = await this.session.authenticatedGet<{ errorCode: string; errorMessage?: string; responseData: string }>(
      '/ajaxCall/generateReport',
      {
        params: {
          reportType: 'TROOP_ORDER_REPORT',
          troopId,
          serviceUnitId,
          councilId
        }
      }
    );

    const result = generateResponse.data;
    if (result.errorCode !== '0') {
      this.sendEndpointStatus('dc-troop-report', 'error');
      throw new Error(`Report generation failed (errorCode=${result.errorCode}): ${result.errorMessage || JSON.stringify(result)}`);
    }

    const responseData = JSON.parse(result.responseData);
    const fileName = responseData.fileName;

    if (!fileName || responseData.statusCode !== 'Success') {
      this.sendEndpointStatus('dc-troop-report', 'error');
      throw new Error('Report generation did not return a valid file name');
    }

    this.checkAborted(signal);

    const downloadResponse = await this.session.authenticatedGet<Buffer>(`/ajaxCall/downloadFile/TROOP_ORDER_REPORT/${fileName}`, {
      responseType: 'arraybuffer'
    });

    // Save file
    const filePath = path.join(this.currentDir, PIPELINE_FILES.DC_EXPORT);

    if (!fs.existsSync(this.currentDir)) {
      fs.mkdirSync(this.currentDir, { recursive: true });
    }

    fs.writeFileSync(filePath, downloadResponse.data);

    this.sendEndpointStatus('dc-troop-report', 'synced');
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
      this.sendEndpointStatus('dc-login', 'syncing');
      await this.session.login(credentials.username, credentials.password, credentials.role || '');
      this.sendEndpointStatus('dc-login', 'synced');

      this.checkAborted(signal);

      // Download export
      const filePath = await this.downloadExport(councilId, signal);

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
