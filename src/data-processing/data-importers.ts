// Data Import and Parsing Functions

import {
  DATA_SOURCES,
  DC_COLUMNS,
  EXCEL_EPOCH,
  MS_PER_DAY,
  PACKAGES_PER_CASE,
  SC_API_COLUMNS,
  SC_REPORT_COLUMNS,
  TRANSFER_TYPE
} from '../constants';
import {
  COOKIE_ABBR_MAP,
  COOKIE_COLUMN_MAP,
  COOKIE_ID_MAP,
  COOKIE_TYPE,
  DC_COOKIE_COLUMNS,
  normalizeCookieName
} from '../cookie-constants';
import type { DataStore } from '../data-store';
import { createTransfer, mergeOrCreateOrder } from '../data-store-operations';
import Logger from '../logger';
import type { BoothAvailableDate, BoothLocation, CookieType, Order, Varieties } from '../types';
import { isC2TTransfer, sumPhysicalPackages } from './utils';

// ============================================================================
// PURE PARSING FUNCTIONS
// ============================================================================

/** Parse cookie varieties from Digital Cookie row */
function parseVarietiesFromDC(row: Record<string, any>): Varieties {
  const varieties: Record<string, number> = {};
  DC_COOKIE_COLUMNS.forEach((columnName) => {
    const count = parseInt(row[columnName], 10) || 0;
    if (count > 0) {
      const cookieType = normalizeCookieName(columnName);
      if (!cookieType) {
        Logger.warn(
          `Unknown cookie variety "${columnName}" in Digital Cookie data. Update COOKIE_NAME_NORMALIZATION in cookie-constants.ts`
        );
      } else {
        varieties[cookieType] = count;
      }
    }
  });
  return varieties as Varieties;
}

/** Parse cookie varieties from Smart Cookie Report row */
function parseVarietiesFromSCReport(row: Record<string, any>): { varieties: Varieties; totalCases: number; totalPackages: number } {
  const varieties: Record<string, number> = {};
  let totalCases = 0;
  let totalPackages = 0;

  Object.entries(COOKIE_COLUMN_MAP).forEach(([col, cookieType]) => {
    const value = row[col] || '0/0';
    const parts = String(value).split('/');
    const cases = parseInt(parts[0], 10) || 0;
    const packages = parseInt(parts[1], 10) || 0;
    const total = cases * PACKAGES_PER_CASE + packages;

    if (total > 0) {
      varieties[cookieType] = total;
    }
    totalCases += Math.abs(cases);
    totalPackages += Math.abs(total);
  });

  return { varieties: varieties as Varieties, totalCases, totalPackages };
}

/** Parse cookie varieties from Smart Cookie API cookies array */
function parseVarietiesFromAPI(
  cookiesArray: Array<{ id?: number; cookieId?: number; quantity: number }> | null,
  dynamicCookieIdMap: Record<number, CookieType> | null = null
): { varieties: Varieties; totalPackages: number } {
  const varieties: Record<string, number> = {};
  let totalPackages = 0;
  const idMap = dynamicCookieIdMap || COOKIE_ID_MAP;

  (cookiesArray || []).forEach((cookie) => {
    const cookieId = cookie.id || cookie.cookieId;
    const cookieName = idMap[cookieId];

    if (!cookieName && cookieId && cookie.quantity !== 0) {
      // Unknown cookie ID - log warning to prevent silent data loss
      Logger.warn(`Unknown cookie ID ${cookieId} with quantity ${cookie.quantity}. Update COOKIE_ID_MAP in cookie-constants.ts`);
    }

    if (cookieName && cookie.quantity !== 0) {
      varieties[cookieName] = Math.abs(cookie.quantity);
      totalPackages += Math.abs(cookie.quantity);
    }
  });

  return { varieties: varieties as Varieties, totalPackages };
}

/** Parse cookie varieties from Smart Cookie transfer row */
function parseVarietiesFromSCTransfer(row: Record<string, any>): Varieties {
  const varieties: Record<string, number> = {};

  Object.entries(COOKIE_ABBR_MAP).forEach(([abbr, cookieType]) => {
    const count = parseInt(row[abbr], 10) || 0;
    if (count !== 0) {
      varieties[cookieType] = count;
    }
  });

  return varieties as Varieties;
}

