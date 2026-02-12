// Digital Cookie Session — owns auth state (cookie jar, CSRF, role selection)
// Scrapers and main process use this for authenticated requests.

import axios, { type AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { HTTP_STATUS } from '../constants';

export class DigitalCookieSession {
  client: AxiosInstance;
  selectedRoleName: string | null = null;
  private credentials: { username: string; password: string; role?: string } | null = null;

  constructor() {
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

  /** Login to Digital Cookie. Stores credentials for re-login. */
  async login(username: string, password: string, roleName: string | null): Promise<boolean> {
    this.credentials = { username, password, role: roleName || undefined };

    // Get CSRF token
    const loginPageResponse = await this.client.get('/login');
    const csrfToken = this.extractCSRFToken(loginPageResponse.data);

    // Submit login
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

    // Get and select role
    const rolePageResponse = await this.client.get('/select-role');
    const { roleId, selectedRoleName } = this.extractRoleId(rolePageResponse.data, roleName);

    const roleResponse = await this.client.get(`/select-role?id=${roleId}`);
    if (roleResponse.status !== HTTP_STATUS.OK && roleResponse.status !== HTTP_STATUS.FOUND) {
      throw new Error(`Role selection failed with status ${roleResponse.status}`);
    }

    this.selectedRoleName = selectedRoleName;
    return true;
  }

  /** Re-login using stored credentials (silent). */
  async relogin(): Promise<boolean> {
    if (!this.credentials) throw new Error('No stored credentials for re-login');
    return this.login(this.credentials.username, this.credentials.password, this.credentials.role || null);
  }
}
