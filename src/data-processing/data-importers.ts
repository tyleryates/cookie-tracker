// Data Import and Parsing Functions

import {
  DATA_SOURCES,
  DC_COLUMNS,
  EXCEL_EPOCH,
  MS_PER_DAY,
  PACKAGES_PER_CASE,
  SC_API_COLUMNS,
  SC_BOOLEAN,
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
import Logger from '../logger';
import type { BoothAvailableDate, BoothLocation, CookieType, IDataReconciler, Order, Varieties } from '../types';
import { isC2TTransfer } from './utils';

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
function registerScout(reconciler: IDataReconciler, girlId: any, girl: Record<string, any>): void {
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

// ============================================================================
// IMPORT FUNCTIONS
// ============================================================================

/** Update scout aggregated data (additive for numeric, direct set for metadata) */
function updateScoutData(
  reconciler: IDataReconciler,
  scoutName: string,
  updates: Record<string, any>,
  metadata: Record<string, any> = {}
): void {
  // Metadata fields that should be set directly (not added)
  const metadataFields = ['scoutId', 'gsusaId', 'gradeLevel', 'serviceUnit', 'troopId', 'council', 'district'];

  if (!reconciler.scouts.has(scoutName)) {
    reconciler.scouts.set(scoutName, {
      name: scoutName,
      pickedUp: 0,
      soldDC: 0,
      soldSC: 0,
      revenueDC: 0,
      ordersDC: 0,
      ordersSCReport: 0,
      remaining: 0,
      // Metadata fields
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

  // Handle numeric updates (additive)
  Object.keys(updates).forEach((key) => {
    if (metadataFields.includes(key)) {
      // Metadata: set directly if not null
      if (updates[key] !== null && updates[key] !== undefined) {
        scout[key] = updates[key];
      }
    } else {
      // Numeric: add to existing value
      scout[key] = (scout[key] || 0) + updates[key];
    }
  });

  // Handle separate metadata object (for backward compatibility)
  Object.keys(metadata).forEach((key) => {
    if (metadata[key] !== null && metadata[key] !== undefined) {
      scout[key] = metadata[key];
    }
  });

  scout.remaining = scout.pickedUp - scout.soldDC;
}

/** Import Digital Cookie order data from Excel export */
function importDigitalCookie(reconciler: IDataReconciler, dcData: Record<string, any>[]): void {
  reconciler.metadata.rawDCData = dcData;

  dcData.forEach((row: Record<string, any>) => {
    const orderNum = String(row[DC_COLUMNS.ORDER_NUMBER]);
    const scout = `${row[DC_COLUMNS.GIRL_FIRST_NAME] || ''} ${row[DC_COLUMNS.GIRL_LAST_NAME] || ''}`.trim();

    const varieties = parseVarietiesFromDC(row);

    const orderData = {
      orderNumber: orderNum,
      scout: scout,
      date: parseExcelDate(row[DC_COLUMNS.ORDER_DATE]),
      type: row[DC_COLUMNS.ORDER_TYPE],
      packages: (parseInt(row[DC_COLUMNS.TOTAL_PACKAGES], 10) || 0) - (parseInt(row[DC_COLUMNS.REFUNDED_PACKAGES], 10) || 0),
      amount: parseFloat(row[DC_COLUMNS.CURRENT_SALE_AMOUNT]) || 0,
      status: row[DC_COLUMNS.ORDER_STATUS],
      paymentStatus: row[DC_COLUMNS.PAYMENT_STATUS],
      shipStatus: row[DC_COLUMNS.SHIP_STATUS],
      varieties: varieties
    };

    // Merge or create order (DC is source of truth for order details)
    reconciler.mergeOrCreateOrder(orderNum, orderData, DATA_SOURCES.DIGITAL_COOKIE, row);

    // Update scout data
    updateScoutData(reconciler, scout, {
      soldDC: orderData.packages,
      revenueDC: orderData.amount,
      ordersDC: 1
    });
  });

  reconciler.metadata.lastImportDC = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.DIGITAL_COOKIE,
    date: new Date().toISOString(),
    records: dcData.length
  });
}

/** Import Smart Cookie Report data (ReportExport.xlsx) */
function importSmartCookieReport(reconciler: IDataReconciler, reportData: Record<string, any>[]): void {
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
      type: row[SC_REPORT_COLUMNS.ORDER_TYPE_DESC],
      packages: totalFromField,
      cases: totalCases,
      includedInIO: row[SC_REPORT_COLUMNS.INCLUDED_IN_IO],
      isVirtual: row[SC_REPORT_COLUMNS.CSHARE_VIRTUAL] === SC_BOOLEAN.TRUE,
      varieties: varieties,
      organization: {
        troopId: row[SC_REPORT_COLUMNS.TROOP_ID],
        serviceUnit: row[SC_REPORT_COLUMNS.SERVICE_UNIT_DESC],
        council: row[SC_REPORT_COLUMNS.COUNCIL_DESC],
        district: row[SC_REPORT_COLUMNS.PARAM_TITLE] ? row[SC_REPORT_COLUMNS.PARAM_TITLE].match(/District = ([^;]+)/)?.[1]?.trim() : null
      }
    };

    // Merge or create order with enrichment
    reconciler.mergeOrCreateOrder(
      orderNum,
      orderData,
      DATA_SOURCES.SMART_COOKIE_REPORT,
      row,
      (existing: Order, newData: Partial<Order>) => {
        existing.scoutId = newData.scoutId;
        existing.gsusaId = newData.gsusaId;
        existing.gradeLevel = newData.gradeLevel;
        existing.includedInIO = newData.includedInIO;
        existing.isVirtual = newData.isVirtual;
        existing.cases = newData.cases;
        existing.organization = {
          troopId: newData.organization?.troopId,
          serviceUnit: newData.organization?.serviceUnit,
          council: newData.organization?.council,
          district: newData.organization?.district
        };
      }
    );

    // Update scout data with metadata (updateScoutData now handles metadata directly)
    updateScoutData(reconciler, scout, {
      ordersSCReport: 1,
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
function importOptionalData(reconciler: IDataReconciler, apiData: Record<string, any>): void {
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
function importSmartCookieAPI(reconciler: IDataReconciler, apiData: Record<string, any>): void {
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
      actions: order.actions || {},
      source: DATA_SOURCES.SMART_COOKIE_API
    };

    reconciler.transfers.push(reconciler.createTransfer(transferData));

    // Handle Digital Cookie orders in Smart Cookie (orderNumber starts with D)
    if (orderNum.startsWith('D')) {
      const dcOrderNum = orderNum.substring(1); // Remove 'D' prefix

      // Merge or create order from SC-API
      reconciler.mergeOrCreateOrder(
        dcOrderNum,
        {
          orderNumber: dcOrderNum,
          scout: to,
          date: transferData.date,
          type: type,
          packages: Math.abs(transferData.packages),
          amount: Math.abs(transferData.amount),
          status: 'In SC Only',
          varieties: varieties
        },
        DATA_SOURCES.SMART_COOKIE_API,
        order
      );
    }

    // Track scout pickups (T2G - Troop to Girl)
    if (type === TRANSFER_TYPE.T2G && to !== from) {
      updateScoutData(reconciler, to, {
        pickedUp: Math.abs(transferData.packages)
      });
    }

    // Track scout returns (G2T - Girl to Troop) — reduce scout's pickedUp
    if (type === TRANSFER_TYPE.G2T && to !== from) {
      updateScoutData(reconciler, from, {
        pickedUp: -Math.abs(transferData.packages)
      });
    }

    // Track Digital Cookie sales in SC (COOKIE_SHARE)
    if (type.includes('COOKIE_SHARE')) {
      updateScoutData(reconciler, to, {
        soldSC: Math.abs(transferData.packages)
      });
    }
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
function importDirectShipDivider(reconciler: IDataReconciler, dividerData: Record<string, any>): void {
  const girls = dividerData.girls || [];

  girls.forEach((girl: Record<string, any>) => {
    const girlId = girl.id;
    const cookies = girl.cookies || [];

    // Parse varieties from cookies array
    const { varieties, totalPackages } = parseVarietiesFromAPI(cookies);

    const allocation = {
      girlId: girlId,
      packages: totalPackages,
      varieties: varieties,
      source: 'DirectShipDivider'
    };

    // Store in a new array for direct ship allocations
    if (!reconciler.directShipAllocations) {
      reconciler.directShipAllocations = [];
    }
    reconciler.directShipAllocations.push(allocation);
  });
}

/** Import Virtual Cookie Share allocations */
function importVirtualCookieShares(reconciler: IDataReconciler, virtualCookieShares: Record<string, any>[]): void {
  if (!reconciler.virtualCookieShareAllocations) {
    reconciler.virtualCookieShareAllocations = new Map(); // Key: girlId, Value: manual entry packages
  }
  if (!reconciler.boothCookieShareAllocations) {
    reconciler.boothCookieShareAllocations = new Map(); // Key: girlId, Value: booth divider CS packages
  }

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
  reconciler: IDataReconciler,
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
  reconciler: IDataReconciler,
  boothDividers: Record<string, any>[],
  dynamicCookieIdMap: Record<number, CookieType> | null
): void {
  if (!Array.isArray(boothDividers) || boothDividers.length === 0) return;

  reconciler.boothSalesAllocations = [];

  // Track seen (reservationId, girlId) pairs to prevent duplicates
  const seen = new Set();

  boothDividers.forEach((entry) => {
    const divider = entry.divider || {};
    const girls = divider.girls || [];
    // Handle both formats: booth can be the nested sub-object or the full reservation
    const rawBooth = entry.booth || {};
    const booth = rawBooth.booth_id ? rawBooth : rawBooth.booth || rawBooth;
    const timeslot = rawBooth.timeslot || entry.timeslot || {};

    girls.forEach((girl: Record<string, any>) => {
      const girlId = girl.id;
      const { varieties, totalPackages } = parseVarietiesFromAPI(girl.cookies, dynamicCookieIdMap);
      if (totalPackages === 0) return;

      // Deduplicate by (reservationId, girlId)
      const dedupeKey = `${entry.reservationId}-${girlId}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      registerScout(reconciler, girlId, girl);

      reconciler.boothSalesAllocations.push({
        girlId: girlId,
        packages: totalPackages,
        varieties: varieties,
        trackedCookieShare: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0,
        reservationId: entry.reservationId,
        booth: {
          boothId: booth.booth_id || booth.id,
          storeName: booth.store_name || booth.booth_name || booth.location || '',
          address: booth.address || ''
        },
        timeslot: {
          date: timeslot.date || '',
          startTime: timeslot.start_time || timeslot.startTime || '',
          endTime: timeslot.end_time || timeslot.endTime || ''
        },
        reservationType: booth.reservation_type || booth.type || '',
        source: 'SmartBoothDivider'
      });
    });
  });
}

/** Import Direct Ship Divider allocations from Smart Cookie API */
function importDirectShipDividers(
  reconciler: IDataReconciler,
  directShipDividers: Record<string, any>[],
  dynamicCookieIdMap: Record<number, CookieType> | null
): void {
  if (!Array.isArray(directShipDividers) || directShipDividers.length === 0) return;

  reconciler.directShipAllocations = reconciler.directShipAllocations || [];

  // Track seen (orderId, girlId) pairs to prevent duplicates
  const seen = new Set();

  directShipDividers.forEach((entry) => {
    const divider = entry.divider || entry;
    const girls = divider.girls || [];

    girls.forEach((girl: Record<string, any>) => {
      const girlId = girl.id;
      const { varieties, totalPackages } = parseVarietiesFromAPI(girl.cookies, dynamicCookieIdMap);
      if (totalPackages === 0) return;

      // Deduplicate by (orderId, girlId)
      const orderId = entry.orderId || entry.id || '';
      const dedupeKey = `${orderId}-${girlId}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      registerScout(reconciler, girlId, girl);

      reconciler.directShipAllocations.push({
        girlId: girlId,
        packages: totalPackages,
        varieties: varieties,
        trackedCookieShare: varieties[COOKIE_TYPE.COOKIE_SHARE] || 0,
        orderId: orderId,
        source: 'SmartDirectShipDivider'
      });
    });
  });
}

/** Import Smart Cookie data */
function importSmartCookie(reconciler: IDataReconciler, scData: Record<string, any>[]): void {
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
      amount: parseFloat(row[SC_API_COLUMNS.TOTAL_AMOUNT]) || 0,
      source: DATA_SOURCES.SMART_COOKIE
    };

    reconciler.transfers.push(reconciler.createTransfer(transferData));

    // Handle Digital Cookie orders in Smart Cookie (COOKIE_SHARE with D prefix)
    if (type.includes('COOKIE_SHARE') && orderNum.startsWith('D')) {
      const dcOrderNum = orderNum.substring(1); // Remove 'D' prefix

      // Merge or create order from SC
      reconciler.mergeOrCreateOrder(
        dcOrderNum,
        {
          orderNumber: dcOrderNum,
          scout: to,
          date: transferData.date,
          type: type,
          packages: Math.abs(transferData.packages),
          amount: Math.abs(transferData.amount),
          status: 'In SC Only',
          varieties: varieties
        },
        DATA_SOURCES.SMART_COOKIE,
        row
      );
    }

    // Extract troop number from C2T transfers (Council to Troop)
    if (isC2TTransfer(type) && to && !reconciler.troopNumber) {
      reconciler.troopNumber = to;
    }

    // Track scout pickups (T2G - Troop to Girl)
    // Check if transfer is FROM troop TO scout (not troop-to-troop)
    if (type === TRANSFER_TYPE.T2G && reconciler.troopNumber && from === reconciler.troopNumber && to !== reconciler.troopNumber) {
      updateScoutData(reconciler, to, {
        pickedUp: Math.abs(transferData.packages)
      });
    }

    // Track scout returns (G2T - Girl to Troop) — reduce scout's pickedUp
    if (type === TRANSFER_TYPE.G2T && reconciler.troopNumber && to === reconciler.troopNumber && from !== reconciler.troopNumber) {
      updateScoutData(reconciler, from, {
        pickedUp: -Math.abs(transferData.packages)
      });
    }

    // Track Digital Cookie sales in SC
    if (type.includes('COOKIE_SHARE') && reconciler.troopNumber && from === reconciler.troopNumber) {
      updateScoutData(reconciler, to, {
        soldSC: Math.abs(transferData.packages)
      });
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
function importBoothLocations(reconciler: IDataReconciler, locationsData: Record<string, any>[]): void {
  if (!Array.isArray(locationsData) || locationsData.length === 0) return;
  reconciler.boothLocations = locationsData.map(normalizeBoothLocation);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { importDigitalCookie, importSmartCookieReport, importSmartCookieAPI, importSmartCookie, normalizeBoothLocation };