/** Parse Excel date number to ISO string */
function parseExcelDate(excelDate: number | null | undefined): string | null {
  if (!excelDate || typeof excelDate !== 'number') return null;
  return new Date(EXCEL_EPOCH.getTime() + excelDate * MS_PER_DAY).toISOString();
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

/** Register a scout by girlId, creating the scout entry if needed */
function registerScout(reconciler: DataStore, girlId: any, girl: Record<string, any>): void {
  const scoutName = `${girl.first_name || ''} ${girl.last_name || ''}`.trim();
  if (!girlId || !scoutName) return;

  if (!reconciler.scouts.has(scoutName)) {
    updateScoutData(reconciler, scoutName, {}, { scoutId: girlId });
  } else {
    const scout = reconciler.scouts.get(scoutName);
    if (!scout.scoutId) {
      scout.scoutId = girlId;
    }
  }
}

/** Merge a Digital Cookie order found in Smart Cookie data (D-prefixed order numbers) */
function mergeDCOrderFromSC(
  reconciler: DataStore,
  orderNum: string,
  scout: string,
  transferData: { date: string; packages: number; amount: number },
  _type: string,
  varieties: Varieties,
  source: string,
  rawData: Record<string, any>
): void {
  const dcOrderNum = orderNum.substring(1);
  mergeOrCreateOrder(
    reconciler,
    dcOrderNum,
    {
      orderNumber: dcOrderNum,
      scout,
      date: transferData.date,
      packages: Math.abs(transferData.packages),
      amount: Math.abs(transferData.amount),
      status: 'In SC Only',
      varieties
    },
    source,
    rawData
  );
}

/** Register scouts from an API transfer (T2G pickup, G2T return, Cookie Share) */
function trackScoutFromAPITransfer(reconciler: DataStore, type: string, to: string, from: string, _packages: number): void {
  if (type === TRANSFER_TYPE.T2G && to !== from) {
    updateScoutData(reconciler, to, {});
  }
  if (type === TRANSFER_TYPE.G2T && to !== from) {
    updateScoutData(reconciler, from, {});
  }
  if (type.includes('COOKIE_SHARE')) {
    updateScoutData(reconciler, to, {});
  }
}

/** Parse a girl's cookie allocation, deduplicating by key. Returns null if zero packages or duplicate. */
function parseGirlAllocation(
  girl: Record<string, any>,
  dedupePrefix: string | number,
  seen: Set<string>,
  reconciler: DataStore,
  dynamicCookieIdMap: Record<number, CookieType> | null
): { girlId: number; varieties: Varieties; totalPackages: number; trackedCookieShare: number } | null {
  const girlId = girl.id;
  const { varieties, totalPackages } = parseVarietiesFromAPI(girl.cookies, dynamicCookieIdMap);
  if (totalPackages === 0) return null;

  const dedupeKey = `${dedupePrefix}-${girlId}`;
  if (seen.has(dedupeKey)) return null;
  seen.add(dedupeKey);

  registerScout(reconciler, girlId, girl);
  return { girlId, varieties, totalPackages, trackedCookieShare: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0 };
}

// ============================================================================
// IMPORT FUNCTIONS
// ============================================================================

/** Update scout aggregated data (additive for numeric, direct set for metadata) */
function updateScoutData(reconciler: DataStore, scoutName: string, updates: Record<string, any>, metadata: Record<string, any> = {}): void {
  // Metadata fields that should be set directly (not added)
  const metadataFields = ['scoutId', 'gsusaId', 'gradeLevel', 'serviceUnit', 'troopId', 'council', 'district'];

  if (!reconciler.scouts.has(scoutName)) {
    reconciler.scouts.set(scoutName, {
      name: scoutName,
      scoutId: null,
      gsusaId: null,
      gradeLevel: null,
      serviceUnit: null,
      troopId: null,
      council: null,
      district: null
    });
  }

  const scout = reconciler.scouts.get(scoutName);

  // Handle metadata updates (set directly if not null)
  Object.keys(updates).forEach((key) => {
    if (metadataFields.includes(key)) {
      if (updates[key] !== null && updates[key] !== undefined) {
        scout[key] = updates[key];
      }
    }
  });

  // Handle separate metadata object (for backward compatibility)
  Object.keys(metadata).forEach((key) => {
    if (metadata[key] !== null && metadata[key] !== undefined) {
      scout[key] = metadata[key];
    }
  });
}

/** Import Digital Cookie order data from Excel export */
function importDigitalCookie(reconciler: DataStore, dcData: Record<string, any>[]): void {
  reconciler.metadata.rawDCData = dcData;

  dcData.forEach((row: Record<string, any>) => {
    const orderNum = String(row[DC_COLUMNS.ORDER_NUMBER]);
    const scout = `${row[DC_COLUMNS.GIRL_FIRST_NAME] || ''} ${row[DC_COLUMNS.GIRL_LAST_NAME] || ''}`.trim();

    const varieties = parseVarietiesFromDC(row);

    const orderData = {
      orderNumber: orderNum,
      scout: scout,
      date: parseExcelDate(row[DC_COLUMNS.ORDER_DATE]),
      packages: (parseInt(row[DC_COLUMNS.TOTAL_PACKAGES], 10) || 0) - (parseInt(row[DC_COLUMNS.REFUNDED_PACKAGES], 10) || 0),
      amount: parseFloat(row[DC_COLUMNS.CURRENT_SALE_AMOUNT]) || 0,
      status: row[DC_COLUMNS.ORDER_STATUS],
      paymentStatus: row[DC_COLUMNS.PAYMENT_STATUS],
      varieties: varieties
    };

    // Merge or create order (DC is source of truth for order details)
    mergeOrCreateOrder(reconciler, orderNum, orderData, DATA_SOURCES.DIGITAL_COOKIE, row);

    // Register scout
    updateScoutData(reconciler, scout, {});
  });

  reconciler.metadata.lastImportDC = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.DIGITAL_COOKIE,
    date: new Date().toISOString(),
    records: dcData.length
  });
}

