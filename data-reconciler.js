// Data Reconciliation System
// Standardizes and merges data from Digital Cookie and Smart Cookie

const { DATA_SOURCES } = require('./constants');
const {
  importDigitalCookie,
  importSmartCookieReport,
  importSmartCookieAPI,
  importSmartCookie
} = require('./data-processing/data-importers.js');
const {
  buildUnifiedDataset
} = require('./data-processing/data-calculators.js');

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
      sources: [],
      warnings: []
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
      sources: [source], // Uses DATA_SOURCES values from constants.js
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

  importSmartCookie(scData) {
    return importSmartCookie(this, scData);
  }

  // Delegation wrapper for unified dataset builder
  buildUnifiedDataset() {
    this.unified = buildUnifiedDataset(this);
    return this.unified;
  }

}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataReconciler;
}
