import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { DEFAULT_COUNCIL_ID, HTTP_STATUS } from '../constants';
import Logger from '../logger';
import { getTimestamp } from '../scraper-utils';
import type { ProgressCallback } from '../types';
import { requestWithRetry } from './request-utils';

/**
 * Digital Cookie Scraper - API-based scraping
 */
class DigitalCookieScraper {
  dataDir: string;
  inDir: string;
  progressCallback: ProgressCallback;
  client: any;
  selectedRoleName: string | null;
  credentials: { username: string; password: string; role?: string } | null;

  constructor(dataDir: string, progressCallback: ProgressCallback = null) {
    this.dataDir = dataDir;
    this.inDir = path.join(dataDir, 'in');
    this.progressCallback = progressCallback;
    this.selectedRoleName = null;
    this.credentials = null;

    // Create axios client with cookie jar support
    const jar = new CookieJar();
    this.client = wrapper(
      axios.create({
        baseURL: 'https://digitalcookie.girlscouts.org',
        jar: jar,
        withCredentials: true,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
    );
  }

  sendProgress(status: string, progress: number): void {
    if (this.progressCallback) {
      this.progressCallback({ status, progress });
    }
  }

  /**
   * Extract CSRF token from login page
   */
  extractCSRFToken(html: string): string | null {
    const $ = cheerio.load(html);
    const token = $('input[name="_requestConfirmationToken"]').val();
    if (!token) {
      throw new Error('CSRF token not found in login page');
    }
    // Ensure token is a string (cheerio .val() can return string | string[])
    return Array.isArray(token) ? token[0] : token;
  }

  /**
   * Extract role ID from role selection page
   * If roleName is empty/not provided, auto-selects first role starting with "Troop"
   */
  extractRoleId(html: string, roleName: string | null): { roleId: string; selectedRoleName: string } {
    const $ = cheerio.load(html);
    let roleId = null;
    let selectedRoleName = null;
    const availableRoles = [];

    $('.custom-dropdown-option').each((_i, elem) => {
      const optionText = $(elem).text().trim();
      const optionValue = $(elem).attr('data-value');
      availableRoles.push({ value: optionValue, text: optionText });

      // If specific role name provided, match exactly
      if (roleName && optionText === roleName) {
        roleId = optionValue;
        selectedRoleName = optionText;
        return false; // Break loop
      }

      // If no role specified, auto-select first role starting with "Troop"
      if (!roleName && roleId === null && optionText.startsWith('Troop')) {
        roleId = optionValue;
        selectedRoleName = optionText;
        return false; // Break loop
      }
    });

    if (roleId === null) {
      const rolesList = availableRoles.map((r) => `  [${r.value}] "${r.text}"`).join('\n');
      if (roleName) {
        throw new Error(`Role "${roleName}" not found.\n\nAvailable roles:\n${rolesList}`);
      } else {
        throw new Error(`No role starting with "Troop" found.\n\nAvailable roles:\n${rolesList}`);
      }
    }

    return { roleId, selectedRoleName };
  }

  /**
   * Extract troop and service unit IDs from role name
   */
  extractTroopInfo(roleName: string): { troopId: string; serviceUnitId: string } {
    const troopMatch = roleName.match(/Troop\s+(\d+)/i);
    const serviceUnitMatch = roleName.match(/Service\s+Unit\s+(\d+)/i);

    if (!troopMatch || !serviceUnitMatch) {
      throw new Error(`Cannot extract troop/service unit IDs from role: "${roleName}"`);
    }

    return {
      troopId: troopMatch[1],
      serviceUnitId: serviceUnitMatch[1]
    };
  }

  /**
   * Login to Digital Cookie
   */
  async login(username: string, password: string, roleName: string | null, silent = false): Promise<boolean> {
    if (!silent) {
      this.sendProgress('Digital Cookie: Getting CSRF token...', 5);
    }

    // Get CSRF token
    const loginPageResponse = await this.client.get('/login');
    const csrfToken = this.extractCSRFToken(loginPageResponse.data);

    if (!silent) {
      this.sendProgress('Digital Cookie: Logging in...', 15);
    }

    // Submit login
    // SECURITY WARNING: This request contains plaintext credentials
    // Never log this request body or enable axios request interceptors that log POST data
    const params = new URLSearchParams({
      j_username: username,
      j_password: password,
      _requestConfirmationToken: csrfToken
    });

    const loginResponse = await this.client.post('/j_spring_security_check', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (loginResponse.status !== HTTP_STATUS.OK && loginResponse.status !== HTTP_STATUS.FOUND) {
      throw new Error(`Login failed with status ${loginResponse.status}`);
    }

    if (!silent) {
      this.sendProgress('Digital Cookie: Selecting role...', 30);
    }

    // Get and select role
    const rolePageResponse = await this.client.get('/select-role');
    const { roleId, selectedRoleName } = this.extractRoleId(rolePageResponse.data, roleName);

    const roleResponse = await this.client.get(`/select-role?id=${roleId}`);

    if (roleResponse.status !== HTTP_STATUS.OK && roleResponse.status !== HTTP_STATUS.FOUND) {
      throw new Error(`Role selection failed with status ${roleResponse.status}`);
    }

    if (!silent) {
      this.sendProgress('Digital Cookie: Login successful', 40);
    }

    // Store the selected role name for use in downloadExport
    this.selectedRoleName = selectedRoleName;
    return true;
  }

  /**
   * Download export file
   */
  async downloadExport(councilId = DEFAULT_COUNCIL_ID) {
    this.sendProgress('Digital Cookie: Preparing export...', 50);

    // Use the role name that was selected during login
    const { troopId, serviceUnitId } = this.extractTroopInfo(this.selectedRoleName);

    this.sendProgress('Digital Cookie: Generating report...', 60);

    // Generate report
    const generateResponse = await this.client.get('/ajaxCall/generateReport', {
      params: {
        reportType: 'TROOP_ORDER_REPORT',
        troopId: troopId,
        serviceUnitId: serviceUnitId,
        councilId: councilId
      }
    });

    const result = generateResponse.data;
    if (result.errorCode !== '0') {
      throw new Error(`Report generation failed: ${result.errorMessage}`);
    }

    const responseData = JSON.parse(result.responseData);
    const fileName = responseData.fileName;

    if (!fileName || responseData.statusCode !== 'Success') {
      throw new Error('Report generation did not return a valid file name');
    }

    this.sendProgress('Digital Cookie: Downloading file...', 75);

    // Download file
    const downloadResponse = await this.client.get(`/ajaxCall/downloadFile/TROOP_ORDER_REPORT/${fileName}`, {
      responseType: 'arraybuffer'
    });

    // Save file
    const timestamp = getTimestamp();
    const filePath = path.join(this.inDir, `DC-${timestamp}.xlsx`);

    if (!fs.existsSync(this.inDir)) {
      fs.mkdirSync(this.inDir, { recursive: true });
    }

    fs.writeFileSync(filePath, downloadResponse.data);

    this.sendProgress('Digital Cookie: Export complete', 90);

    return filePath;
  }

  /**
   * Main scraping method
   */
  async scrape(credentials: { username: string; password: string; role?: string; councilId?: string }): Promise<Record<string, any>> {
    // Validate input
    if (!credentials || !credentials.username || !credentials.password) {
      return {
        success: false,
        source: 'Digital Cookie',
        error: 'Username and password are required'
      };
    }

    try {
      // Store credentials for potential re-login
      this.credentials = credentials;

      const councilId = credentials.councilId || DEFAULT_COUNCIL_ID;

      // Digital Cookie requires login first to set selectedRoleName
      await this.login(credentials.username, credentials.password, credentials.role || '');

      // Download export with automatic retry if session expires
      const filePath = await requestWithRetry(
        () => this.downloadExport(councilId),
        () => this.login(credentials.username, credentials.password, credentials.role || '', true),
        { logPrefix: 'Digital Cookie: Download Export', rateLimit: false }
      );

      this.sendProgress('Digital Cookie: Complete', 100);

      return {
        success: true,
        source: 'Digital Cookie',
        filePath: filePath
      };
    } catch (error) {
      Logger.error('Digital Cookie scrape failed:', error);
      return {
        success: false,
        source: 'Digital Cookie',
        error: error.message
      };
    }
  }
}

export default DigitalCookieScraper;
