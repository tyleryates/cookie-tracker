import * as fs from 'node:fs';
import * as path from 'node:path';
import { isAxiosError } from 'axios';
import { DEFAULT_COUNCIL_ID, PIPELINE_FILES } from '../constants';
import Logger, { getErrorMessage } from '../logger';
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
    this.throwIfAborted(signal);

    const { troopId, serviceUnitId } = this.session.extractTroopInfo(this.session.selectedRoleName!);

    this.sendEndpointStatus('dc-troop-report', 'syncing');
    const startTime = Date.now();

    const generateResponse = await this.session.authenticatedGet<{ errorCode: string; errorMessage?: string; responseData: string }>(
      '/ajaxCall/generateReport',
      {
        params: {
          reportType: 'TROOP_ORDER_REPORT',
          troopId,
          serviceUnitId,
          councilId,
          troopGlobalID: this.session.selectedRoleId || ''
        },
        signal
      }
    );

    const result = generateResponse.data;
    if (result.errorCode !== '0') {
      const errMsg = `Report generation failed (errorCode=${result.errorCode}): ${result.errorMessage || JSON.stringify(result)}`;
      this.sendEndpointStatus('dc-troop-report', 'error', false, Date.now() - startTime, undefined, undefined, errMsg);
      throw new Error(errMsg);
    }

    const responseData = JSON.parse(result.responseData);
    const rawFileName = responseData.fileName;

    if (!rawFileName || responseData.statusCode !== 'Success') {
      const errMsg = 'Report generation did not return a valid file name';
      this.sendEndpointStatus('dc-troop-report', 'error', false, Date.now() - startTime, undefined, undefined, errMsg);
      throw new Error(errMsg);
    }

    this.throwIfAborted(signal);

    // Sanitize server-provided filename to prevent path traversal in URL
    const fileName = encodeURIComponent(rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_'));

    const downloadResponse = await this.session.authenticatedGet<Buffer>(`/ajaxCall/downloadFile/TROOP_ORDER_REPORT/${fileName}`, {
      responseType: 'arraybuffer',
      signal
    });

    // Save file
    const filePath = path.join(this.currentDir, PIPELINE_FILES.DC_EXPORT);

    if (!fs.existsSync(this.currentDir)) {
      fs.mkdirSync(this.currentDir, { recursive: true });
    }

    fs.writeFileSync(filePath, downloadResponse.data);

    const durationMs = Date.now() - startTime;
    const dataSize = downloadResponse.data?.length;
    this.sendEndpointStatus('dc-troop-report', 'synced', false, durationMs, dataSize);
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
      this.throwIfAborted(signal);
      const councilId = credentials.councilId || DEFAULT_COUNCIL_ID;

      // Login via session
      Logger.info('dc-login: authenticating...');
      this.sendEndpointStatus('dc-login', 'syncing');
      try {
        await this.session.login(credentials.username, credentials.password, credentials.role || '');
        Logger.info('dc-login: success');
        this.sendEndpointStatus('dc-login', 'synced');
      } catch (loginError) {
        const httpStatus = isAxiosError(loginError) ? loginError.response?.status : undefined;
        Logger.error(`dc-login: failed (HTTP ${httpStatus ?? '?'}) ${getErrorMessage(loginError)}`);
        this.sendEndpointStatus('dc-login', 'error', false, undefined, undefined, httpStatus, getErrorMessage(loginError));
        throw loginError;
      }

      this.throwIfAborted(signal);

      // Download export
      Logger.info('dc-troop-report: downloading...');
      const filePath = await this.downloadExport(councilId, signal);
      Logger.info(`dc-troop-report: saved to ${filePath}`);

      return { success: true, source: 'Digital Cookie', filePath };
    } catch (error) {
      if (signal?.aborted) {
        return { success: false, source: 'Digital Cookie', error: 'Sync cancelled' };
      }
      Logger.error('Digital Cookie scrape failed:', error);
      return { success: false, source: 'Digital Cookie', error: getErrorMessage(error) };
    }
  }
}

export default DigitalCookieScraper;