/** Import Smart Cookie Report data (ReportExport.xlsx) */
function importSmartCookieReport(reconciler: DataStore, reportData: Record<string, any>[]): void {
  reportData.forEach((row: Record<string, any>) => {
    const orderNum = String(row[SC_REPORT_COLUMNS.ORDER_ID] || row[SC_REPORT_COLUMNS.REF_NUMBER]);
    const scout = row[SC_REPORT_COLUMNS.GIRL_NAME] || '';

    // Parse varieties from C1-C13 columns (format: "cases/packages")
    const { varieties, totalCases, totalPackages } = parseVarietiesFromSCReport(row);

    // Parse total (also in "cases/packages" format)
    const totalParts = String(row[SC_REPORT_COLUMNS.TOTAL] || '0/0').split('/');
    const fieldCases = parseInt(totalParts[0], 10) || 0;
    const fieldPkgs = parseInt(totalParts[1], 10) || 0;
    const totalFromField = fieldCases * PACKAGES_PER_CASE + fieldPkgs || totalPackages;

    const orderData = {
      orderNumber: orderNum,
      scout: scout,
      scoutId: row[SC_REPORT_COLUMNS.GIRL_ID],
      gsusaId: row[SC_REPORT_COLUMNS.GSUSA_ID],
      gradeLevel: row[SC_REPORT_COLUMNS.GRADE_LEVEL],
      date: row[SC_REPORT_COLUMNS.ORDER_DATE],
      packages: totalFromField,
      cases: totalCases,
      varieties: varieties,
      organization: {
        troopId: row[SC_REPORT_COLUMNS.TROOP_ID],
        serviceUnit: row[SC_REPORT_COLUMNS.SERVICE_UNIT_DESC],
        council: row[SC_REPORT_COLUMNS.COUNCIL_DESC],
        district: row[SC_REPORT_COLUMNS.PARAM_TITLE] ? row[SC_REPORT_COLUMNS.PARAM_TITLE].match(/District = ([^;]+)/)?.[1]?.trim() : null
      }
    };

    // Merge or create order with enrichment
    mergeOrCreateOrder(
      reconciler,
      orderNum,
      orderData,
      DATA_SOURCES.SMART_COOKIE_REPORT,
      row,
      (existing: Order, newData: Partial<Order>) => {
        existing.scoutId = newData.scoutId;
        existing.gsusaId = newData.gsusaId;
        existing.gradeLevel = newData.gradeLevel;
        existing.cases = newData.cases;
        existing.organization = {
          troopId: newData.organization?.troopId,
          serviceUnit: newData.organization?.serviceUnit,
          council: newData.organization?.council,
          district: newData.organization?.district
        };
      }
    );

    // Register scout with metadata
    updateScoutData(reconciler, scout, {
      scoutId: orderData.scoutId,
      gsusaId: orderData.gsusaId,
      gradeLevel: orderData.gradeLevel,
      serviceUnit: orderData.organization?.serviceUnit
    });
  });

  reconciler.metadata.lastImportSCReport = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.SMART_COOKIE_REPORT,
    date: new Date().toISOString(),
    records: reportData.length
  });
}

