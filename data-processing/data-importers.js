// Data Import and Parsing Functions

const { PHYSICAL_COOKIE_TYPES, COOKIE_ID_MAP, COOKIE_COLUMN_MAP, COOKIE_ABBR_MAP } = require('../cookie-constants.js');
const {
  DATA_SOURCES,
  PACKAGES_PER_CASE,
  EXCEL_EPOCH,
  MS_PER_DAY,
  DC_COLUMNS,
  SC_REPORT_COLUMNS,
  SC_API_COLUMNS
} = require('../constants');
const { isC2TTransfer } = require('./utils');

// ============================================================================
// PURE PARSING FUNCTIONS
// ============================================================================

/**
 * Parse cookie varieties from Digital Cookie row
 * @param {Object} row - Digital Cookie export row
 * @returns {Object} Varieties object {cookieType: count}
 */
function parseVarietiesFromDC(row) {
  const varieties = {};
  PHYSICAL_COOKIE_TYPES.forEach(type => {
    const count = parseInt(row[type]) || 0;
    if (count > 0) varieties[type] = count;
  });
  return varieties;
}

/**
 * Parse cookie varieties from Smart Cookie Report row
 * @param {Object} row - Smart Cookie Report row
 * @returns {Object} Object with varieties, totalCases, and totalPackages
 */
function parseVarietiesFromSCReport(row) {
  const varieties = {};
  let totalCases = 0;
  let totalPackages = 0;

  Object.entries(COOKIE_COLUMN_MAP).forEach(([col, name]) => {
    const value = row[col] || '0/0';
    const parts = String(value).split('/');
    const cases = parseInt(parts[0]) || 0;
    const packages = parseInt(parts[1]) || 0;
    const total = (cases * PACKAGES_PER_CASE) + packages;

    if (total > 0) {
      varieties[name] = total;
    }
    totalCases += Math.abs(cases);
    totalPackages += Math.abs(total);
  });

  return { varieties, totalCases, totalPackages };
}

/**
 * Parse cookie varieties from Smart Cookie API cookies array
 * @param {Array<Object>} cookiesArray - Array of cookie objects from API
 * @returns {Object} Object with varieties and totalPackages
 */
function parseVarietiesFromAPI(cookiesArray) {
  const varieties = {};
  let totalPackages = 0;

  (cookiesArray || []).forEach(cookie => {
    const cookieId = cookie.id || cookie.cookieId;
    const cookieName = COOKIE_ID_MAP[cookieId];
    if (cookieName && cookie.quantity !== 0) {
      varieties[cookieName] = Math.abs(cookie.quantity);
      totalPackages += Math.abs(cookie.quantity);
    }
  });

  return { varieties, totalPackages };
}

/**
 * Parse cookie varieties from Smart Cookie transfer row
 * @param {Object} row - Smart Cookie transfer row
 * @returns {Object} Varieties object {cookieType: count}
 */
function parseVarietiesFromSCTransfer(row) {
  const varieties = {};

  Object.entries(COOKIE_ABBR_MAP).forEach(([abbr, name]) => {
    const count = parseInt(row[abbr]) || 0;
    if (count !== 0) varieties[name] = count;
  });

  return varieties;
}

/**
 * Parse Excel date number to ISO string
 * @param {number} excelDate - Excel date serial number
 * @returns {string|null} ISO date string or null
 */
function parseExcelDate(excelDate) {
  if (!excelDate || typeof excelDate !== 'number') return null;
  return new Date(EXCEL_EPOCH.getTime() + excelDate * MS_PER_DAY).toISOString();
}

// ============================================================================
// IMPORT FUNCTIONS
// ============================================================================

/**
 * Update scout aggregated data
 * Supports both numeric fields (additive) and metadata fields (direct set)
 * @param {DataReconciler} reconciler - DataReconciler instance
 * @param {string} scoutName - Scout name
 * @param {Object} updates - Numeric updates to apply (additive)
 * @param {Object} metadata - Metadata fields to set (direct)
 */
