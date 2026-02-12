import * as fs from 'node:fs';
import * as path from 'node:path';
import { isAxiosError } from 'axios';
import { SPECIAL_IDENTIFIERS, TRANSFER_TYPE } from '../constants';
import { normalizeCookieName } from '../cookie-constants';
import Logger from '../logger';
import type { ProgressCallback, ScrapeSourceResult } from '../types';
import { BaseScraper, getTimestamp } from './base-scraper';
import { requestWithRetry } from './request-utils';
import { SmartCookieSession } from './sc-session';
import type {
  SaveOrdersParams,
  SCBoothDividerResult,
  SCBoothLocationRaw,
  SCBoothTimeSlot,
  SCCookieMapEntry,
  SCDirectShipDivider,
  SCDividerGirl,
  SCOrder,
  SCOrdersResponse,
  SCReservation,
  SCReservationsResponse,
  SCVirtualCookieShare
} from './sc-types';

const BOOTH_DIVIDER_CONCURRENCY = 3;

/**
 * Smart Cookie API Scraper
 *
 * Uses a SmartCookieSession for all authenticated requests.
 * Supports AbortSignal for cancellation.
 */
class SmartCookieScraper extends BaseScraper {
  readonly source = 'sc' as const;
  session: SmartCookieSession;

  constructor(dataDir: string, progressCallback: ProgressCallback = null) {
    super(dataDir, progressCallback);
    this.session = new SmartCookieSession();
  }

  /** Initialize orders page context */
  private async initializeOrdersContext(): Promise<void> {
    try {
      await this.session.apiGet('/webapi/api/orders/dashboard', 'Orders dashboard');
    } catch (error) {
      Logger.warn('Warning: Could not initialize orders context:', (error as Error).message);
    }
  }

