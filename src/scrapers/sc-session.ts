// Smart Cookie Session — owns auth state (cookie jar, XSRF, troopId)
// Pure HTTP client. Scrapers and main process use this for authenticated API calls.

import axios, { type AxiosInstance, type AxiosResponse, isAxiosError } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { type Cookie, CookieJar } from 'tough-cookie';
import { HTTP_STATUS, SPECIAL_IDENTIFIERS } from '../constants';
import Logger from '../logger';
import type { SCMeResponse } from './sc-types';

export class SmartCookieSession {
  xsrfToken: string | null = null;
  troopId: string | null = null;
  meResponse: SCMeResponse | null = null;
  client: AxiosInstance;
  userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  private cookieJar: CookieJar;
  private credentials: { username: string; password: string } | null = null;

  constructor() {
    this.cookieJar = new CookieJar();
    this.client = this.createClient();
  }

  /** Create a fresh axios client with the current cookie jar */
  private createClient(): AxiosInstance {
    return wrapper(
      axios.create({
        baseURL: 'https://app.abcsmartcookies.com',
        jar: this.cookieJar,
        withCredentials: true,
        maxRedirects: 5,
        headers: {
          'User-Agent': this.userAgent,
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
  async login(username: string, password: string): Promise<boolean> {
    Logger.info('SC session: logging in...');
    this.credentials = { username, password };

    const response = await this.client
      .post(
        '/webapi/api/account/login',
        { username, password },
        {
          headers: { 'Content-Type': 'application/json', Referer: 'https://abcsmartcookies.com/' }
        }
      )
      .catch((error) => {
        if (isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500) {
          Logger.error(`SC session: login failed (HTTP ${error.response.status})`);
          throw new Error('Invalid login credentials');
        }
        throw error;
      });

    if (response.status !== HTTP_STATUS.OK) {
      Logger.error(`SC session: login failed (HTTP ${response.status})`);
      throw new Error('Invalid login credentials');
    }

    Logger.info('SC session: login successful, extracting XSRF token');
    await this.extractXsrfToken();

    // Call /me to establish session and capture troopId
    try {
      await this.fetchMe();
      Logger.info(`SC session: authenticated (troopId=${this.troopId})`);
    } catch {
      Logger.warn('SC session: /me failed (non-fatal)');
      // Non-fatal — troopId can be extracted from C2T orders as fallback
    }

    return true;
  }

  /** Re-login using stored credentials (silent). Used by authenticatedRequest. */
  async relogin(): Promise<boolean> {
    if (!this.credentials) throw new Error('No stored credentials for re-login');
    return this.login(this.credentials.username, this.credentials.password);
  }

  /** Fetch /me endpoint to get troop identity. Called right after login — no retry needed. */
  async fetchMe(): Promise<SCMeResponse | null> {
    const response = await this.client.get<SCMeResponse>('/webapi/api/me', { headers: this.authHeaders });
    const meData = response.data || null;
    this.meResponse = meData;
    if (meData?.role?.troop_id) {
      this.troopId = meData.role.troop_id;
    }
    return this.meResponse;
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

  /** Check if an error is an authentication error (401 or 403) */
  private isAuthError(error: unknown): boolean {
    return isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403);
  }

  /** Execute an authenticated request with automatic re-login on auth failure */
  private async authenticatedRequest<T>(requestFn: () => Promise<AxiosResponse<T>>, label: string): Promise<T> {
    if (!this.xsrfToken) throw new Error('Not authenticated. Must login first.');

    try {
      const response = await requestFn();
      if (response.status !== HTTP_STATUS.OK) throw new Error(`${label} failed with status ${response.status}`);
      return response.data;
    } catch (error: unknown) {
      if (this.isAuthError(error) && this.credentials) {
        await this.relogin();
        try {
          const response = await requestFn();
          if (response.status !== HTTP_STATUS.OK) throw new Error(`${label} failed with status ${response.status}`);
          return response.data;
        } catch (retryError: unknown) {
          throw this.formatApiError(retryError, label);
        }
      }
      throw this.formatApiError(error, label);
    }
  }

  /** Authenticated GET request */
  async apiGet<T = unknown>(url: string, label: string): Promise<T> {
    return this.authenticatedRequest<T>(() => this.client.get(url, { headers: this.authHeaders }), label);
  }

  /** Authenticated POST request */
  async apiPost<T = unknown>(url: string, body: Record<string, unknown>, label: string): Promise<T> {
    return this.authenticatedRequest<T>(
      () => this.client.post(url, body, { headers: { 'Content-Type': 'application/json;charset=UTF-8', ...this.authHeaders } }),
      label
    );
  }

  /** Reset all session state and recreate the HTTP client */
  reset(): void {
    this.xsrfToken = null;
    this.troopId = null;
    this.meResponse = null;
    this.credentials = null;
    this.cookieJar = new CookieJar();
    this.client = this.createClient();
  }
}
