// Smart Cookie Session — owns auth state (cookie jar, XSRF, troopId)
// Scrapers and main process use this for authenticated API calls.

import axios, { type AxiosInstance, isAxiosError } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { type Cookie, CookieJar } from 'tough-cookie';
import { HTTP_STATUS, SPECIAL_IDENTIFIERS } from '../constants';
import Logger from '../logger';
import { requestWithRetry } from './request-utils';
import type { SCMeResponse } from './sc-types';

export class SmartCookieSession {
  xsrfToken: string | null = null;
  troopId: string | null = null;
  meResponse: SCMeResponse | null = null;
  client: AxiosInstance;
  private cookieJar: CookieJar;
  private credentials: { username: string; password: string } | null = null;

  constructor() {
    this.cookieJar = new CookieJar();
    this.client = wrapper(
      axios.create({
        baseURL: 'https://app.abcsmartcookies.com',
        jar: this.cookieJar,
        withCredentials: true,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
    );
  }

  get isAuthenticated(): boolean {
    return this.xsrfToken !== null;
  }

  /** Extract XSRF token from cookie jar */
  private async extractXsrfToken(): Promise<string> {
    const cookies = await this.cookieJar.getCookies('https://app.abcsmartcookies.com');
    const xsrfCookie = cookies.find((cookie: Cookie) => cookie.key === SPECIAL_IDENTIFIERS.XSRF_TOKEN_COOKIE);

    if (!xsrfCookie) {
      throw new Error(`${SPECIAL_IDENTIFIERS.XSRF_TOKEN_COOKIE} cookie not found after login`);
    }

    let token = xsrfCookie.value;
    if (token.includes('%7C')) {
      token = decodeURIComponent(token);
    }

    this.xsrfToken = token;
    return token;
  }

  /** Login to Smart Cookie. Stores credentials for re-login. */
  async login(username: string, password: string, silent = false): Promise<boolean> {
    this.credentials = { username, password };

    const response = await this.client.post(
      '/webapi/api/account/login',
      { username, password },
      {
        headers: {
          'Content-Type': 'application/json',
          Referer: 'https://abcsmartcookies.com/'
        }
      }
    );

    if (response.status !== HTTP_STATUS.OK) {
      throw new Error(`Login failed with status ${response.status}`);
    }

    await this.extractXsrfToken();

    // Call /me endpoint to establish session and capture troopId
    try {
      const meData = await this.apiGet<SCMeResponse>('/webapi/api/me', '/me endpoint');
      this.meResponse = meData || null;

      if (meData?.role?.troop_id) {
        this.troopId = meData.role.troop_id;
      }

      await this.extractXsrfToken();
    } catch (err) {
      if (!silent) Logger.warn('Warning: /me endpoint failed:', (err as Error).message);
    }

    return true;
  }

  /** Re-login using stored credentials (silent). Used by requestWithRetry. */
  async relogin(): Promise<boolean> {
    if (!this.credentials) throw new Error('No stored credentials for re-login');
    return this.login(this.credentials.username, this.credentials.password, true);
  }

  private get authHeaders() {
    return { 'x-xsrf-token': this.xsrfToken!, Referer: 'https://app.abcsmartcookies.com/' };
  }

  private formatApiError(error: unknown, label: string): Error {
    if (isAxiosError(error) && error.response) {
      return new Error(`${label} failed: ${error.response.status} ${error.response.statusText}`);
    }
    return new Error(`${label} failed: ${(error as Error).message}`);
  }

  /** Authenticated GET request */
  async apiGet<T = any>(url: string, label: string): Promise<T> {
    if (!this.xsrfToken) throw new Error('XSRF token not available. Must login first.');
    try {
      const response = await this.client.get(url, { headers: this.authHeaders });
      if (response.status !== HTTP_STATUS.OK) throw new Error(`${label} failed with status ${response.status}`);
      return response.data;
    } catch (error: unknown) {
      throw this.formatApiError(error, label);
    }
  }

  /** Authenticated POST request */
  async apiPost<T = any>(url: string, body: Record<string, any>, label: string): Promise<T> {
    if (!this.xsrfToken) throw new Error('XSRF token not available. Must login first.');
    try {
      const response = await this.client.post(url, body, {
        headers: { 'Content-Type': 'application/json;charset=UTF-8', ...this.authHeaders }
      });
      if (response.status !== HTTP_STATUS.OK) throw new Error(`${label} failed with status ${response.status}`);
      return response.data;
    } catch (error: unknown) {
      throw this.formatApiError(error, label);
    }
  }

  /** Wrap a fetch in try/catch with retry and re-login. Returns fallback on failure. */
  async fetchOptional<T>(fetchFn: () => Promise<T>, label: string, fallback: T): Promise<T> {
    try {
      return await requestWithRetry(fetchFn, () => this.relogin(), { logPrefix: `Smart Cookie: ${label}` });
    } catch (error) {
      Logger.warn(`Warning: Could not fetch ${label.toLowerCase()}:`, (error as Error).message);
      return fallback;
    }
  }
}