  async fetchOrders(signal?: AbortSignal): Promise<SCOrdersResponse> {
    this.checkAborted(signal);
    this.sendProgress('Fetching orders...', 25);

    await this.initializeOrdersContext();

    const searchPayload = {
      transfer_types: ['ALL'],
      transaction_types: ['T', 'C', 'G'],
      types: ['ALL'],
      organization: { district: [], cupboard: [], service_unit: [], troop: [] },
      user: { girl: [] }
    };

    try {
      const data = await this.session.apiPost<SCOrdersResponse>('/webapi/api/orders/search', searchPayload, 'Orders search');
      this.sendProgress('Orders fetched', 35);
      return data;
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response) {
        Logger.error('Orders API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText
        });
      }
      throw error;
    }
  }

  async fetchDirectShipDivider(signal?: AbortSignal): Promise<SCDirectShipDivider> {
    this.checkAborted(signal);
    this.sendProgress('Fetching direct ship allocations...', 40);
    return this.session.apiGet<SCDirectShipDivider>('/webapi/api/troops/directship/smart-directship-divider', 'Direct ship divider fetch');
  }

  async fetchVirtualCookieShare(orderId: string): Promise<SCVirtualCookieShare> {
    return this.session.apiGet<SCVirtualCookieShare>(`/webapi/api/cookie-shares/virtual/${orderId}`, 'Virtual cookie share fetch');
  }

  async fetchAllVirtualCookieShares(ordersData: SCOrdersResponse, signal?: AbortSignal): Promise<SCVirtualCookieShare[]> {
    this.checkAborted(signal);
    this.sendProgress('Fetching virtual cookie share details...', 45);

    const virtualCookieShares: SCVirtualCookieShare[] = [];

    const cookieShareOrders = (ordersData.orders || []).filter((order: SCOrder) => {
      const type = order.transfer_type || order.type || '';
      const orderNum = String(order.order_number || '');
      return type.includes(TRANSFER_TYPE.COOKIE_SHARE) && !orderNum.startsWith(SPECIAL_IDENTIFIERS.DC_ORDER_PREFIX);
    });

    for (const order of cookieShareOrders) {
      this.checkAborted(signal);
      const orderId = String(order.id || order.order_id || '');
      if (orderId) {
        try {
          const details = await this.fetchVirtualCookieShare(orderId);
          virtualCookieShares.push(details);
        } catch (error) {
          Logger.warn(`Warning: Could not fetch virtual cookie share ${orderId}:`, (error as Error).message);
        }
      }
    }

    return virtualCookieShares;
  }

  async fetchCookieIdMap(): Promise<Record<string, string>> {
    const data = await this.session.apiGet<SCCookieMapEntry[]>('/webapi/api/me/cookies', 'Cookie map fetch');
    const cookieMap: Record<string, string> = {};
    (data || []).forEach((cookie) => {
      if (cookie.id && cookie.name) {
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

  async fetchReservations(): Promise<SCReservationsResponse | null> {
    if (!this.session.troopId) {
      Logger.warn('Warning: No troopId available, skipping reservations fetch');
      return null;
    }
    return this.session.apiGet<SCReservationsResponse>(
      `/webapi/api/troops/reservations?troop_id=${this.session.troopId}`,
      'Reservations fetch'
    );
  }

  async fetchSmartBoothDivider(reservationId: string): Promise<{ girls?: SCDividerGirl[] } | null> {
    return this.session.apiGet(`/webapi/api/troops/reservations/smart-booth-divider/${reservationId}`, 'Booth divider fetch');
  }

  /**
   * Fetch all booth dividers with concurrency limiting.
   * Runs up to BOOTH_DIVIDER_CONCURRENCY fetches in parallel.
   */
  async fetchAllBoothDividers(reservationsData: SCReservationsResponse, signal?: AbortSignal): Promise<SCBoothDividerResult[]> {
    const reservations = reservationsData?.reservations || [];
    if (!Array.isArray(reservations) || reservations.length === 0) return [];

    const distributed = reservations.filter((r: SCReservation) => r.booth?.is_distributed || r.is_distributed);
    if (distributed.length === 0) return [];

    const boothDividers: SCBoothDividerResult[] = [];
    let completed = 0;

    // Process in batches of BOOTH_DIVIDER_CONCURRENCY
    for (let i = 0; i < distributed.length; i += BOOTH_DIVIDER_CONCURRENCY) {
      this.checkAborted(signal);
      const batch = distributed.slice(i, i + BOOTH_DIVIDER_CONCURRENCY);

      const batchResults = await Promise.all(
        batch.map(async (reservation: SCReservation) => {
          const reservationId = reservation.id || reservation.reservation_id;
          if (!reservationId) return null;

          try {
            const divider = await this.fetchSmartBoothDivider(reservationId);
            return {
              reservationId,
              booth: reservation.booth || {},
              timeslot: reservation.timeslot || {},
              divider
            };
          } catch (error) {
            Logger.warn(`Warning: Could not fetch booth divider for reservation ${reservationId}:`, (error as Error).message);
            return null;
          }
        })
      );

      for (const result of batchResults) {
        if (result) boothDividers.push(result);
      }

      completed += batch.length;
      const progress = 66 + Math.round((completed / distributed.length) * 9);
      this.sendProgress(`Fetching booth divider ${completed}/${distributed.length}...`, progress);
    }

    return boothDividers;
  }

  async fetchBoothLocations(boothIds: number[] = []): Promise<SCBoothLocationRaw[]> {
    if (!this.session.troopId) {
      Logger.warn('Warning: No troopId available, skipping booth locations fetch');
      return [];
    }

    const allBooths = await this.session.apiPost<SCBoothLocationRaw[]>(
      '/webapi/api/booths/search',
      { troop_id: this.session.troopId },
      'Booth locations fetch'
    );

    const filtered = boothIds.length > 0 ? (allBooths || []).filter((b) => boothIds.includes(b.id || b.booth_id || 0)) : allBooths || [];

    if (boothIds.length > 0) {
      for (const booth of filtered) {
        booth.availableDates = await this.fetchBoothAvailability(booth.id || booth.booth_id || 0);
      }
    }

    return filtered;
  }

  async fetchBoothAvailability(boothId: number): Promise<{ date: string; timeSlots: SCBoothTimeSlot[] }[]> {
    try {
      const datesData = await this.fetchBoothDates(boothId);
      const dates = Array.isArray(datesData) ? datesData : datesData?.dates || [];
      const result: { date: string; timeSlots: SCBoothTimeSlot[] }[] = [];

      for (const d of dates) {
        const dateStr = typeof d === 'string' ? d : d.date || '';
        if (!dateStr) continue;
        result.push({ date: dateStr, timeSlots: await this.fetchBoothTimeSlots(boothId, dateStr) });
      }

      return result;
    } catch (err) {
      Logger.warn(`Warning: Could not fetch dates for booth ${boothId}:`, (err as Error).message);
      return [];
    }
  }

  async fetchBoothTimeSlots(boothId: number, date: string): Promise<SCBoothTimeSlot[]> {
    try {
      const timesData = await this.fetchBoothTimes(boothId, date);
      const slots = Array.isArray(timesData) ? timesData : timesData?.times || timesData?.slots || [];
      return slots.map((s: SCBoothTimeSlot) => ({
        start_time: s.start_time || s.startTime || s.start || '',
        end_time: s.end_time || s.endTime || s.end || ''
      }));
    } catch (err) {
      Logger.warn(`Warning: Could not fetch times for booth ${boothId} on ${date}:`, (err as Error).message);
      return [];
    }
  }

  async fetchBoothDates(boothId: number): Promise<{ dates?: Array<string | { date: string }> } | Array<string | { date: string }>> {
    if (!this.session.troopId) throw new Error('No troopId available. Must sync first.');
    return this.session.apiGet(`/webapi/api/booths/availability?booth_id=${boothId}&troop_id=${this.session.troopId}`, 'Booth dates fetch');
  }

  async fetchBoothTimes(
    boothId: number,
    date: string
  ): Promise<{ times?: SCBoothTimeSlot[]; slots?: SCBoothTimeSlot[] } | SCBoothTimeSlot[]> {
    if (!this.session.troopId) throw new Error('No troopId available. Must sync first.');
    return this.session.apiGet(
      `/webapi/api/booths/availability/times?booth_id=${boothId}&date=${date}&troop_id=${this.session.troopId}`,
      'Booth times fetch'
    );
  }

  /** Extract troopId from C2T transfers when /me didn't provide it */
  extractTroopIdFromOrders(orders: SCOrder[]): string | null {
    for (const order of orders) {
      const type = order.transfer_type || order.type || '';
      if ((type === TRANSFER_TYPE.C2T || type.startsWith(TRANSFER_TYPE.C2T)) && order.to) {
        const match = String(order.to).match(/\d+/);
        if (match) {
          Logger.debug(`Extracted troopId from C2T transfer: ${match[0]}`);
          return match[0];
        }
      }
    }
    return null;
  }

  async saveOrdersData(params: SaveOrdersParams): Promise<string> {
    this.sendProgress('Saving data...', 80);
    const { ordersData, directShipDivider, virtualCookieShares, reservations, boothDividers, boothLocations, cookieIdMap } = params;

    if (!fs.existsSync(this.inDir)) {
      fs.mkdirSync(this.inDir, { recursive: true });
    }

    const timestamp = getTimestamp();
    const filePath = path.join(this.inDir, `SC-${timestamp}.json`);

    const combinedData = {
      ...ordersData,
      directShipDivider: directShipDivider || null,
      virtualCookieShares: virtualCookieShares || [],
      reservations: reservations || null,
      boothDividers: boothDividers || [],
      boothLocations: boothLocations || [],
      cookieIdMap: cookieIdMap || null
    };

    fs.writeFileSync(filePath, JSON.stringify(combinedData, null, 2));
    this.saveDebugData({ ordersData, directShipDivider, virtualCookieShares, reservations, boothDividers, cookieIdMap });

    this.sendProgress('Data saved', 90);
    return filePath;
  }

  saveDebugData(rawResponses: Record<string, any>): void {
    try {
      const debugDir = path.join(this.dataDir, 'debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      const debugData = {
        timestamp: new Date().toISOString(),
        troopId: this.session.troopId,
        me: this.session.meResponse || null,
        ...rawResponses
      };
      fs.writeFileSync(path.join(debugDir, 'SC-debug-latest.json'), JSON.stringify(debugData, null, 2));
    } catch (err) {
      Logger.warn('Warning: Could not save debug data:', (err as Error).message);
    }
  }

  /**
   * Main scrape method. Accepts AbortSignal for cancellation.
   */
  async scrape(
    credentials: { username: string; password: string },
    boothIds: number[] = [],
    signal?: AbortSignal
  ): Promise<ScrapeSourceResult> {
    if (!credentials?.username || !credentials?.password) {
      return { success: false, source: 'Smart Cookie', error: 'Username and password are required' };
    }

    try {
      this.checkAborted(signal);
      this.sendProgress('Starting...', 5);

      // Login via session
      this.sendProgress('Logging in...', 10);
      await this.session.login(credentials.username, credentials.password);
      this.sendProgress('Login successful', 20);

      this.checkAborted(signal);

      // Step 1: Fetch orders
      const ordersData = await requestWithRetry(
        () => this.fetchOrders(signal),
        () => this.session.relogin(),
        { logPrefix: 'Smart Cookie: Fetch Orders', rateLimit: false }
      );

      // Fallback troopId extraction
      if (!this.session.troopId && ordersData?.orders) {
        this.session.troopId = this.extractTroopIdFromOrders(ordersData.orders);
      }

      this.checkAborted(signal);

      // Step 2: Direct ship divider
      const directShipDivider = await requestWithRetry(
        () => this.fetchDirectShipDivider(signal),
        () => this.session.relogin(),
        { logPrefix: 'Smart Cookie: Fetch Direct Ship' }
      );

      this.checkAborted(signal);

      // Step 3: Virtual cookie shares
      const virtualCookieShares = await requestWithRetry(
        () => this.fetchAllVirtualCookieShares(ordersData, signal),
        () => this.session.relogin(),
        { logPrefix: 'Smart Cookie: Fetch Cookie Shares' }
      );

      this.checkAborted(signal);

      // Step 4: Cookie ID map (non-fatal)
      this.sendProgress('Fetching cookie map...', 50);
      const cookieIdMap = await this.session.fetchOptional(() => this.fetchCookieIdMap(), 'Fetch Cookie Map', null);

      this.checkAborted(signal);

      // Step 5: Booth locations (non-fatal)
      this.sendProgress('Fetching booth locations...', 55);
      const boothLocations = await this.session.fetchOptional(() => this.fetchBoothLocations(boothIds), 'Fetch Booth Locations', []);

      this.checkAborted(signal);

      // Step 6: Reservations (non-fatal)
      this.sendProgress('Fetching reservations...', 60);
      const reservations = await this.session.fetchOptional(() => this.fetchReservations(), 'Fetch Reservations', null);

      this.checkAborted(signal);

      // Step 7: Booth dividers with concurrent batching (non-fatal)
      let boothDividers: SCBoothDividerResult[] = [];
      if (reservations) {
        this.sendProgress('Fetching booth allocations...', 65);
        boothDividers = await this.session.fetchOptional(
          () => this.fetchAllBoothDividers(reservations, signal),
          'Fetch Booth Dividers',
          []
        );
      }

      this.checkAborted(signal);

      // Step 8: Save
      const filePath = await this.saveOrdersData({
        ordersData,
        directShipDivider,
        virtualCookieShares,
        reservations,
        boothDividers,
        boothLocations,
        cookieIdMap
      });

      this.sendProgress('Complete', 100);

      return {
        success: true,
        source: 'Smart Cookie API',
        filePath,
        orderCount: ordersData.orders?.length || 0,
        totalCases: ordersData.summary?.total_cases || 0
      };
    } catch (error) {
      if (signal?.aborted) {
        return { success: false, source: 'Smart Cookie API', error: 'Sync cancelled' };
      }
      Logger.error('Smart Cookie API scraper error:', error);
      return { success: false, source: 'Smart Cookie API', error: (error as Error).message };
    }
  }
}

export default SmartCookieScraper;
