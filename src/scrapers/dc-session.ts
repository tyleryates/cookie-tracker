// Digital Cookie Session — owns auth state (cookie jar, CSRF, role selection)
// Scrapers and main process use this for authenticated requests.

import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, isAxiosError } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { HTTP_STATUS } from '../constants';
import Logger from '../logger';

export class DigitalCookieSession {
  client: AxiosInstance;
  selectedRoleName: string | null = null;
  userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  private credentials: { username: string; password: string; role?: string } | null = null;

  constructor() {
    this.client = this.createClient();
  }

  /** Create a fresh axios client with a new cookie jar */
  private createClient(): AxiosInstance {
    const jar = new CookieJar();
    return wrapper(
      axios.create({
        baseURL: 'https://digitalcookie.girlscouts.org',
        jar: jar,
        withCredentials: true,
        timeout: 30_000,
        maxRedirects: 5,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
    );
  }

  get isAuthenticated(): boolean {
    return this.selectedRoleName !== null;
  }

  /** Extract CSRF token from login page HTML */
  private extractCSRFToken(html: string): string {
    const $ = cheerio.load(html);
    const token = $('input[name="_requestConfirmationToken"]').val();
    if (!token) throw new Error('CSRF token not found in login page');
    return Array.isArray(token) ? token[0] : token;
  }

  /** Extract role ID from role selection page. Auto-selects first "Troop" role if no name given. */
  private extractRoleId(html: string, roleName: string | null): { roleId: string; selectedRoleName: string } {
    const $ = cheerio.load(html);
    let roleId: string | null = null;
    let selectedRoleName: string | null = null;
    const availableRoles: Array<{ value: string | undefined; text: string }> = [];

    $('.custom-dropdown-option').each((_i: number, elem: any) => {
      const optionText = $(elem).text().trim();
      const optionValue = $(elem).attr('data-value');
      availableRoles.push({ value: optionValue, text: optionText });

      if (roleName && optionText === roleName && optionValue) {
        roleId = optionValue;
        selectedRoleName = optionText;
        return false;
      }

      if (!roleName && roleId === null && optionText.startsWith('Troop') && optionValue) {
        roleId = optionValue;
        selectedRoleName = optionText;
        return false;
      }

      return true;
    });

    if (roleId === null || selectedRoleName === null) {
      const rolesList = availableRoles.map((r) => `  [${r.value}] "${r.text}"`).join('\n');
      if (roleName) {
        throw new Error(`Role "${roleName}" not found.\n\nAvailable roles:\n${rolesList}`);
      }
      throw new Error(`No role starting with "Troop" found.\n\nAvailable roles:\n${rolesList}`);
    }

    return { roleId, selectedRoleName };
  }

  /** Extract troop/SU IDs from role name like "Troop 12345 - Service Unit 678" */
  extractTroopInfo(roleName: string): { troopId: string; serviceUnitId: string } {
    const troopMatch = roleName.match(/Troop\s+(\d+)/i);
    const serviceUnitMatch = roleName.match(/Service\s+Unit\s+(\d+)/i);

    if (!troopMatch || !serviceUnitMatch) {
      throw new Error(`Cannot extract troop/service unit IDs from role: "${roleName}"`);
    }

    return { troopId: troopMatch[1], serviceUnitId: serviceUnitMatch[1] };
  }

  /** Parse all role options from the select-role page HTML */
  private parseRoles(html: string): Array<{ id: string; name: string }> {
    const $ = cheerio.load(html);
    const roles: Array<{ id: string; name: string }> = [];
    $('.custom-dropdown-option').each((_i: number, elem: any) => {
      const name = $(elem).text().trim();
      const id = $(elem).attr('data-value');
      if (id && name) {
        roles.push({ id, name });
      }
    });
    return roles;
  }

  /** Shared login flow: fetch CSRF token and submit credentials */
  private async authenticate(username: string, password: string): Promise<void> {
    const loginPageResponse = await this.client.get('/login');
    const csrfToken = this.extractCSRFToken(loginPageResponse.data);

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
  }

  /** Check if an error is an authentication error (401 or 403) */
  private isAuthError(error: unknown): boolean {
    return isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403);
  }

  /** Authenticated GET request with automatic re-login on auth failure */
  async authenticatedGet<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    try {
      return await this.client.get<T>(url, config);
    } catch (error: unknown) {
      if (this.isAuthError(error) && this.credentials) {
        Logger.warn(`DC auth error on GET ${url}, attempting re-login`);
        await this.relogin();
        return await this.client.get<T>(url, config);
      }
      throw error;
    }
  }

  /** Login through role selection page and return available roles without selecting one. */
  async fetchRoles(username: string, password: string): Promise<Array<{ id: string; name: string }>> {
    await this.authenticate(username, password);

    const rolePageResponse = await this.client.get('/select-role');
    return this.parseRoles(rolePageResponse.data);
  }

  /** Login to Digital Cookie. Stores credentials for re-login. */
  async login(username: string, password: string, roleName: string | null): Promise<boolean> {
    Logger.info('DC session: logging in...');
    this.credentials = { username, password, role: roleName || undefined };

    await this.authenticate(username, password);
    Logger.info('DC session: authenticated, selecting role...');

    // Get and select role
    const rolePageResponse = await this.client.get('/select-role');
    const { roleId, selectedRoleName } = this.extractRoleId(rolePageResponse.data, roleName);

    const roleResponse = await this.client.get(`/select-role?id=${roleId}`);
    if (roleResponse.status !== HTTP_STATUS.OK && roleResponse.status !== HTTP_STATUS.FOUND) {
      Logger.error(`DC session: role selection failed (HTTP ${roleResponse.status})`);
      throw new Error(`Role selection failed with status ${roleResponse.status}`);
    }

    Logger.info(`DC session: login successful (role=${selectedRoleName})`);
    this.selectedRoleName = selectedRoleName;
    return true;
  }

  /** Re-login using stored credentials (silent). */
  async relogin(): Promise<boolean> {
    if (!this.credentials) throw new Error('No stored credentials for re-login');
    return this.login(this.credentials.username, this.credentials.password, this.credentials.role || null);
  }

  /** Reset all session state and recreate the HTTP client */
  reset(): void {
    this.selectedRoleName = null;
    this.credentials = null;
    this.client = this.createClient();
  }
}
