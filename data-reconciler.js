// Data Reconciliation System
// Standardizes and merges data from Digital Cookie and Smart Cookie

const { PHYSICAL_COOKIE_TYPES, COOKIE_ID_MAP, COOKIE_COLUMN_MAP, COOKIE_ABBR_MAP } = require('./cookie-constants.js');
const {
  PACKAGES_PER_CASE,
  EXCEL_EPOCH,
  MS_PER_DAY,
  ORDER_TYPES,
  DC_COLUMNS,
  SC_REPORT_COLUMNS,
  SC_API_COLUMNS
} = require('./constants');
const Logger = require('./logger');

const {
  parseVarietiesFromDC,
  parseVarietiesFromSCReport,
  parseVarietiesFromAPI,
  parseVarietiesFromSCTransfer,
  parseExcelDate,
  importDigitalCookie,
  importSmartCookieReport,
  importSmartCookieAPI,
  importDirectShipDivider,
  importVirtualCookieShares,
  importSmartCookie,
  updateScoutData
} = require('./data-processing/data-importers.js');

const {
  buildUnifiedDataset
} = require('./data-processing/data-calculators.js');

// Data source identifiers
const DATA_SOURCES = {
  DIGITAL_COOKIE: 'DC',
  SMART_COOKIE: 'SC',
  SMART_COOKIE_REPORT: 'SC-Report',
  SMART_COOKIE_API: 'SC-API',
  DIRECT_SHIP_DIVIDER: 'DirectShipDivider'
};

/**
 * DataReconciler - Merges and standardizes data from multiple sources
 *
 * IMPORTANT CONVENTION: Properties prefixed with $ are calculated/derived fields
 * - These are computed from raw imported data during buildUnifiedDataset()
 * - Examples: $varietyBreakdowns, $issues, $cookieShare
 * - Do not import these directly - they are rebuilt on each reconciliation
 * - This convention helps distinguish between source data and computed values
 */
class DataReconciler {
  constructor() {
    this.orders = new Map(); // Key: order number
    this.transfers = [];
    this.scouts = new Map(); // Key: scout name
    this.troopNumber = null; // Extracted from C2T transfers dynamically
    this.metadata = {
      lastImportDC: null,
      lastImportSC: null,
      sources: []
    };
  }

  // Standardized Order format
  createOrder(data, source) {
    return {
      id: data.orderNumber || `${source}-${Date.now()}`,
      orderNumber: data.orderNumber,
      scout: data.scout,
      scoutId: data.scoutId || null,
      gsusaId: data.gsusaId || null,
      gradeLevel: data.gradeLevel || null,
      date: data.date,
      type: data.type,
      packages: data.packages,
      cases: data.cases || 0,
      amount: data.amount,
      status: data.status,
      paymentStatus: data.paymentStatus,
      shipStatus: data.shipStatus,
      includedInIO: data.includedInIO || null,
      isVirtual: data.isVirtual || null,
      varieties: data.varieties || {}, // {cookieType: count}
      organization: {
        troopId: data.troopId || null,
        serviceUnit: data.serviceUnit || null,
        council: data.council || null,
        district: data.district || null
      },
      sources: [source], // ['DC', 'SC', 'SC-Report', 'SC-API']
      metadata: {
        dc: null,
        sc: null,
        scReport: null,
        scApi: null
      }
    };
  }

  // Standardized Transfer format
  createTransfer(data) {
    return {
      id: `${data.type}-${data.date}-${data.orderNumber}`,
      date: data.date,
      type: data.type, // C2T, T2G, COOKIE_SHARE, DIRECT_SHIP
      orderNumber: data.orderNumber,
      from: data.from,
      to: data.to,
      packages: data.packages, // Total
      cases: data.cases || 0, // Cases (for C2T pickups, 12 packages per case)
      varieties: data.varieties, // {cookieType: count}
      amount: data.amount,
      virtualBooth: data.virtualBooth || false,
      status: data.status || '',
      actions: data.actions || {},
      source: data.source
    };
  }