/** Import optional supplemental data from Smart Cookie API (dividers, booths, cookie shares) */
function importOptionalData(reconciler: DataStore, apiData: Record<string, any>): void {
  if (apiData.directShipDivider?.girls) {
    importDirectShipDivider(reconciler, apiData.directShipDivider);
  }

  if (apiData.virtualCookieShares && apiData.virtualCookieShares.length > 0) {
    importVirtualCookieShares(reconciler, apiData.virtualCookieShares);
  }

  if (apiData.cookieIdMap) {
    reconciler.metadata.cookieIdMap = apiData.cookieIdMap;
  }
  if (apiData.reservations) {
    importReservations(reconciler, apiData.reservations, apiData.cookieIdMap);
  }
  if (apiData.boothDividers?.length > 0) {
    importBoothDividers(reconciler, apiData.boothDividers, apiData.cookieIdMap);
  }
  if (apiData.directShipDivider?.length > 0) {
    importDirectShipDividers(reconciler, apiData.directShipDivider, apiData.cookieIdMap);
  }
  if (apiData.boothLocations?.length > 0) {
    importBoothLocations(reconciler, apiData.boothLocations);
  }
}

/** Import Smart Cookie API data from API endpoints */
function importSmartCookieAPI(reconciler: DataStore, apiData: Record<string, any>): void {
  const orders = apiData.orders || [];

  orders.forEach((order: Record<string, any>) => {
    // Handle both old format and new /orders/search API format
    // Use transfer_type for actual transfer type (C2T(P), T2G, D, etc.)
    // order.type is just "TRANSFER" for all transfers
    const type = order.transfer_type || order.type || order.orderType || '';
    const orderNum = String(order.order_number || order.orderNumber || '');
    const to = order.to || '';
    const from = order.from || '';

    // Parse varieties from cookies array
    // Handle both formats: cookies[].id (new API) or cookies[].cookieId (old format)
    const { varieties, totalPackages } = parseVarietiesFromAPI(order.cookies);

    const transferData = {
      date: order.date || order.createdDate,
      type: type,
      orderNumber: orderNum,
      from: from,
      to: to,
      packages: totalPackages,
      cases: Math.round(Math.abs(order.total_cases || 0) / PACKAGES_PER_CASE), // Convert packages to cases
      varieties: varieties,
      amount: Math.abs(parseFloat(order.total || order.totalPrice) || 0),
      virtualBooth: order.virtual_booth || false,
      boothDivider: !!(order.smart_divider_id && !order.virtual_booth),
      status: order.status || '',
      actions: order.actions || {}
    };

    reconciler.transfers.push(createTransfer(transferData));

    if (orderNum.startsWith('D')) {
      mergeDCOrderFromSC(reconciler, orderNum, to, transferData, type, varieties, DATA_SOURCES.SMART_COOKIE_API, order);
    }

    trackScoutFromAPITransfer(reconciler, type, to, from, transferData.packages);
  });

  importOptionalData(reconciler, apiData);

  reconciler.metadata.lastImportSC = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.SMART_COOKIE_API,
    date: new Date().toISOString(),
    records: orders.length
  });
}

/** Import Smart Direct Ship Divider allocations */
function importDirectShipDivider(reconciler: DataStore, dividerData: Record<string, any>): void {
  const girls = dividerData.girls || [];

  girls.forEach((girl: Record<string, any>) => {
    const girlId = girl.id;
    const cookies = girl.cookies || [];

    // Parse varieties from cookies array
    const { varieties } = parseVarietiesFromAPI(cookies);

    reconciler.allocations.push({
      channel: 'directShip',
      girlId: girlId,
      packages: sumPhysicalPackages(varieties),
      donations: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0,
      varieties: varieties,
      source: 'DirectShipDivider'
    });
  });
}

