import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { HTTP_STATUS, SPECIAL_IDENTIFIERS } from '../constants';
import { normalizeCookieName } from '../cookie-constants';
import Logger from '../logger';
import { getTimestamp } from '../scraper-utils';
import type { ProgressCallback } from '../types';
import { requestWithRetry } from './request-utils';

interface SaveOrdersParams {
  ordersData: any;
  directShipDivider: any;
  virtualCookieShares: any;
  reservations: any;
  boothDividers: any;
  boothLocations: any;
  cookieIdMap: any;
}

/**
 * Smart Cookie API Scraper - API-based scraping
 *
 * This scraper uses the Smart Cookies API endpoints directly to:
 * 1. Login and obtain authentication cookies (AuthCookie and XSRF-TOKEN)
 * 2. Call the orders search API with proper CSRF protection
 * 3. Save the JSON response to disk
 */
class SmartCookieApiScraper {
  dataDir: string;
  inDir: string;
  progressCallback: ProgressCallback;
  xsrfToken: string | null;
  troopId: string | null;
  cookieJar: any;
  client: any;
  meResponse: any;
  credentials: { username: string; password: string } | null;

  constructor(dataDir: string, progressCallback: ProgressCallback = null) {
    this.dataDir = dataDir;
    this.inDir = path.join(dataDir, 'in');
    this.progressCallback = progressCallback;
    this.xsrfToken = null;
    this.troopId = null;
    this.meResponse = null;
    this.credentials = null;

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

  sendProgress(status: string, progress: number): void {
    if (this.progressCallback) {
      this.progressCallback({ status, progress });
    }
  }

  /**
   * Make an authenticated GET request with XSRF token validation and error formatting
   */
  async apiGet(url: string, label: string): Promise<any> {
    if (!this.xsrfToken) {
      throw new Error('XSRF token not available. Must login first.');
    }

    try {
      const response = await this.client.get(url, {
        headers: {
          'x-xsrf-token': this.xsrfToken,
          Referer: 'https://app.abcsmartcookies.com/'
        }
      });

      if (response.status !== HTTP_STATUS.OK) {
        throw new Error(`${label} failed with status ${response.status}`);
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`${label} failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw new Error(`${label} failed: ${error.message}`);
    }
  }

  /**
   * Make an authenticated POST request with XSRF token validation and error formatting
   */
  async apiPost(url: string, body: Record<string, any>, label: string): Promise<any> {
    if (!this.xsrfToken) {
      throw new Error('XSRF token not available. Must login first.');
    }

    try {
      const response = await this.client.post(url, body, {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'x-xsrf-token': this.xsrfToken,
          Referer: 'https://app.abcsmartcookies.com/'
        }
      });

      if (response.status !== HTTP_STATUS.OK) {
        throw new Error(`${label} failed with status ${response.status}`);
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`${label} failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw new Error(`${label} failed: ${error.message}`);
    }
  }

  /**
   * Wrap a fetch call in try/catch, returning a fallback value on failure.
   * Used for non-fatal fetches where failure should not abort the scrape.
   */
  async fetchOptional<T>(fetchFn: () => Promise<T>, label: string, fallback: T): Promise<T> {
    try {
      return await requestWithRetry(fetchFn, () => this.login(this.credentials!.username, this.credentials!.password, true), {
        logPrefix: `Smart Cookie: ${label}`
      });
    } catch (error) {
      Logger.warn(`Warning: Could not fetch ${label.toLowerCase()}:`, error.message);
      return fallback;
    }
  }

  /**
   * Extract XSRF token from cookies
   * The XSRF-TOKEN cookie value needs to be sent in the x-xsrf-token header
   */
  async extractXsrfToken() {
    try {
      // Get all cookies as a string to see the raw Set-Cookie header
      const cookies = await this.cookieJar.getCookies('https://app.abcsmartcookies.com');
      const xsrfCookie = cookies.find((cookie: any) => cookie.key === SPECIAL_IDENTIFIERS.XSRF_TOKEN_COOKIE);

      if (!xsrfCookie) {
        throw new Error(`${SPECIAL_IDENTIFIERS.XSRF_TOKEN_COOKIE} cookie not found after login`);
      }

      // Use the raw cookie value
      this.xsrfToken = xsrfCookie.value;

      // URL decode if it contains %7C (encoded pipe character)
      // The token format is: part1|part2 where | is URL-encoded as %7C
      if (this.xsrfToken.includes('%7C')) {
        this.xsrfToken = decodeURIComponent(this.xsrfToken);
      }

      return this.xsrfToken;
    } catch (error) {
      throw new Error(`Failed to extract XSRF token: ${error.message}`);
    }
  }

  /**
   * Login to Smart Cookies
   * POSTs credentials to /webapi/api/account/login
   * Captures AuthCookie and XSRF-TOKEN from response cookies
   */
  async login(username: string, password: string, silent = false): Promise<boolean> {
    if (!silent) {
      this.sendProgress('Smart Cookie API: Logging in...', 10);
    }

    try {
      const loginPayload = {
        username: username,
        password: password
      };

      const response = await this.client.post('/webapi/api/account/login', loginPayload, {
        headers: {
          'Content-Type': 'application/json',
          Referer: 'https://abcsmartcookies.com/'
        }
      });

      if (response.status !== HTTP_STATUS.OK) {
        throw new Error(`Login failed with status ${response.status}`);
      }

      // Extract XSRF token from cookies for subsequent requests
      await this.extractXsrfToken();

      // Call /me endpoint to establish session and capture troopId
      try {
        const meData = await this.apiGet('/webapi/api/me', '/me endpoint');

        this.meResponse = meData || null;

        // Extract troopId from /me response
        if (meData?.role?.troop_id) {
          this.troopId = meData.role.troop_id;
        }

        // Refresh XSRF token after /me call
        await this.extractXsrfToken();
      } catch (err) {
        Logger.warn('Warning: /me endpoint failed:', err.message);
      }

      if (!silent) {
        this.sendProgress('Smart Cookie API: Login successful', 20);
      }
      return true;
    } catch (error) {
      if (error.response) {
        throw new Error(`Login failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Initialize orders page context by calling dashboard API
   * This establishes the session context needed for orders/search
   */
  async initializeOrdersContext() {
    try {
      // Call the orders dashboard API first
      await this.apiGet('/webapi/api/orders/dashboard', 'Orders dashboard');

      // Refresh XSRF token in case it changed
      await this.extractXsrfToken();
    } catch (error) {
      Logger.warn('Warning: Could not initialize orders context:', error.message);
      // Don't fail here, continue anyway
    }
  }

  /**
   * Fetch orders using the search API
   * POSTs search parameters to /webapi/api/orders/search
   * Includes x-xsrf-token header for CSRF protection
   */
  async fetchOrders() {
    this.sendProgress('Smart Cookie API: Fetching orders...', 25);

    // Initialize orders page context first
    await this.initializeOrdersContext();

    if (!this.xsrfToken) {
      throw new Error('XSRF token not available. Must login first.');
    }

    try {
      // Search parameters from the network recording
      // This searches for ALL order types and transfers
      const searchPayload = {
        transfer_types: ['ALL'],
        transaction_types: ['T', 'C', 'G'],
        types: ['ALL'],
        organization: {
          district: [],
          cupboard: [],
          service_unit: [],
          troop: []
        },
        user: {
          girl: []
        }
      };

      const response = await this.client.post('/webapi/api/orders/search', searchPayload, {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'x-xsrf-token': this.xsrfToken,
          Referer: 'https://app.abcsmartcookies.com/'
        }
      });

      if (response.status !== HTTP_STATUS.OK) {
        throw new Error(`Orders fetch failed with status ${response.status}`);
      }

      const ordersData = response.data;

      this.sendProgress('Smart Cookie API: Orders fetched', 35);
      return ordersData;
    } catch (error) {
      if (error.response) {
        Logger.error('Orders API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data
        });
        throw new Error(`Orders fetch failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw new Error(`Orders fetch failed: ${error.message}`);
    }
  }

  /**
   * Fetch Smart Direct Ship Divider allocations
   * Shows how troop direct ship orders are allocated to individual scouts
   */
  async fetchDirectShipDivider() {
    this.sendProgress('Smart Cookie API: Fetching direct ship allocations...', 40);
    return this.apiGet('/webapi/api/troops/directship/smart-directship-divider', 'Direct ship divider fetch');
  }

  /**
   * Fetch Virtual Cookie Share details for a specific order
   * Returns per-scout allocation breakdown
   */
  async fetchVirtualCookieShare(orderId: string): Promise<Record<string, any>[]> {
    return this.apiGet(`/webapi/api/cookie-shares/virtual/${orderId}`, 'Virtual cookie share fetch');
  }

  /**
   * Fetch all Virtual Cookie Share allocations
   * Finds all COOKIE_SHARE transfers and fetches their per-scout breakdowns
   */
  async fetchAllVirtualCookieShares(ordersData: Record<string, any>): Promise<Record<string, any>[]> {
    this.sendProgress('Smart Cookie API: Fetching virtual cookie share details...', 45);

    const virtualCookieShares = [];

    // Find all non-DC COOKIE_SHARE orders (both manual and booth divider generated)
    const cookieShareOrders = (ordersData.orders || []).filter((order: any) => {
      const type = order.transfer_type || order.type || '';
      const orderNum = String(order.order_number || '');
      return type.includes('COOKIE_SHARE') && !orderNum.startsWith('D');
    });

    // Fetch per-girl breakdown for each COOKIE_SHARE order
    for (const order of cookieShareOrders) {
      const orderId = order.id || order.order_id;
      if (orderId) {
        try {
          const details = await this.fetchVirtualCookieShare(orderId);
          virtualCookieShares.push(details);
        } catch (error) {
          Logger.warn(`Warning: Could not fetch virtual cookie share ${orderId}:`, error.message);
        }
      }
    }

    return virtualCookieShares;
  }

  /**
   * Fetch dynamic cookie ID to name mapping
   * Returns {id: name} map for translating cookie IDs in booth divider data
   */
  async fetchCookieIdMap() {
    const data = await this.apiGet('/webapi/api/me/cookies', 'Cookie map fetch');

    // Transform array [{id, name, ...}] to {id: COOKIE_TYPE constant} map
    const cookieMap = {};
    (data || []).forEach((cookie: any) => {
      if (cookie.id && cookie.name) {
        // Normalize display name to COOKIE_TYPE constant
        const cookieType = normalizeCookieName(cookie.name);
        if (cookieType) {
          cookieMap[cookie.id] = cookieType;
        } else {
          Logger.warn(`Unknown cookie variety "${cookie.name}" from API. Update COOKIE_NAME_NORMALIZATION in cookie-constants.ts`);
        }
      }
    });

    return cookieMap;
  }

  /**
   * Fetch booth reservations for the troop
   * Returns reservation data including store names, dates, and distribution status
   */
  async fetchReservations() {
    if (!this.troopId) {
      Logger.warn('Warning: No troopId available, skipping reservations fetch');
      return null;
    }

    return this.apiGet(`/webapi/api/troops/reservations?troop_id=${this.troopId}`, 'Reservations fetch');
  }

  /**
   * Fetch Smart Booth Divider allocations for a specific reservation
   * Returns per-girl cookie allocations at a booth
   */
  async fetchSmartBoothDivider(reservationId: string): Promise<Record<string, any> | null> {
    return this.apiGet(`/webapi/api/troops/reservations/smart-booth-divider/${reservationId}`, 'Booth divider fetch');
  }

  /**
   * Fetch all booth divider allocations for distributed reservations
   * Iterates through reservations and fetches per-girl breakdowns
   */
  async fetchAllBoothDividers(reservationsData: Record<string, any>): Promise<Record<string, any>[]> {
    const reservations = reservationsData?.reservations || reservationsData || [];
    if (!Array.isArray(reservations) || reservations.length === 0) {
      return [];
    }

    const boothDividers = [];

    // Filter to only distributed reservations (is_distributed is nested under booth)
    const distributed = reservations.filter((r) => r.booth?.is_distributed || r.is_distributed);

    for (let i = 0; i < distributed.length; i++) {
      const reservation = distributed[i];
      const reservationId = reservation.id || reservation.reservation_id;
      if (!reservationId) continue;

      const progress = 66 + Math.round((i / distributed.length) * 9);
      this.sendProgress(`Smart Cookie API: Fetching booth divider ${i + 1}/${distributed.length}...`, progress);

      try {
        const divider = await this.fetchSmartBoothDivider(reservationId);
        boothDividers.push({
          reservationId: reservationId,
          booth: reservation.booth || {},
          timeslot: reservation.timeslot || {},
          divider: divider
        });
      } catch (error) {
        Logger.warn(`Warning: Could not fetch booth divider for reservation ${reservationId}:`, error.message);
      }
    }

    return boothDividers;
  }

  /**
   * Fetch available booth locations for the troop
   * Returns list of stores where booths can be reserved
   */
  async fetchBoothLocations(boothIds: number[] = []): Promise<any[]> {
    if (!this.troopId) {
      Logger.warn('Warning: No troopId available, skipping booth locations fetch');
      return [];
    }

    const allBooths = await this.apiPost('/webapi/api/booths/search', { troop_id: this.troopId }, 'Booth locations fetch');

    // Filter to configured booth IDs (passed from app config)
    const filtered = boothIds.length > 0 ? (allBooths || []).filter((b: any) => boothIds.includes(b.id || b.booth_id)) : allBooths || [];

    // Only fetch dates/time slots for explicitly configured booths (avoid hammering API for all booths)
    if (boothIds.length > 0) {
      for (const booth of filtered) {
        booth.availableDates = await this.fetchBoothAvailability(booth.id || booth.booth_id);
      }
    }

    return filtered;
  }

  /** Fetch available dates and time slots for a single booth */
  async fetchBoothAvailability(boothId: number): Promise<{ date: string; timeSlots: any[] }[]> {
    try {
      const datesData = await this.fetchBoothDates(boothId);
      const dates = Array.isArray(datesData) ? datesData : datesData?.dates || [];
      const result: { date: string; timeSlots: any[] }[] = [];

      for (const d of dates) {
        const dateStr = typeof d === 'string' ? d : d.date || '';
        if (!dateStr) continue;
        result.push({ date: dateStr, timeSlots: await this.fetchBoothTimeSlots(boothId, dateStr) });
      }

      return result;
    } catch (err) {
      Logger.warn(`Warning: Could not fetch dates for booth ${boothId}:`, err.message);
      return [];
    }
  }

  /** Fetch and normalize time slots for a booth on a specific date */
  async fetchBoothTimeSlots(boothId: number, date: string): Promise<any[]> {
    try {
      const timesData = await this.fetchBoothTimes(boothId, date);
      const slots = Array.isArray(timesData) ? timesData : timesData?.times || timesData?.slots || [];
      return slots.map((s: any) => ({
        start_time: s.start_time || s.startTime || s.start || '',
        end_time: s.end_time || s.endTime || s.end || ''
      }));
    } catch (err) {
      Logger.warn(`Warning: Could not fetch times for booth ${boothId} on ${date}:`, err.message);
      return [];
    }
  }

  /**
   * Fetch available dates for a specific booth (on-demand)
   * Returns dates when the booth has availability
   */
  async fetchBoothDates(boothId: number): Promise<any> {
    if (!this.troopId) {
      throw new Error('No troopId available. Must sync first.');
    }

    return this.apiGet(`/webapi/api/booths/availability?booth_id=${boothId}&troop_id=${this.troopId}`, 'Booth dates fetch');
  }

  /**
   * Fetch available time slots for a booth on a specific date (on-demand)
   * Returns available start/end times
   */
  async fetchBoothTimes(boothId: number, date: string): Promise<any> {
    if (!this.troopId) {
      throw new Error('No troopId available. Must sync first.');
    }

    return this.apiGet(
      `/webapi/api/booths/availability/times?booth_id=${boothId}&date=${date}&troop_id=${this.troopId}`,
      'Booth times fetch'
    );
  }

  /**
   * Save orders data to JSON file
   */
  async saveOrdersData(params: SaveOrdersParams) {
    this.sendProgress('Smart Cookie API: Saving data...', 80);

    const { ordersData, directShipDivider, virtualCookieShares, reservations, boothDividers, boothLocations, cookieIdMap } = params;

    // Ensure output directory exists
    if (!fs.existsSync(this.inDir)) {
      fs.mkdirSync(this.inDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = getTimestamp();
    const filePath = path.join(this.inDir, `SC-${timestamp}.json`);

    // Combine orders, direct ship divider, virtual cookie share, and booth data
    const combinedData = {
      ...ordersData,
      directShipDivider: directShipDivider || null,
      virtualCookieShares: virtualCookieShares || [],
      reservations: reservations || null,
      boothDividers: boothDividers || [],
      boothLocations: boothLocations || [],
      cookieIdMap: cookieIdMap || null
    };

    // Write JSON file with pretty formatting
    fs.writeFileSync(filePath, JSON.stringify(combinedData, null, 2));

    // Save raw API responses for debugging (overwrite each sync)
    this.saveDebugData({ ordersData, directShipDivider, virtualCookieShares, reservations, boothDividers, cookieIdMap });

    this.sendProgress('Smart Cookie API: Data saved', 90);

    return filePath;
  }

  /**
   * Save raw API responses to a debug file (most recent only)
   */
  saveDebugData(rawResponses: Record<string, any>): void {
    try {
      const debugDir = path.join(this.dataDir, 'debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      const debugData = {
        timestamp: new Date().toISOString(),
        troopId: this.troopId,
        me: this.meResponse || null,
        ...rawResponses
      };
      fs.writeFileSync(path.join(debugDir, 'SC-debug-latest.json'), JSON.stringify(debugData, null, 2));
    } catch (err) {
      Logger.warn('Warning: Could not save debug data:', err.message);
    }
  }

  /** Extract troopId from C2T (Council to Troop) transfers when /me didn't provide it */
  extractTroopIdFromOrders(orders: Record<string, any>[]): string | null {
    for (const order of orders) {
      const type = order.transfer_type || order.type || '';
      if ((type === 'C2T' || type.startsWith('C2T')) && order.to) {
        const match = String(order.to).match(/\d+/);
        if (match) {
          Logger.debug(`Extracted troopId from C2T transfer: ${match[0]}`);
          return match[0];
        }
      }
    }
    return null;
  }

  /**
   * Main scraping method
   * Orchestrates the login, fetch, and save operations
   * Uses automatic session detection - tries fetching first, only logs in if session expired
   */
  async scrape(credentials: { username: string; password: string }, boothIds: number[] = []): Promise<Record<string, any>> {
    // Validate input
    if (!credentials || !credentials.username || !credentials.password) {
      return {
        success: false,
        source: 'Smart Cookie',
        error: 'Username and password are required'
      };
    }

    try {
      this.sendProgress('Smart Cookie API: Starting...', 5);

      // Store credentials for potential re-login
      this.credentials = credentials;

      // Smart Cookie requires login first to get XSRF token
      await this.login(credentials.username, credentials.password);

      // Step 1: Fetch orders with automatic retry if session expires
      const ordersData = await requestWithRetry(
        () => this.fetchOrders(),
        () => this.login(credentials.username, credentials.password, true),
        { logPrefix: 'Smart Cookie: Fetch Orders', rateLimit: false }
      );

      // Fallback: extract troopId from orders data if /me didn't provide it
      if (!this.troopId && ordersData?.orders) {
        this.troopId = this.extractTroopIdFromOrders(ordersData.orders);
      }

      // Step 2: Fetch direct ship divider allocations (with rate limiting)
      const directShipDivider = await requestWithRetry(
        () => this.fetchDirectShipDivider(),
        () => this.login(credentials.username, credentials.password, true),
        { logPrefix: 'Smart Cookie: Fetch Direct Ship' }
      );

      // Step 3: Fetch virtual cookie share allocations (with rate limiting)
      const virtualCookieShares = await requestWithRetry(
        () => this.fetchAllVirtualCookieShares(ordersData),
        () => this.login(credentials.username, credentials.password, true),
        { logPrefix: 'Smart Cookie: Fetch Cookie Shares' }
      );

      // Step 4: Fetch cookie ID map (non-fatal)
      this.sendProgress('Smart Cookie API: Fetching cookie map...', 50);
      const cookieIdMap = await this.fetchOptional(() => this.fetchCookieIdMap(), 'Fetch Cookie Map', null);

      // Step 5: Fetch booth locations (non-fatal)
      this.sendProgress('Smart Cookie API: Fetching booth locations...', 55);
      const boothLocations = await this.fetchOptional(() => this.fetchBoothLocations(boothIds), 'Fetch Booth Locations', []);

      // Step 6: Fetch booth reservations (non-fatal)
      this.sendProgress('Smart Cookie API: Fetching reservations...', 60);
      const reservations = await this.fetchOptional(() => this.fetchReservations(), 'Fetch Reservations', null);

      // Step 7: Fetch booth divider allocations if reservations exist (non-fatal)
      let boothDividers = [];
      if (reservations) {
        this.sendProgress('Smart Cookie API: Fetching booth allocations...', 65);
        boothDividers = await this.fetchOptional(() => this.fetchAllBoothDividers(reservations), 'Fetch Booth Dividers', []);
      }

      // Step 8: Save to file
      const filePath = await this.saveOrdersData({
        ordersData,
        directShipDivider,
        virtualCookieShares,
        reservations,
        boothDividers,
        boothLocations,
        cookieIdMap
      });

      this.sendProgress('Smart Cookie API: Complete', 100);

      return {
        success: true,
        source: 'Smart Cookie API',
        filePath: filePath,
        orderCount: ordersData.orders?.length || 0,
        totalCases: ordersData.summary?.total_cases || 0
      };
    } catch (error) {
      Logger.error('Smart Cookie API scraper error:', error);
      return {
        success: false,
        source: 'Smart Cookie API',
        error: error.message
      };
    }
  }
}

export default SmartCookieApiScraper;