function updateScoutData(reconciler, scoutName, updates, metadata = {}) {
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
  Object.keys(updates).forEach(key => {
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
  Object.keys(metadata).forEach(key => {
    if (metadata[key] !== null && metadata[key] !== undefined) {
      scout[key] = metadata[key];
    }
  });

  scout.remaining = scout.pickedUp - scout.soldDC;
}

/**
 * Import Digital Cookie order data from Excel export
 * @param {DataReconciler} reconciler - DataReconciler instance
 * @param {Array<Object>} dcData - Array of order objects from Digital Cookie Excel export
 * @returns {void}
 */
function importDigitalCookie(reconciler, dcData) {
  // Store raw data for unified dataset builder
  reconciler.metadata.rawDCData = dcData;

  dcData.forEach(row => {
    const orderNum = String(row[DC_COLUMNS.ORDER_NUMBER]);
    const scout = `${row[DC_COLUMNS.GIRL_FIRST_NAME] || ''} ${row[DC_COLUMNS.GIRL_LAST_NAME] || ''}`.trim();

    // Parse varieties
    const varieties = parseVarietiesFromDC(row);

    const orderData = {
      orderNumber: orderNum,
      scout: scout,
      date: parseExcelDate(row[DC_COLUMNS.ORDER_DATE]),
      type: row[DC_COLUMNS.ORDER_TYPE],
      packages: (parseInt(row[DC_COLUMNS.TOTAL_PACKAGES]) || 0) -
               (parseInt(row[DC_COLUMNS.REFUNDED_PACKAGES]) || 0),
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

/**
 * Import Smart Cookie Report data (ReportExport.xlsx)
 * @param {DataReconciler} reconciler - DataReconciler instance
 * @param {Array<Object>} reportData - Array of report objects from Smart Cookie Report export
 * @returns {void}
 */
function importSmartCookieReport(reconciler, reportData) {
  reportData.forEach(row => {
    const orderNum = String(row[SC_REPORT_COLUMNS.ORDER_ID] || row[SC_REPORT_COLUMNS.REF_NUMBER]);
    const scout = row[SC_REPORT_COLUMNS.GIRL_NAME] || '';

    // Parse varieties from C1-C13 columns (format: "cases/packages")
    const { varieties, totalCases, totalPackages } = parseVarietiesFromSCReport(row);

    // Parse total (also in "cases/packages" format)
    const totalParts = String(row[SC_REPORT_COLUMNS.TOTAL] || '0/0').split('/');
    const fieldCases = parseInt(totalParts[0]) || 0;
    const fieldPkgs = parseInt(totalParts[1]) || 0;
    const totalFromField = (fieldCases * PACKAGES_PER_CASE) + fieldPkgs || totalPackages;

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
      isVirtual: row[SC_REPORT_COLUMNS.CSHARE_VIRTUAL] === 'TRUE',
      varieties: varieties,
      troopId: row[SC_REPORT_COLUMNS.TROOP_ID],
      serviceUnit: row[SC_REPORT_COLUMNS.SERVICE_UNIT_DESC],
      council: row[SC_REPORT_COLUMNS.COUNCIL_DESC],
      district: row[SC_REPORT_COLUMNS.PARAM_TITLE] ? row[SC_REPORT_COLUMNS.PARAM_TITLE].match(/District = ([^;]+)/)?.[1]?.trim() : null
    };

    // Merge or create order with enrichment
    reconciler.mergeOrCreateOrder(orderNum, orderData, DATA_SOURCES.SMART_COOKIE_REPORT, row, (existing, newData) => {
      existing.scoutId = newData.scoutId;
      existing.gsusaId = newData.gsusaId;
      existing.gradeLevel = newData.gradeLevel;
      existing.includedInIO = newData.includedInIO;
      existing.isVirtual = newData.isVirtual;
      existing.cases = newData.cases;
      existing.organization = {
        troopId: newData.troopId,
        serviceUnit: newData.serviceUnit,
        council: newData.council,
        district: newData.district
      };
    });

    // Update scout data with metadata (updateScoutData now handles metadata directly)
    updateScoutData(reconciler, scout, {
      ordersSCReport: 1,
      scoutId: orderData.scoutId,
      gsusaId: orderData.gsusaId,
      gradeLevel: orderData.gradeLevel,
      serviceUnit: orderData.serviceUnit
    });
  });

  reconciler.metadata.lastImportSCReport = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.SMART_COOKIE_REPORT,
    date: new Date().toISOString(),
    records: reportData.length
  });
}

/**
 * Import Smart Cookie API data from API endpoints
 * @param {DataReconciler} reconciler - DataReconciler instance
 * @param {Object} apiData - Response object containing orders, transfers, and allocations
 * @param {Array<Object>} apiData.orders - Array of order objects from Smart Cookie API
 * @param {Array<Object>} apiData.transfers - Array of transfer objects (T2G, C2T, etc.)
 * @returns {void}
 */
function importSmartCookieAPI(reconciler, apiData) {
  const orders = apiData.orders || [];

  orders.forEach(order => {
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
      status: order.status || '',
      actions: order.actions || {},
      source: DATA_SOURCES.SMART_COOKIE_API
    };

    // Create transfer record
    reconciler.transfers.push(reconciler.createTransfer(transferData));

    // Handle Digital Cookie orders in Smart Cookie (orderNumber starts with D)
    if (orderNum.startsWith('D')) {
      const dcOrderNum = orderNum.substring(1); // Remove 'D' prefix

      // Merge or create order from SC-API
      reconciler.mergeOrCreateOrder(dcOrderNum, {
        orderNumber: dcOrderNum,
        scout: to,
        date: transferData.date,
        type: type,
        packages: Math.abs(transferData.packages),
        amount: Math.abs(transferData.amount),
        status: 'In SC Only',
        varieties: varieties
      }, DATA_SOURCES.SMART_COOKIE_API, order);
    }

    // Track scout pickups (T2G - Troop to Girl)
    if (type === 'T2G' && to !== from) {
      updateScoutData(reconciler, to, {
        pickedUp: Math.abs(transferData.packages)
      });
    }

    // Track Digital Cookie sales in SC (COOKIE_SHARE)
    if (type.includes('COOKIE_SHARE')) {
      updateScoutData(reconciler, to, {
        soldSC: Math.abs(transferData.packages)
      });
    }
  });

  // Process direct ship divider allocations if present
  if (apiData.directShipDivider && apiData.directShipDivider.girls) {
    importDirectShipDivider(reconciler, apiData.directShipDivider);
  }

  // Process virtual cookie share allocations if present
  if (apiData.virtualCookieShares && apiData.virtualCookieShares.length > 0) {
    importVirtualCookieShares(reconciler, apiData.virtualCookieShares);
  }

  reconciler.metadata.lastImportSC = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.SMART_COOKIE_API,
    date: new Date().toISOString(),
    records: orders.length
  });
}

