// Data Reconciliation System
// Standardizes and merges data from Digital Cookie and Smart Cookie

const { PHYSICAL_COOKIE_TYPES, COOKIE_ID_MAP, COOKIE_COLUMN_MAP, COOKIE_ABBR_MAP } = require('./cookie-constants.js');

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
      'DC': 'dc',
      'SC': 'sc',
      'SC-Report': 'scReport',
      'SC-API': 'scApi'
    };
    return keyMap[source] || source.toLowerCase();
  }

  // Variety parsing helpers
  parseVarietiesFromDC(row) {
    const varieties = {};
    PHYSICAL_COOKIE_TYPES.forEach(type => {
      const count = parseInt(row[type]) || 0;
      if (count > 0) varieties[type] = count;
    });
    return varieties;
  }

  parseVarietiesFromSCReport(row) {
    const varieties = {};
    let totalCases = 0;
    let totalPackages = 0;

    Object.entries(COOKIE_COLUMN_MAP).forEach(([col, name]) => {
      const value = row[col] || '0/0';
      const parts = String(value).split('/');
      const cases = parseInt(parts[0]) || 0;
      const packages = parseInt(parts[1]) || 0;

      if (packages > 0) {
        varieties[name] = packages;
      }
      totalCases += Math.abs(cases);
      totalPackages += Math.abs(packages);
    });

    return { varieties, totalCases, totalPackages };
  }

  parseVarietiesFromAPI(cookiesArray) {
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

  parseVarietiesFromSCTransfer(row) {
    const varieties = {};

    Object.entries(COOKIE_ABBR_MAP).forEach(([abbr, name]) => {
      const count = parseInt(row[abbr]) || 0;
      if (count !== 0) varieties[name] = count;
    });

    return varieties;
  }

  // Import Digital Cookie data
  importDigitalCookie(dcData) {
    dcData.forEach(row => {
      const orderNum = String(row['Order Number']);
      const scout = `${row['Girl First Name'] || ''} ${row['Girl Last Name'] || ''}`.trim();

      // Parse varieties
      const varieties = this.parseVarietiesFromDC(row);

      const orderData = {
        orderNumber: orderNum,
        scout: scout,
        date: this.parseExcelDate(row['Order Date (Central Time)']),
        type: row['Order Type'],
        packages: (parseInt(row['Total Packages (Includes Donate & Gift)']) || 0) -
                 (parseInt(row['Refunded Packages']) || 0),
        amount: parseFloat(row['Current Sale Amount']) || 0,
        status: row['Order Status'],
        paymentStatus: row['Payment Status'],
        shipStatus: row['Ship Status'],
        varieties: varieties
      };

      // Merge or create order (DC is source of truth for order details)
      this.mergeOrCreateOrder(orderNum, orderData, 'DC', row);

      // Update scout data
      this.updateScoutData(scout, {
        soldDC: orderData.packages,
        revenueDC: orderData.amount,
        ordersDC: 1
      });
    });

    this.metadata.lastImportDC = new Date().toISOString();
    this.metadata.sources.push({
      type: 'DC',
      date: new Date().toISOString(),
      records: dcData.length
    });
  }

  // Import Smart Cookie Report (ReportExport.xlsx)
  importSmartCookieReport(reportData) {
    reportData.forEach(row => {
      const orderNum = String(row['OrderID'] || row['RefNumber']);
      const scout = row['GirlName'] || '';

      // Parse varieties from C1-C13 columns (format: "cases/packages")
      const { varieties, totalCases, totalPackages } = this.parseVarietiesFromSCReport(row);

      // Parse total (also in "cases/packages" format)
      const totalParts = String(row['Total'] || '0/0').split('/');
      const totalFromField = parseInt(totalParts[1]) || totalPackages;

      const orderData = {
        orderNumber: orderNum,
        scout: scout,
        scoutId: row['GirlID'],
        gsusaId: row['GSUSAID'],
        gradeLevel: row['GradeLevel'],
        date: row['OrderDate'],
        type: row['OrderTypeDesc'],
        packages: totalFromField,
        cases: totalCases,
        includedInIO: row['IncludedInIO'],
        isVirtual: row['CShareVirtual'] === 'TRUE',
        varieties: varieties,
        troopId: row['TroopID'],
        serviceUnit: row['ServiceUnitDesc'],
        council: row['CouncilDesc'],
        district: row['ParamTitle'] ? row['ParamTitle'].match(/District = ([^;]+)/)?.[1]?.trim() : null
      };

      // Merge or create order with enrichment
      this.mergeOrCreateOrder(orderNum, orderData, 'SC-Report', row, (existing, newData) => {
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
      this.updateScoutData(scout, {
        ordersSCReport: 1,
        scoutId: orderData.scoutId,
        gsusaId: orderData.gsusaId,
        gradeLevel: orderData.gradeLevel,
        serviceUnit: orderData.serviceUnit
      });
    });

    this.metadata.lastImportSCReport = new Date().toISOString();
    this.metadata.sources.push({
      type: 'SC-Report',
      date: new Date().toISOString(),
      records: reportData.length
    });
  }

  // Import Smart Cookie API data (JSON format from API)
  importSmartCookieAPI(apiData) {
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
      const { varieties, totalPackages } = this.parseVarietiesFromAPI(order.cookies);

      const transferData = {
        date: order.date || order.createdDate,
        type: type,
        orderNumber: orderNum,
        from: from,
        to: to,
        packages: totalPackages,
        cases: Math.round(Math.abs(order.total_cases || 0) / 12), // Convert packages to cases (12 packages per case)
        varieties: varieties,
        amount: Math.abs(parseFloat(order.total || order.totalPrice) || 0),
        virtualBooth: order.virtual_booth || false,
        status: order.status || '',
        actions: order.actions || {},
        source: 'SC-API'
      };

      // Create transfer record
      this.transfers.push(this.createTransfer(transferData));

      // Handle Digital Cookie orders in Smart Cookie (orderNumber starts with D)
      if (orderNum.startsWith('D')) {
        const dcOrderNum = orderNum.substring(1); // Remove 'D' prefix

        // Merge or create order from SC-API
        this.mergeOrCreateOrder(dcOrderNum, {
          orderNumber: dcOrderNum,
          scout: to,
          date: transferData.date,
          type: type,
          packages: Math.abs(transferData.packages),
          amount: Math.abs(transferData.amount),
          status: 'In SC Only',
          varieties: varieties
        }, 'SC-API', order);
      }

      // Track scout pickups (T2G - Troop to Girl)
      if (type === 'T2G' && to !== from) {
        this.updateScoutData(to, {
          pickedUp: Math.abs(transferData.packages)
        });
      }

      // Track Digital Cookie sales in SC (COOKIE_SHARE)
      if (type.includes('COOKIE_SHARE')) {
        this.updateScoutData(to, {
          soldSC: Math.abs(transferData.packages)
        });
      }
    });

    this.metadata.lastImportSC = new Date().toISOString();
    this.metadata.sources.push({
      type: 'SC-API',
      date: new Date().toISOString(),
      records: orders.length
    });
  }

  // Import Smart Cookie data
  importSmartCookie(scData) {
    scData.forEach(row => {
      const type = row['TYPE'] || '';
      const orderNum = String(row['ORDER #'] || '');
      const to = row['TO'] || '';
      const from = row['FROM'] || '';

      // Parse varieties
      const varieties = this.parseVarietiesFromSCTransfer(row);

      const transferData = {
        date: row['DATE'],
        type: type,
        orderNumber: orderNum,
        from: from,
        to: to,
        packages: parseInt(row['TOTAL']) || 0,
        varieties: varieties,
        amount: parseFloat(row['TOTAL $']) || 0,
        source: 'SC'
      };

      // Create transfer record
      this.transfers.push(this.createTransfer(transferData));

      // Handle Digital Cookie orders in Smart Cookie (COOKIE_SHARE with D prefix)
      if (type.includes('COOKIE_SHARE') && orderNum.startsWith('D')) {
        const dcOrderNum = orderNum.substring(1); // Remove 'D' prefix

        // Merge or create order from SC
        this.mergeOrCreateOrder(dcOrderNum, {
          orderNumber: dcOrderNum,
          scout: to,
          date: transferData.date,
          type: type,
          packages: Math.abs(transferData.packages),
          amount: Math.abs(transferData.amount),
          status: 'In SC Only',
          varieties: varieties
        }, 'SC', row);
      }

      // Extract troop number from C2T transfers (Council to Troop)
      if ((type === 'C2T' || type === 'C2T(P)' || type.startsWith('C2T')) && to && !this.troopNumber) {
        this.troopNumber = to;
      }

      // Track scout pickups (T2G - Troop to Girl)
      // Check if transfer is FROM troop TO scout (not troop-to-troop)
      if (type === 'T2G' && this.troopNumber && from === this.troopNumber && to !== this.troopNumber) {
        this.updateScoutData(to, {
          pickedUp: Math.abs(transferData.packages)
        });
      }

      // Track Digital Cookie sales in SC
      if (type.includes('COOKIE_SHARE') && this.troopNumber && from === this.troopNumber) {
        this.updateScoutData(to, {
          soldSC: Math.abs(transferData.packages)
        });
      }
    });

    this.metadata.lastImportSC = new Date().toISOString();
    this.metadata.sources.push({
      type: 'SC',
      date: new Date().toISOString(),
      records: scData.length
    });
  }

  // Update scout aggregated data
  // Supports both numeric fields (additive) and metadata fields (direct set)
  updateScoutData(scoutName, updates, metadata = {}) {
    // Metadata fields that should be set directly (not added)
    const metadataFields = ['scoutId', 'gsusaId', 'gradeLevel', 'serviceUnit', 'troopId', 'council', 'district'];

    if (!this.scouts.has(scoutName)) {
      this.scouts.set(scoutName, {
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

    const scout = this.scouts.get(scoutName);

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

  // Utility: Parse Excel date
  parseExcelDate(excelDate) {
    if (!excelDate || typeof excelDate !== 'number') return null;
    const msPerDay = 24 * 60 * 60 * 1000;
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + excelDate * msPerDay).toISOString();
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
