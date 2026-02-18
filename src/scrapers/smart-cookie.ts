import { isAxiosError } from 'axios';
import { PIPELINE_FILES, SPECIAL_IDENTIFIERS, TRANSFER_TYPE } from '../constants';
import { normalizeCookieName } from '../cookie-constants';
import Logger from '../logger';
import type SeasonalData from '../seasonal-data';
import type { ProgressCallback, ScrapeSourceResult } from '../types';
import { BaseScraper, savePipelineFile } from './base-scraper';
import type BoothCache from './booth-cache';
import type { BoothDatesData, BoothTimesData } from './booth-cache';
import { SmartCookieSession } from './sc-session';
import type {
  SCBoothDividerResult,
  SCBoothLocationRaw,
  SCBoothTimeSlot,
  SCCookieMapEntry,
  SCDirectShipDivider,
  SCDividerGirl,
  SCFinanceTransaction,
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
  session: SmartCookieSession;

  constructor(dataDir: string, progressCallback: ProgressCallback = null, session?: SmartCookieSession) {
    super(dataDir, progressCallback);
    this.session = session || new SmartCookieSession();
  }

  /** Unified fetch + status reporting. Fatal endpoints throw; non-fatal return fallback. */
  private async fetchEndpoint<T>(
    endpoint: string,
    fetchFn: () => Promise<T>,
    opts: { fatal?: boolean; fallback?: T; cached?: { fresh: boolean; data: T } } = {}
  ): Promise<T> {
    if (opts.cached?.fresh) {
      Logger.info(`${endpoint}: using cached data`);
      this.sendEndpointStatus(endpoint, 'synced', true);
      return opts.cached.data;
    }
    Logger.info(`${endpoint}: fetching...`);
    this.sendEndpointStatus(endpoint, 'syncing');
    const startTime = Date.now();
    try {
      const result = await fetchFn();
      const durationMs = Date.now() - startTime;
      const dataSize = result != null ? JSON.stringify(result).length : undefined;
      Logger.info(`${endpoint}: success (${durationMs}ms, ${dataSize ?? 0}B)`);
      this.sendEndpointStatus(endpoint, 'synced', false, durationMs, dataSize);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const httpStatus = isAxiosError(error) ? error.response?.status : undefined;
      Logger.error(`${endpoint}: failed (${durationMs}ms, HTTP ${httpStatus ?? '?'}) ${(error as Error).message}`);
      this.sendEndpointStatus(endpoint, 'error', false, durationMs, undefined, httpStatus, (error as Error).message);
      if (opts.fatal) throw error;
      return opts.fallback as T;
    }
  }

  /** Initialize orders page context */
  private async initializeOrdersContext(signal?: AbortSignal): Promise<void> {
    try {
      await this.session.apiGet('/webapi/api/orders/dashboard', 'Orders dashboard', signal);
    } catch (error) {
      Logger.warn('Warning: Could not initialize orders context:', (error as Error).message);
    }
  }

  async fetchOrders(signal?: AbortSignal): Promise<SCOrdersResponse> {
    this.checkAborted(signal);

    await this.initializeOrdersContext(signal);

    const searchPayload = {
      transfer_types: ['ALL'],
      transaction_types: ['T', 'C', 'G'],
      types: ['ALL'],
      organization: { district: [], cupboard: [], service_unit: [], troop: [] },
      user: { girl: [] }
    };

    try {
      return await this.session.apiPost<SCOrdersResponse>('/webapi/api/orders/search', searchPayload, 'Orders search', signal);
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
    return this.session.apiGet<SCDirectShipDivider>('/webapi/api/troops/directship/smart-directship-divider', 'Direct ship', signal);
  }

  async fetchVirtualCookieShare(orderId: string, signal?: AbortSignal): Promise<SCVirtualCookieShare> {
    return this.session.apiGet<SCVirtualCookieShare>(`/webapi/api/cookie-shares/virtual/${orderId}`, 'Cookie shares', signal);
  }

  async fetchAllVirtualCookieShares(ordersData: SCOrdersResponse, signal?: AbortSignal): Promise<Record<string, SCVirtualCookieShare>> {
    this.checkAborted(signal);

    const keyedShares: Record<string, SCVirtualCookieShare> = {};

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
          keyedShares[orderId] = await this.fetchVirtualCookieShare(orderId, signal);
        } catch (error) {
          Logger.warn(`Warning: Could not fetch virtual cookie share ${orderId}:`, (error as Error).message);
        }
      }
    }

    return keyedShares;
  }

  /** Build processed cookie ID → type map from raw API entries */
  buildCookieIdMap(entries: SCCookieMapEntry[]): Record<string, string> {
    const cookieMap: Record<string, string> = {};
    for (const cookie of entries) {
      if (cookie.id && cookie.name) {
        const cookieType = normalizeCookieName(cookie.name);
        if (cookieType) {
          cookieMap[cookie.id] = cookieType;
        } else {
          Logger.warn(`Unknown cookie variety "${cookie.name}" from API. Update COOKIE_NAME_NORMALIZATION in cookie-constants.ts`);
        }
      }
    }
    return cookieMap;
  }

  async fetchCookieIdMap(signal?: AbortSignal): Promise<Record<string, string>> {
    const data = await this.session.apiGet<SCCookieMapEntry[]>('/webapi/api/me/cookies', 'Cookie map fetch', signal);
    return this.buildCookieIdMap(data || []);
  }

  async fetchReservations(signal?: AbortSignal): Promise<SCReservationsResponse | null> {
    if (!this.session.troopId) {
      Logger.warn('Warning: No troopId available, skipping reservations fetch');
      return null;
    }
    return this.session.apiGet<SCReservationsResponse>(
      `/webapi/api/troops/reservations?troop_id=${this.session.troopId}`,
      'Reservations',
      signal
    );
  }

  async fetchFinanceList(signal?: AbortSignal): Promise<SCFinanceTransaction[]> {
    this.checkAborted(signal);
    return this.session.apiGet<SCFinanceTransaction[]>('/ported/finance/list?troop=false', 'Finance list', signal);
  }

  async fetchSmartBoothDivider(reservationId: string, signal?: AbortSignal): Promise<{ girls?: SCDividerGirl[] } | null> {
    return this.session.apiGet(`/webapi/api/troops/reservations/smart-booth-divider/${reservationId}`, 'Booth allocations', signal);
  }

  /**
   * Fetch all booth dividers with concurrency limiting.
   * Runs up to BOOTH_DIVIDER_CONCURRENCY fetches in parallel.
   */
  async fetchAllBoothDividers(
    reservationsData: SCReservationsResponse,
    signal?: AbortSignal
  ): Promise<Record<string, SCBoothDividerResult>> {
    const reservations = reservationsData?.reservations || [];
    if (!Array.isArray(reservations) || reservations.length === 0) return {};

    const distributed = reservations.filter((r: SCReservation) => r.booth?.is_distributed || r.is_distributed);
    if (distributed.length === 0) return {};

    const keyedDividers: Record<string, SCBoothDividerResult> = {};

    // Process in batches of BOOTH_DIVIDER_CONCURRENCY
    for (let i = 0; i < distributed.length; i += BOOTH_DIVIDER_CONCURRENCY) {
      this.checkAborted(signal);
      const batch = distributed.slice(i, i + BOOTH_DIVIDER_CONCURRENCY);

      const batchResults = await Promise.all(
        batch.map(async (reservation: SCReservation) => {
          const reservationId = reservation.id || reservation.reservation_id;
          if (!reservationId) return null;

          try {
            const divider = await this.fetchSmartBoothDivider(reservationId, signal);
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
        if (result) {
          keyedDividers[result.reservationId] = result;
        }
      }
    }

    return keyedDividers;
  }

  /** Fetch booth catalog only, using cache if available */
  async fetchBoothCatalog(cache?: BoothCache, signal?: AbortSignal): Promise<SCBoothLocationRaw[]> {
    if (cache?.isCatalogFresh()) {
      return cache.getCatalog() || [];
    }
    if (!this.session.troopId) {
      Logger.warn('No troopId available, skipping booth catalog fetch');
      return [];
    }
    const allBooths = await this.session.apiPost<SCBoothLocationRaw[]>(
      '/webapi/api/booths/search',
      { troop_id: this.session.troopId },
      'Booth catalog',
      signal
    );
    const result = allBooths || [];
    if (cache) cache.setCatalog(result);
    return result;
  }

  /** Fetch booth availability (dates + times) for selected booths, using cache */
  async fetchBoothAvailability(
    boothIds: number[],
    catalog: SCBoothLocationRaw[],
    cache?: BoothCache,
    signal?: AbortSignal
  ): Promise<SCBoothLocationRaw[]> {
    const filtered = boothIds.length > 0 ? catalog.filter((b) => boothIds.includes(b.id || b.booth_id || 0)) : catalog;

    if (boothIds.length === 0) return filtered;

    for (const booth of filtered) {
      const boothId = booth.id || booth.booth_id || 0;

      // Tier 2: Dates
      let rawDates: BoothDatesData;
      if (cache?.isDatesFresh(boothId)) {
        rawDates = cache.getDates(boothId)!;
      } else {
        rawDates = await this.fetchBoothDates(boothId, signal);
        cache?.setDates(boothId, rawDates);
      }
      const dates = Array.isArray(rawDates) ? rawDates : rawDates?.dates || [];

      const availableDates: { date: string; timeSlots: SCBoothTimeSlot[] }[] = [];
      for (const d of dates) {
        const dateStr = typeof d === 'string' ? d : d.date || '';
        if (!dateStr) continue;

        // Tier 3: Time slots
        let rawTimes: BoothTimesData;
        if (cache?.isTimeSlotsFresh(boothId, dateStr)) {
          rawTimes = cache.getTimeSlots(boothId, dateStr)!;
        } else {
          rawTimes = await this.fetchBoothTimes(boothId, dateStr, signal);
          cache?.setTimeSlots(boothId, dateStr, rawTimes);
        }
        const slots = Array.isArray(rawTimes) ? rawTimes : rawTimes?.times || rawTimes?.slots || [];
        availableDates.push({
          date: dateStr,
          timeSlots: slots.map((s: SCBoothTimeSlot) => ({
            start_time: s.start_time || s.startTime || s.start || '',
            end_time: s.end_time || s.endTime || s.end || ''
          }))
        });
      }

      booth.availableDates = availableDates;
    }

    return filtered;
  }

  async fetchBoothDates(
    boothId: number,
    signal?: AbortSignal
  ): Promise<{ dates?: Array<string | { date: string }> } | Array<string | { date: string }>> {
    if (!this.session.troopId) throw new Error('No troopId available. Must sync first.');
    return this.session.apiGet(
      `/webapi/api/booths/availability?booth_id=${boothId}&troop_id=${this.session.troopId}`,
      'Booth availability dates',
      signal
    );
  }

  async fetchBoothTimes(
    boothId: number,
    date: string,
    signal?: AbortSignal
  ): Promise<{ times?: SCBoothTimeSlot[]; slots?: SCBoothTimeSlot[] } | SCBoothTimeSlot[]> {
    if (!this.session.troopId) throw new Error('No troopId available. Must sync first.');
    return this.session.apiGet(
      `/webapi/api/booths/availability/times?booth_id=${boothId}&date=${date}&troop_id=${this.session.troopId}`,
      'Booth availability times',
      signal
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

  /**
   * Main scrape method. Accepts AbortSignal for cancellation.
   * seasonalData and boothCache enable staleness-based caching for config endpoints.
   */
  async scrape(
    credentials: { username: string; password: string },
    boothIds: number[] = [],
    signal?: AbortSignal,
    seasonalData?: SeasonalData,
    boothCache?: BoothCache
  ): Promise<ScrapeSourceResult> {
    if (!credentials?.username || !credentials?.password) {
      return { success: false, source: 'Smart Cookie', error: 'Username and password are required' };
    }

    try {
      this.checkAborted(signal);

      // Phase 1: Login
      this.sendEndpointStatus('sc-login', 'syncing');
      await this.session.login(credentials.username, credentials.password);

      // Use stored troop info if available (seasonal data)
      const storedTroop = seasonalData?.loadTroop();
      if (storedTroop?.role?.troop_id) {
        this.session.troopId = storedTroop.role.troop_id;
        this.session.meResponse = storedTroop;
      }
      this.sendEndpointStatus('sc-login', 'synced');

      this.checkAborted(signal);

      // Phase 2: Independent fetches in parallel
      const storedCookies = seasonalData?.loadCookies();
      const cookieMapCached = storedCookies?.length ? { fresh: true, data: this.buildCookieIdMap(storedCookies) } : undefined;
      const catalogCached = boothCache?.isCatalogFresh() ? { fresh: true, data: boothCache.getCatalog() || [] } : undefined;

      const [ordersData, directShipDivider, reservations, catalog, cookieIdMap, financeData] = await Promise.all([
        this.fetchEndpoint('sc-orders', () => this.fetchOrders(signal), { fatal: true }),
        this.fetchEndpoint<SCDirectShipDivider | null>('sc-direct-ship', () => this.fetchDirectShipDivider(signal), { fallback: null }),
        this.fetchEndpoint<SCReservationsResponse | null>('sc-reservations', () => this.fetchReservations(signal), { fallback: null }),
        this.fetchEndpoint<SCBoothLocationRaw[]>('sc-booth-catalog', () => this.fetchBoothCatalog(boothCache, signal), {
          fallback: [],
          cached: catalogCached
        }),
        this.fetchEndpoint<Record<string, string> | null>('sc-cookie-map', () => this.fetchCookieIdMap(signal), {
          fallback: null,
          cached: cookieMapCached
        }),
        this.fetchEndpoint<SCFinanceTransaction[]>('sc-finance', () => this.fetchFinanceList(signal), { fallback: [] })
      ]);

      // Fallback troopId extraction
      if (!this.session.troopId && ordersData?.orders) {
        this.session.troopId = this.extractTroopIdFromOrders(ordersData.orders);
      }

      // Save Phase 2 data (durable across Phase 3 failures/cancellation)
      savePipelineFile(this.dataDir, PIPELINE_FILES.SC_ORDERS, ordersData);
      if (directShipDivider) savePipelineFile(this.dataDir, PIPELINE_FILES.SC_DIRECT_SHIP, directShipDivider);
      if (reservations) savePipelineFile(this.dataDir, PIPELINE_FILES.SC_RESERVATIONS, reservations);
      savePipelineFile(this.dataDir, PIPELINE_FILES.SC_BOOTH_CATALOG, catalog);
      if (cookieIdMap) savePipelineFile(this.dataDir, PIPELINE_FILES.SC_COOKIE_ID_MAP, cookieIdMap);
      if (financeData.length > 0) savePipelineFile(this.dataDir, PIPELINE_FILES.SC_FINANCE, financeData);

      this.checkAborted(signal);

      // Phase 3: Dependent fetches
      const [cookieShares, boothAllocations, boothLocations] = await Promise.all([
        this.fetchEndpoint<Record<string, SCVirtualCookieShare>>(
          'sc-cookie-shares',
          () => this.fetchAllVirtualCookieShares(ordersData, signal),
          {
            fallback: {}
          }
        ),
        reservations
          ? this.fetchEndpoint<Record<string, SCBoothDividerResult>>(
              'sc-booth-allocations',
              () => this.fetchAllBoothDividers(reservations, signal),
              { fallback: {} }
            )
          : (() => {
              this.sendEndpointStatus('sc-booth-allocations', 'synced');
              return {} as Record<string, SCBoothDividerResult>;
            })(),
        this.fetchEndpoint<SCBoothLocationRaw[]>(
          'sc-booth-availability',
          () => this.fetchBoothAvailability(boothIds, catalog, boothCache, signal),
          { fallback: catalog }
        )
      ]);

      // Save Phase 3 data
      if (Object.keys(cookieShares).length > 0) savePipelineFile(this.dataDir, PIPELINE_FILES.SC_COOKIE_SHARES, cookieShares);
      if (Object.keys(boothAllocations).length > 0) savePipelineFile(this.dataDir, PIPELINE_FILES.SC_BOOTH_ALLOCATIONS, boothAllocations);
      if (boothLocations.length > 0 && boothIds.length > 0)
        savePipelineFile(this.dataDir, PIPELINE_FILES.SC_BOOTH_LOCATIONS, boothLocations);

      return {
        success: true,
        source: 'Smart Cookie API',
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