/**
 * Import Smart Direct Ship Divider allocations
 * Shows how troop direct ship orders are allocated to scouts
 * @param {DataReconciler} reconciler - DataReconciler instance
 * @param {Object} dividerData - Direct ship divider data
 * @returns {void}
 */
function importDirectShipDivider(reconciler, dividerData) {
  const girls = dividerData.girls || [];

  girls.forEach(girl => {
    const girlId = girl.id;
    const cookies = girl.cookies || [];

    // Parse varieties from cookies array
    const { varieties, totalPackages } = parseVarietiesFromAPI(cookies);

    // Store direct ship allocation for this girl
    // We'll match girlId to scout name later in the renderer
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

/**
 * Import Virtual Cookie Share allocations
 * Shows manual Cookie Share entries per scout
 * @param {DataReconciler} reconciler - DataReconciler instance
 * @param {Array<Object>} virtualCookieShares - Array of virtual cookie share allocations
 * @returns {void}
 */
function importVirtualCookieShares(reconciler, virtualCookieShares) {
  if (!reconciler.virtualCookieShareAllocations) {
    reconciler.virtualCookieShareAllocations = new Map(); // Key: girlId, Value: total packages
  }

  virtualCookieShares.forEach(cookieShare => {
    const girls = cookieShare.girls || [];

    girls.forEach(girl => {
      const girlId = girl.id;
      const quantity = girl.quantity || 0;
      const scoutName = `${girl.first_name || ''} ${girl.last_name || ''}`.trim();

      // Store scout name by girlId if not already in scouts map
      // This provides the girlId -> name mapping even without Smart Cookie Report data
      if (girlId && scoutName && !reconciler.scouts.has(scoutName)) {
        updateScoutData(reconciler, scoutName, {}, { scoutId: girlId });
      } else if (girlId && scoutName && reconciler.scouts.has(scoutName)) {
        // Update existing scout with girlId if missing
        const scout = reconciler.scouts.get(scoutName);
        if (!scout.scoutId) {
          scout.scoutId = girlId;
        }
      }

      // Accumulate quantities if there are multiple COOKIE_SHARE orders
      const current = reconciler.virtualCookieShareAllocations.get(girlId) || 0;
      reconciler.virtualCookieShareAllocations.set(girlId, current + quantity);
    });
  });
}

/**
 * Import Smart Cookie data
 * @param {DataReconciler} reconciler - DataReconciler instance
 * @param {Array<Object>} scData - Array of Smart Cookie transfer records
 * @returns {void}
 */
function importSmartCookie(reconciler, scData) {
  scData.forEach(row => {
    const type = row[SC_API_COLUMNS.TYPE] || '';
    const orderNum = String(row[SC_API_COLUMNS.ORDER_NUM] || '');
    const to = row[SC_API_COLUMNS.TO] || '';
    const from = row[SC_API_COLUMNS.FROM] || '';

    // Parse varieties
    const varieties = parseVarietiesFromSCTransfer(row);

    const transferData = {
      date: row[SC_API_COLUMNS.DATE],
      type: type,
      orderNumber: orderNum,
      from: from,
      to: to,
      packages: parseInt(row[SC_API_COLUMNS.TOTAL]) || 0,
      varieties: varieties,
      amount: parseFloat(row[SC_API_COLUMNS.TOTAL_AMOUNT]) || 0,
      source: DATA_SOURCES.SMART_COOKIE
    };

    // Create transfer record
    reconciler.transfers.push(reconciler.createTransfer(transferData));

    // Handle Digital Cookie orders in Smart Cookie (COOKIE_SHARE with D prefix)
    if (type.includes('COOKIE_SHARE') && orderNum.startsWith('D')) {
      const dcOrderNum = orderNum.substring(1); // Remove 'D' prefix

      // Merge or create order from SC
      reconciler.mergeOrCreateOrder(dcOrderNum, {
        orderNumber: dcOrderNum,
        scout: to,
        date: transferData.date,
        type: type,
        packages: Math.abs(transferData.packages),
        amount: Math.abs(transferData.amount),
        status: 'In SC Only',
        varieties: varieties
      }, DATA_SOURCES.SMART_COOKIE, row);
    }

    // Extract troop number from C2T transfers (Council to Troop)
    if (isC2TTransfer(type) && to && !reconciler.troopNumber) {
      reconciler.troopNumber = to;
    }

    // Track scout pickups (T2G - Troop to Girl)
    // Check if transfer is FROM troop TO scout (not troop-to-troop)
    if (type === 'T2G' && reconciler.troopNumber && from === reconciler.troopNumber && to !== reconciler.troopNumber) {
      updateScoutData(reconciler, to, {
        pickedUp: Math.abs(transferData.packages)
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

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  importDigitalCookie,
  importSmartCookieReport,
  importSmartCookieAPI,
  importSmartCookie
};