  // Helper to merge or create order (eliminates duplication across import methods)
  mergeOrCreateOrder(orderNum, orderData, source, rawData, enrichmentFn) {
    const metadataKey = this.getMetadataKey(source);

    if (this.orders.has(orderNum)) {
      const existing = this.orders.get(orderNum);

      // Add source if not already present
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
      }

      // Store raw metadata
      existing.metadata[metadataKey] = rawData;

      // Apply enrichment function if provided, otherwise merge all fields
      if (enrichmentFn) {
        enrichmentFn(existing, orderData);
      } else {
        Object.assign(existing, orderData);
      }

      return existing;
    } else {
      const order = this.createOrder(orderData, source);
      order.metadata[metadataKey] = rawData;
      this.orders.set(orderNum, order);
      return order;
    }
  }

  // Get metadata key for source
  getMetadataKey(source) {
    const keyMap = {
      [DATA_SOURCES.DIGITAL_COOKIE]: 'dc',
      [DATA_SOURCES.SMART_COOKIE]: 'sc',
      [DATA_SOURCES.SMART_COOKIE_REPORT]: 'scReport',
      [DATA_SOURCES.SMART_COOKIE_API]: 'scApi'
    };
    return keyMap[source] || source.toLowerCase();
  }

  // Delegation wrappers for variety parsing
  parseVarietiesFromDC(row) {
    return parseVarietiesFromDC(row);
  }

  parseVarietiesFromSCReport(row) {
    return parseVarietiesFromSCReport(row);
  }

  parseVarietiesFromAPI(cookiesArray) {
    return parseVarietiesFromAPI(cookiesArray);
  }

  parseVarietiesFromSCTransfer(row) {
    return parseVarietiesFromSCTransfer(row);
  }

  parseExcelDate(excelDate) {
    return parseExcelDate(excelDate);
  }

  // Delegation wrappers for import methods
  importDigitalCookie(dcData) {
    return importDigitalCookie(this, dcData);
  }

  importSmartCookieReport(reportData) {
    return importSmartCookieReport(this, reportData);
  }

  importSmartCookieAPI(apiData) {
    return importSmartCookieAPI(this, apiData);
  }

  importDirectShipDivider(dividerData) {
    return importDirectShipDivider(this, dividerData);
  }

  importVirtualCookieShares(virtualCookieShares) {
    return importVirtualCookieShares(this, virtualCookieShares);
  }

  importSmartCookie(scData) {
    return importSmartCookie(this, scData);
  }

  updateScoutData(scoutName, updates, metadata) {
    return updateScoutData(this, scoutName, updates, metadata);
  }

  // Delegation wrapper for unified dataset builder
  buildUnifiedDataset() {
    this.unified = buildUnifiedDataset(this);
    return this.unified;
  }

  // Get reconciled data
  getData() {
    return {
      orders: Array.from(this.orders.values()),
      transfers: this.transfers,
      scouts: Array.from(this.scouts.values()),
      metadata: this.metadata
    };
  }

  // Get summary statistics
  getSummary() {
    const orders = Array.from(this.orders.values());
    const hasDC = o => o.sources.includes('DC');
    const hasSC = o => o.sources.includes('SC');
    const hasSCReport = o => o.sources.includes('SC-Report');
    const hasSCAPI = o => o.sources.includes('SC-API');

    return {
      totalOrders: orders.length,
      ordersInBoth: orders.filter(o => hasDC(o) && (hasSC(o) || hasSCReport(o) || hasSCAPI(o))).length,
      ordersOnlyDC: orders.filter(o => hasDC(o) && !hasSC(o) && !hasSCReport(o) && !hasSCAPI(o)).length,
      ordersOnlySC: orders.filter(o => !hasDC(o) && (hasSC(o) || hasSCReport(o) || hasSCAPI(o))).length,
      ordersWithMetadata: orders.filter(o => o.scoutId || o.gsusaId).length,
      totalTransfers: this.transfers.length,
      totalScouts: this.scouts.size,
      totalPackages: orders.reduce((sum, o) => sum + o.packages, 0),
      totalRevenue: orders.reduce((sum, o) => sum + o.amount, 0),
      sources: {
        dc: orders.filter(hasDC).length,
        sc: orders.filter(hasSC).length,
        scReport: orders.filter(hasSCReport).length,
        scApi: orders.filter(hasSCAPI).length
      }
    };
  }

  // Load from saved data
  loadFromJSON(data) {
    this.orders = new Map(data.orders.map(o => [o.orderNumber, o]));
    this.transfers = data.transfers || [];
    this.scouts = new Map(data.scouts.map(s => [s.name, s]));
    this.metadata = data.metadata || this.metadata;
  }

  // Export to JSON
  toJSON() {
    return JSON.stringify(this.getData(), null, 2);
  }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataReconciler;
}