/** Import Virtual Cookie Share allocations */
function importVirtualCookieShares(reconciler: DataStore, virtualCookieShares: Record<string, any>[]): void {
  virtualCookieShares.forEach((cookieShare: Record<string, any>) => {
    const girls = cookieShare.girls || [];
    const isBoothDivider = !!cookieShare.smart_divider_id;
    const targetMap = isBoothDivider ? reconciler.boothCookieShareAllocations : reconciler.virtualCookieShareAllocations;

    girls.forEach((girl: Record<string, any>) => {
      const girlId = girl.id;
      const quantity = girl.quantity || 0;

      registerScout(reconciler, girlId, girl);

      // Accumulate into appropriate map (manual vs booth divider)
      const current = targetMap.get(girlId) || 0;
      targetMap.set(girlId, current + quantity);
    });
  });
}

/** Import booth reservation data from Smart Cookie reservations API */
function importReservations(
  reconciler: DataStore,
  reservationsData: Record<string, any>,
  dynamicCookieIdMap: Record<number, CookieType> | null
): void {
  const reservations = reservationsData?.reservations || reservationsData || [];
  if (!Array.isArray(reservations) || reservations.length === 0) return;

  reconciler.boothReservations = [];

  reservations.forEach((r) => {
    const booth = r.booth || {};
    const timeslot = r.timeslot || {};
    const { varieties, totalPackages } = parseVarietiesFromAPI(r.cookies, dynamicCookieIdMap);

    reconciler.boothReservations.push({
      id: r.id || r.reservation_id,
      troopId: r.troop_id,
      booth: {
        boothId: booth.booth_id,
        storeName: booth.store_name || '',
        address: booth.address || '',
        reservationType: booth.reservation_type || '',
        isDistributed: booth.is_distributed || false,
        isVirtuallyDistributed: booth.is_virtually_distributed || false
      },
      timeslot: {
        date: timeslot.date || '',
        startTime: timeslot.start_time || '',
        endTime: timeslot.end_time || ''
      },
      cookies: varieties,
      totalPackages: totalPackages,
      trackedCookieShare: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0
    });
  });
}

/**
 * Import booth divider allocations from Smart Booth Divider API
 * Also registers girlId→name mapping from the divider response data
 * so that allocations aren't silently dropped for girls without SC Report data.
 */
function importBoothDividers(
  reconciler: DataStore,
  boothDividers: Record<string, any>[],
  dynamicCookieIdMap: Record<number, CookieType> | null
): void {
  if (!Array.isArray(boothDividers) || boothDividers.length === 0) return;

  // Track seen (reservationId, girlId) pairs to prevent duplicates
  const seen = new Set<string>();

  boothDividers.forEach((entry) => {
    const divider = entry.divider || {};
    const girls = divider.girls || [];
    // Handle both formats: booth can be the nested sub-object or the full reservation
    const rawBooth = entry.booth || {};
    const booth = rawBooth.booth_id ? rawBooth : rawBooth.booth || rawBooth;
    const timeslot = rawBooth.timeslot || entry.timeslot || {};

    girls.forEach((girl: Record<string, any>) => {
      const alloc = parseGirlAllocation(girl, entry.reservationId, seen, reconciler, dynamicCookieIdMap);
      if (!alloc) return;

      reconciler.allocations.push({
        channel: 'booth',
        girlId: alloc.girlId,
        packages: sumPhysicalPackages(alloc.varieties),
        donations: alloc.trackedCookieShare,
        varieties: alloc.varieties,
        source: 'SmartBoothDivider',
        reservationId: entry.reservationId,
        storeName: booth.store_name || booth.booth_name || booth.location || '',
        date: timeslot.date || '',
        startTime: timeslot.start_time || timeslot.startTime || '',
        endTime: timeslot.end_time || timeslot.endTime || '',
        reservationType: booth.reservation_type || booth.type || ''
      });
    });
  });
}

/** Import Direct Ship Divider allocations from Smart Cookie API */
function importDirectShipDividers(
  reconciler: DataStore,
  directShipDividers: Record<string, any>[],
  dynamicCookieIdMap: Record<number, CookieType> | null
): void {
  if (!Array.isArray(directShipDividers) || directShipDividers.length === 0) return;

  // Track seen (orderId, girlId) pairs to prevent duplicates
  const seen = new Set<string>();

  directShipDividers.forEach((entry) => {
    const divider = entry.divider || entry;
    const girls = divider.girls || [];

    girls.forEach((girl: Record<string, any>) => {
      const orderId = entry.orderId || entry.id || '';
      const alloc = parseGirlAllocation(girl, orderId, seen, reconciler, dynamicCookieIdMap);
      if (!alloc) return;

      reconciler.allocations.push({
        channel: 'directShip',
        girlId: alloc.girlId,
        packages: sumPhysicalPackages(alloc.varieties),
        donations: alloc.trackedCookieShare,
        varieties: alloc.varieties,
        source: 'SmartDirectShipDivider',
        orderId: orderId
      });
    });
  });
}

/** Import Smart Cookie data */
function importSmartCookie(reconciler: DataStore, scData: Record<string, any>[]): void {
  scData.forEach((row: Record<string, any>) => {
    const type = row[SC_API_COLUMNS.TYPE] || '';
    const orderNum = String(row[SC_API_COLUMNS.ORDER_NUM] || '');
    const to = row[SC_API_COLUMNS.TO] || '';
    const from = row[SC_API_COLUMNS.FROM] || '';

    const varieties = parseVarietiesFromSCTransfer(row);

    const transferData = {
      date: row[SC_API_COLUMNS.DATE],
      type: type,
      orderNumber: orderNum,
      from: from,
      to: to,
      packages: parseInt(row[SC_API_COLUMNS.TOTAL], 10) || 0,
      varieties: varieties,
      amount: parseFloat(row[SC_API_COLUMNS.TOTAL_AMOUNT]) || 0
    };

    reconciler.transfers.push(createTransfer(transferData));

    // Handle Digital Cookie orders in Smart Cookie (COOKIE_SHARE with D prefix)
    if (type.includes('COOKIE_SHARE') && orderNum.startsWith('D')) {
      mergeDCOrderFromSC(reconciler, orderNum, to, transferData, type, varieties, DATA_SOURCES.SMART_COOKIE, row);
    }

    // Extract troop number from C2T transfers (Council to Troop)
    if (isC2TTransfer(type) && to && !reconciler.troopNumber) {
      reconciler.troopNumber = to;
    }

    // Register scout pickups (T2G - Troop to Girl)
    // Check if transfer is FROM troop TO scout (not troop-to-troop)
    if (type === TRANSFER_TYPE.T2G && reconciler.troopNumber && from === reconciler.troopNumber && to !== reconciler.troopNumber) {
      updateScoutData(reconciler, to, {});
    }

    // Register scout returns (G2T - Girl to Troop)
    if (type === TRANSFER_TYPE.G2T && reconciler.troopNumber && to === reconciler.troopNumber && from !== reconciler.troopNumber) {
      updateScoutData(reconciler, from, {});
    }

    // Register scouts from Cookie Share transfers
    if (type.includes('COOKIE_SHARE') && reconciler.troopNumber && from === reconciler.troopNumber) {
      updateScoutData(reconciler, to, {});
    }
  });

  reconciler.metadata.lastImportSC = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.SMART_COOKIE,
    date: new Date().toISOString(),
    records: scData.length
  });
}

/** Normalize a raw booth location from the API to a BoothLocation */
function normalizeBoothLocation(loc: Record<string, any>): BoothLocation {
  const addr = loc.address || {};

  let availableDates: BoothAvailableDate[] | undefined;
  if (loc.availableDates?.length > 0) {
    availableDates = loc.availableDates.map((d: any) => ({
      date: d.date || '',
      timeSlots: (d.timeSlots || []).map((s: any) => ({
        startTime: s.start_time || s.startTime || '',
        endTime: s.end_time || s.endTime || ''
      }))
    }));
  }

  return {
    id: loc.id || loc.booth_id || 0,
    storeName: loc.store_name || loc.name || '',
    address: {
      street: addr.street || addr.address_1 || '',
      city: addr.city || '',
      state: addr.state || '',
      zip: addr.zip || addr.postal_code || ''
    },
    reservationType: loc.reservation_type || '',
    notes: loc.notes || '',
    availableDates
  };
}

/** Import booth locations from Smart Cookie booths/search API */
function importBoothLocations(reconciler: DataStore, locationsData: Record<string, any>[]): void {
  if (!Array.isArray(locationsData) || locationsData.length === 0) return;
  reconciler.boothLocations = locationsData.map(normalizeBoothLocation);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { importDigitalCookie, importSmartCookieReport, importSmartCookieAPI, importSmartCookie, normalizeBoothLocation };
