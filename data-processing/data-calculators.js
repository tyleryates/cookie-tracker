// Data Calculation Functions
// All calculation and building functions extracted from DataReconciler
// These are pure functions that accept reconciler state as parameters

const { PHYSICAL_COOKIE_TYPES, COOKIE_ID_MAP, COOKIE_COLUMN_MAP, COOKIE_ABBR_MAP } = require('../cookie-constants.js');
const {
  PACKAGES_PER_CASE,
  EXCEL_EPOCH,
  MS_PER_DAY,
  ORDER_TYPES,
  DC_COLUMNS,
  SC_REPORT_COLUMNS,
  SC_API_COLUMNS
} = require('../constants');
const { isC2TTransfer } = require('./utils');

// Data source identifiers
const DATA_SOURCES = {
  DIGITAL_COOKIE: 'DC',
  SMART_COOKIE: 'SC',
  SMART_COOKIE_REPORT: 'SC-Report',
  SMART_COOKIE_API: 'SC-API',
  DIRECT_SHIP_DIVIDER: 'DirectShipDivider'
};

// ============================================================================
// UNIFIED DATASET BUILDER
// ============================================================================
// Builds a normalized, cleaned, and joined dataset after imports complete
// Reports should use this unified data instead of querying raw sources

/**
 * Build unified dataset from all imported data sources
 * Call this after all imports (DC, SC, allocations) are complete
 * Aggregates data into scout-level and troop-level summaries with calculated fields
 * @param {Object} reconciler - DataReconciler instance with all imported data
 * @returns {Object} Unified dataset with scouts Map, siteOrders, troopTotals, and varieties
 */
function buildUnifiedDataset(reconciler) {
  // Build scout and site order datasets first
  const scouts = buildScoutDataset(reconciler);
  const siteOrders = buildSiteOrdersDataset(reconciler);

  // Build troop-level aggregates
  const unified = {
    scouts: scouts,
    siteOrders: siteOrders,
    troopTotals: buildTroopTotals(reconciler, scouts, siteOrders),
    transferBreakdowns: buildTransferBreakdowns(reconciler),
    varieties: buildVarieties(reconciler, scouts),
    cookieShare: buildCookieShareTracking(reconciler),
    metadata: buildUnifiedMetadata(reconciler)
  };

  return unified;
}

/**
 * Build complete scout dataset with all data joined and classified
 * @param {Object} reconciler - DataReconciler instance
 * @returns {Map} Scout dataset with all calculated fields
 */
function buildScoutDataset(reconciler) {
  const scoutDataset = new Map();
  const rawDCData = reconciler.metadata.rawDCData || [];

  // Phase 1: Initialize all scouts from all sources
  initializeScouts(reconciler, scoutDataset, rawDCData);

  // Phase 2: Add and classify orders from Digital Cookie
  addDCOrders(scoutDataset, rawDCData);

  // Phase 3: Add inventory from Smart Cookie T2G transfers
  addInventory(reconciler, scoutDataset);

  // Phase 4: Add allocations (booth, direct ship)
  addAllocations(reconciler, scoutDataset);

  // Phase 5: Calculate all totals and derived values
  calculateScoutTotals(scoutDataset);

  return scoutDataset;
}

/**
 * Initialize scout objects from all sources
 * @param {Object} reconciler - DataReconciler instance
 * @param {Map} scoutDataset - Scout dataset to populate
 * @param {Array} rawDCData - Raw Digital Cookie data
 */
function initializeScouts(reconciler, scoutDataset, rawDCData) {
  // From Digital Cookie orders
  rawDCData.forEach(row => {
    const firstName = row[DC_COLUMNS.GIRL_FIRST_NAME] || '';
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    const name = `${firstName} ${lastName}`.trim();

    if (!scoutDataset.has(name)) {
      const isSiteOrder = lastName === 'Site';
      scoutDataset.set(name, {
        // Identity
        name: name,
        firstName: firstName,
        lastName: lastName,
        girlId: null, // Will be filled from SC data
        isSiteOrder: isSiteOrder,

        // Orders (classified)
        orders: [],

        // Inventory
        inventory: {
          total: 0,
          varieties: {}
        },

        // Allocations
        credited: {
          booth: {
            packages: 0,
            varieties: {}
          },
          directShip: {
            packages: 0,
            varieties: {}
          }
        },

        // Totals (calculated in Phase 5)
        totals: {
          orders: 0,
          sales: 0,           // Physical packages for girl delivery
          shipped: 0,         // Scout's own direct ship orders
          credited: 0,        // Booth + direct ship allocations
          donations: 0,       // Cookie Share
          totalSold: 0,       // All packages sold
          inventory: 0,       // Net inventory
          revenue: 0
        }
      });
    }
  });

  // Add scouts from Smart Cookie data (may have scouts without DC orders)
  reconciler.scouts.forEach((scoutData, scoutName) => {
    if (!scoutDataset.has(scoutName)) {
      const nameParts = scoutName.split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const firstName = nameParts.slice(0, -1).join(' ');

      scoutDataset.set(scoutName, {
        name: scoutName,
        firstName: firstName,
        lastName: lastName,
        girlId: scoutData.scoutId || null,
        isSiteOrder: false,
        orders: [],
        inventory: { total: 0, varieties: {} },
        credited: {
          booth: { packages: 0, varieties: {} },
          directShip: { packages: 0, varieties: {} }
        },
        totals: {
          orders: 0,
          sales: 0,
          shipped: 0,
          credited: 0,
          donations: 0,
          totalSold: 0,
          inventory: 0,
          revenue: 0
        }
      });
    } else {
      // Update girlId if we have it from SC
      const scout = scoutDataset.get(scoutName);
      if (scoutData.scoutId && !scout.girlId) {
        scout.girlId = scoutData.scoutId;
      }
    }
  });
}

/**
 * Classify order type based on business rules (see SALES-TYPES.md)
 * @param {boolean} isSiteOrder - Whether order is a site order
 * @param {boolean} isShipped - Whether order is shipped
 * @param {boolean} isDonationOnly - Whether order is donation only
 * @returns {string} Classified order type
 */
function classifyOrderType(isSiteOrder, isShipped, isDonationOnly) {
  if (isDonationOnly) return ORDER_TYPES.DONATION_ONLY;
  if (isSiteOrder) {
    return isShipped ? ORDER_TYPES.TROOP_DIRECT_SHIP : ORDER_TYPES.TROOP_GIRL_DELIVERY;
  }
  return isShipped ? ORDER_TYPES.GIRL_DIRECT_SHIP : ORDER_TYPES.GIRL_DELIVERY;
}

/**
 * Add and classify orders from Digital Cookie
 * @param {Map} scoutDataset - Scout dataset to populate
 * @param {Array} rawDCData - Raw Digital Cookie data
 */
function addDCOrders(scoutDataset, rawDCData) {
  rawDCData.forEach(row => {
    const firstName = row[DC_COLUMNS.GIRL_FIRST_NAME] || '';
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    const name = `${firstName} ${lastName}`.trim();
    const scout = scoutDataset.get(name);
    if (!scout) return;

    const orderType = row[DC_COLUMNS.ORDER_TYPE] || '';
    const totalPkgs = parseInt(row[DC_COLUMNS.TOTAL_PACKAGES]) || 0;
    const refundedPkgs = parseInt(row[DC_COLUMNS.REFUNDED_PACKAGES]) || 0;
    const packages = totalPkgs - refundedPkgs;
    const donations = parseInt(row[DC_COLUMNS.DONATION]) || 0;
    const physicalPackages = packages - donations;
    const amountStr = row[DC_COLUMNS.CURRENT_SALE_AMOUNT] || '0';
    const amount = parseFloat(String(amountStr).replace(/[$,]/g, '')) || 0;

    // Parse varieties
    const varieties = {};
    PHYSICAL_COOKIE_TYPES.forEach(type => {
      const count = parseInt(row[type]) || 0;
      if (count > 0) {
        varieties[type] = count;
      }
    });
    if (donations > 0) {
      varieties['Cookie Share'] = donations;
    }

    // Classify order type (see SALES-TYPES.md)
    const isSiteOrder = lastName === 'Site';
    const isShipped = orderType.includes('Shipped') || orderType.includes('shipped');
    const isDonationOnly = orderType === 'Donation';
    const classifiedType = classifyOrderType(isSiteOrder, isShipped, isDonationOnly);

    // Create order object
    const order = {
      orderNumber: row[DC_COLUMNS.ORDER_NUMBER],
      date: row[DC_COLUMNS.ORDER_DATE],
      type: classifiedType,
      orderType: orderType, // Original DC order type
      packages: packages,
      physicalPackages: physicalPackages,
      donations: donations,
      varieties: varieties,
      amount: amount,
      status: row[DC_COLUMNS.ORDER_STATUS],
      paymentStatus: row[DC_COLUMNS.PAYMENT_STATUS] || '',
      needsInventory: !isShipped && !isDonationOnly && !isSiteOrder,
      source: DATA_SOURCES.DIGITAL_COOKIE
    };

    scout.orders.push(order);
  });
}

/**
 * Add inventory from Smart Cookie T2G transfers
 * @param {Object} reconciler - DataReconciler instance
 * @param {Map} scoutDataset - Scout dataset to populate
 */
function addInventory(reconciler, scoutDataset) {
  reconciler.transfers.forEach(transfer => {
    if (transfer.type !== 'T2G') return;

    const scoutName = transfer.to;
    const scout = scoutDataset.get(scoutName);
    if (!scout) return;

    // Exclude virtual items from physical inventory
    const isVirtualBooth = transfer.virtualBooth || false;
    if (isVirtualBooth) return; // Virtual booth is handled in allocations

    const cookieShareCount = transfer.varieties?.['Cookie Share'] || 0;
    const physicalPackages = (transfer.packages || 0) - cookieShareCount;

    scout.inventory.total += physicalPackages;

    // Add varieties (exclude Cookie Share)
    if (transfer.varieties) {
      Object.entries(transfer.varieties).forEach(([variety, count]) => {
        if (variety !== 'Cookie Share') {
          scout.inventory.varieties[variety] =
            (scout.inventory.varieties[variety] || 0) + count;
        }
      });
    }
  });
}

/**
 * Add allocations (booth and direct ship)
 * @param {Object} reconciler - DataReconciler instance
 * @param {Map} scoutDataset - Scout dataset to populate
 */
function addAllocations(reconciler, scoutDataset) {
  // Virtual Booth allocations (Type 4: Troop girl delivery)
  reconciler.transfers.forEach(transfer => {
    if (transfer.type === 'T2G' && transfer.virtualBooth) {
      const scoutName = transfer.to;
      const scout = scoutDataset.get(scoutName);
      if (!scout) return;

      scout.credited.booth.packages += transfer.packages || 0;

      if (transfer.varieties) {
        Object.entries(transfer.varieties).forEach(([variety, count]) => {
          scout.credited.booth.varieties[variety] =
            (scout.credited.booth.varieties[variety] || 0) + count;
        });
      }
    }
  });

  // Direct Ship allocations (Type 3: Troop direct ship)
  if (reconciler.directShipAllocations) {
    // Build girlId to name mapping
    const girlIdToName = new Map();
    scoutDataset.forEach(scout => {
      if (scout.girlId) {
        girlIdToName.set(scout.girlId, scout.name);
      }
    });

    reconciler.directShipAllocations.forEach(allocation => {
      const scoutName = girlIdToName.get(allocation.girlId);
      const scout = scoutDataset.get(scoutName);
      if (!scout) return;

      scout.credited.directShip.packages += allocation.packages || 0;

      if (allocation.varieties) {
        Object.entries(allocation.varieties).forEach(([variety, count]) => {
          scout.credited.directShip.varieties[variety] =
            (scout.credited.directShip.varieties[variety] || 0) + count;
        });
      }
    });
  }
}

/**
 * Calculate variety-level totals from orders (sales, shipped, donations, revenue)
 * @param {Object} scout - Scout object to calculate variety totals for
 */
function calculateVarietyTotals(scout) {
  // Count orders
  scout.totals.orders = scout.orders.length;

  // Initialize variety breakdowns ($ = calculated/derived)
  scout.$varietyBreakdowns = {
    fromSales: {},      // GIRL_DELIVERY orders
    fromShipped: {},    // GIRL_DIRECT_SHIP orders
    fromBooth: {},      // Booth allocations
    fromDirectShip: {}  // Direct ship allocations
  };

  // Sum packages by type and build variety breakdowns
  scout.orders.forEach(order => {
    const type = order.type;

    if (type === ORDER_TYPES.GIRL_DELIVERY) {
      // Type 2 & 5: Physical packages for girl delivery
      scout.totals.sales += order.physicalPackages;

      // Track varieties from sales
      Object.entries(order.varieties).forEach(([variety, count]) => {
        if (variety !== 'Cookie Share') {
          scout.$varietyBreakdowns.fromSales[variety] =
            (scout.$varietyBreakdowns.fromSales[variety] || 0) + count;
        }
      });
    } else if (type === ORDER_TYPES.GIRL_DIRECT_SHIP) {
      // Type 1: Scout's own direct ship orders
      scout.totals.shipped += order.physicalPackages;

      // Track varieties from shipped
      Object.entries(order.varieties).forEach(([variety, count]) => {
        if (variety !== 'Cookie Share') {
          scout.$varietyBreakdowns.fromShipped[variety] =
            (scout.$varietyBreakdowns.fromShipped[variety] || 0) + count;
        }
      });
    }
    // Types 3 & 4 are site orders - handled via allocations

    // Donations (all types)
    scout.totals.donations += order.donations;

    // Revenue (all orders)
    scout.totals.revenue += order.amount;
  });

  // Credited = booth + direct ship allocations
  scout.totals.credited =
    scout.credited.booth.packages +
    scout.credited.directShip.packages;

  // Add credited variety breakdowns
  scout.$varietyBreakdowns.fromBooth = { ...scout.credited.booth.varieties };
  scout.$varietyBreakdowns.fromDirectShip = { ...scout.credited.directShip.varieties };

  // Total Sold = direct sales + credited
  scout.totals.totalSold =
    scout.totals.sales +
    scout.totals.shipped +
    scout.totals.donations +
    scout.totals.credited;

  // Calculate breakdown (direct vs credited) - $ = calculated
  scout.totals.$breakdown = {
    direct: scout.totals.sales + scout.totals.shipped + scout.totals.donations,
    credited: scout.totals.credited
  };

  // Net Inventory = received - sales (can be negative)
  scout.totals.inventory = scout.inventory.total - scout.totals.sales;

  // Calculate inventory for display: sum of positive variety values only
  // Negative varieties show as warnings but don't reduce the total
  // (You can't have negative physical packages)
  let inventoryPositiveOnly = 0;
  Object.entries(scout.inventory.varieties).forEach(([variety, count]) => {
    const sold = scout.$varietyBreakdowns.fromSales[variety] || 0;
    const net = count - sold;
    if (net > 0) {
      inventoryPositiveOnly += net;
    }
    // Negative net values are treated as 0 for the total
  });
  scout.totals.$inventoryDisplay = inventoryPositiveOnly;
}

/**
 * Detect and track negative inventory issues by variety
 * @param {Object} scout - Scout object to check for negative inventory
 */
function detectNegativeInventory(scout) {
  // Check for negative inventory by variety
  const negativeVarieties = [];
  PHYSICAL_COOKIE_TYPES.forEach(variety => {
    const inventoryCount = scout.inventory.varieties[variety] || 0;
    const salesCount = scout.$varietyBreakdowns.fromSales[variety] || 0;
    const varietyNet = inventoryCount - salesCount;
    if (varietyNet < 0) {
      negativeVarieties.push({ variety, count: varietyNet });
    }
  });

  // Store issues ($ = calculated)
  scout.$issues = {
    negativeVarieties: negativeVarieties,
    hasNegativeInventory: negativeVarieties.length > 0
  };
}

/**
 * Calculate Cookie Share breakdown for scout (auto-sync vs manual entry)
 * @param {Object} scout - Scout object to calculate Cookie Share for
 */
function calculateCookieShareBreakdown(scout) {
  // Calculate Cookie Share breakdown for this scout ($ = calculated)
  let dcTotal = 0;
  let dcAutoSync = 0;
  let dcManualEntry = 0;

  scout.orders.forEach(order => {
    if (order.donations > 0) {
      dcTotal += order.donations;

      // Determine if auto-sync or manual entry
      const isCreditCard = order.paymentStatus === 'CAPTURED';
      const isAutoSync = (order.orderType.includes('Shipped') || order.orderType === 'Donation') && isCreditCard;

      if (isAutoSync) {
        dcAutoSync += order.donations;
      } else {
        dcManualEntry += order.donations;
      }
    }
  });

  scout.$cookieShare = {
    dcTotal: dcTotal,
    dcAutoSync: dcAutoSync,
    dcManualEntry: dcManualEntry
  };
}

/**
 * Calculate all totals and derived values
 * @param {Map} scoutDataset - Scout dataset to calculate totals for
 */
function calculateScoutTotals(scoutDataset) {
  // Use PHYSICAL_COOKIE_TYPES from cookie-constants.js (imported at top)
  scoutDataset.forEach(scout => {
    // Calculate variety-level aggregations
    calculateVarietyTotals(scout);

    // Detect negative inventory issues
    detectNegativeInventory(scout);

    // Calculate Cookie Share breakdown
    calculateCookieShareBreakdown(scout);
  });
}

/**
 * Build site orders dataset with allocations
 * @param {Object} reconciler - DataReconciler instance
 * @returns {Object} Site orders summary with allocations
 */
function buildSiteOrdersDataset(reconciler) {
  const siteOrders = [];
  const rawDCData = reconciler.metadata.rawDCData || [];

  // Find site orders from DC
  const siteOrdersByType = {
    directShip: [],
    girlDelivery: []
  };

  rawDCData.forEach(row => {
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    if (lastName !== 'Site') return;

    const orderType = row[DC_COLUMNS.ORDER_TYPE] || '';
    const isShipped = orderType.includes('Shipped') || orderType.includes('shipped');
    const isDonationOnly = orderType === 'Donation';

    const totalPkgs = parseInt(row[DC_COLUMNS.TOTAL_PACKAGES]) || 0;
    const refundedPkgs = parseInt(row[DC_COLUMNS.REFUNDED_PACKAGES]) || 0;
    const packages = totalPkgs - refundedPkgs;
    const donations = parseInt(row[DC_COLUMNS.DONATION]) || 0;
    const physicalPackages = packages - donations;

    if (isShipped && !isDonationOnly) {
      siteOrdersByType.directShip.push({
        orderNumber: row[DC_COLUMNS.ORDER_NUMBER],
        packages: physicalPackages,
        type: ORDER_TYPES.TROOP_DIRECT_SHIP
      });
    } else if (!isShipped && !isDonationOnly) {
      siteOrdersByType.girlDelivery.push({
        orderNumber: row[DC_COLUMNS.ORDER_NUMBER],
        packages: physicalPackages,
        type: ORDER_TYPES.TROOP_GIRL_DELIVERY
      });
    }
  });

  // Calculate total allocated amounts
  let totalDirectShipAllocated = 0;
  let totalBoothAllocated = 0;

  if (reconciler.directShipAllocations) {
    reconciler.directShipAllocations.forEach(allocation => {
      totalDirectShipAllocated += allocation.packages || 0;
    });
  }

  reconciler.transfers.forEach(transfer => {
    if (transfer.type === 'T2G' && transfer.virtualBooth) {
      totalBoothAllocated += transfer.packages || 0;
    }
  });

  // Build site order summary
  const totalDirectShip = siteOrdersByType.directShip.reduce((sum, o) => sum + o.packages, 0);
  const totalGirlDelivery = siteOrdersByType.girlDelivery.reduce((sum, o) => sum + o.packages, 0);

  return {
    directShip: {
      orders: siteOrdersByType.directShip,
      total: totalDirectShip,
      allocated: totalDirectShipAllocated,
      unallocated: Math.max(0, totalDirectShip - totalDirectShipAllocated),
      hasWarning: (totalDirectShip - totalDirectShipAllocated) > 0
    },
    girlDelivery: {
      orders: siteOrdersByType.girlDelivery,
      total: totalGirlDelivery,
      allocated: totalBoothAllocated,
      unallocated: Math.max(0, totalGirlDelivery - totalBoothAllocated),
      hasWarning: (totalGirlDelivery - totalBoothAllocated) > 0
    }
  };
}

/**
 * Calculate scout-level aggregate statistics (counts by category)
 * @param {Map} scouts - Scout dataset
 * @returns {Object} Scout counts by category
 */
function calculateScoutCounts(scouts) {
  let scoutsWithBoothCredit = 0;
  let scoutsWithDirectShipCredit = 0;
  let scoutsWithNegativeInventory = 0;
  let scoutsWithCookieShare = 0;

  scouts.forEach(scout => {
    if (scout.credited.booth.packages > 0) scoutsWithBoothCredit++;
    if (scout.credited.directShip.packages > 0) scoutsWithDirectShipCredit++;
    if (scout.$issues?.hasNegativeInventory) scoutsWithNegativeInventory++;
    if (scout.$cookieShare?.dcTotal > 0) scoutsWithCookieShare++;
  });

  return {
    total: scouts.size,
    withBoothCredit: scoutsWithBoothCredit,
    withDirectShipCredit: scoutsWithDirectShipCredit,
    withNegativeInventory: scoutsWithNegativeInventory,
    withCookieShare: scoutsWithCookieShare
  };
}

/**
 * Calculate package totals from transfers (sold, ordered, allocated, donations)
 * @param {Array} transfers - Array of transfer objects
 * @param {Array} rawDCData - Raw Digital Cookie data for site orders
 * @returns {Object} Package totals
 */
function calculatePackageTotals(transfers, rawDCData) {
  let totalSold = 0;
  let totalRevenue = 0;
  let totalOrdered = 0; // C2T pickups
  let totalAllocated = 0; // T2G physical packages
  let totalDonations = 0;

  transfers.forEach(transfer => {
    const packages = transfer.packages || 0;
    const amount = transfer.amount || 0;

    // C2T - incoming inventory from council
    if (isC2TTransfer(transfer.type)) {
      totalOrdered += packages;
    }
    // T2G - inventory allocated to scouts
    else if (transfer.type === 'T2G') {
      // Only count physical packages for allocation tracking
      const isVirtualBooth = transfer.virtualBooth || false;
      const cookieShareCount = transfer.varieties?.['Cookie Share'] || 0;

      if (!isVirtualBooth) {
        const physicalPackages = packages - cookieShareCount;
        totalAllocated += physicalPackages;
      }

      // All T2G counts as sold (including virtual booth and Cookie Share)
      totalSold += packages;
      totalRevenue += amount;
    }
    // Other sales (D, DIRECT_SHIP, COOKIE_SHARE) - exclude C2T and PLANNED
    else if (transfer.type && packages > 0) {
      const isPlanned = transfer.type === 'PLANNED';

      if (!isC2TTransfer(transfer.type) && !isPlanned) {
        totalSold += packages;
        totalRevenue += amount;
      }
    }

    // Count Cookie Share donations
    if (transfer.varieties?.['Cookie Share']) {
      totalDonations += transfer.varieties['Cookie Share'];
    }
  });

  // Calculate site orders physical packages (booth sales from troop stock)
  let siteOrdersPhysical = 0;
  rawDCData.forEach(row => {
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    const isSiteOrder = lastName === 'Site';

    if (isSiteOrder) {
      const totalPkgs = parseInt(row[DC_COLUMNS.TOTAL_PACKAGES]) || 0;
      const refundedPkgs = parseInt(row[DC_COLUMNS.REFUNDED_PACKAGES]) || 0;
      const packages = totalPkgs - refundedPkgs;
      const donations = parseInt(row[DC_COLUMNS.DONATION]) || 0;
      const physicalPackages = packages - donations;

      const orderType = row[DC_COLUMNS.ORDER_TYPE] || '';
      const isShipped = orderType.includes('Shipped') || orderType.includes('shipped');
      const isDonationOnly = orderType === 'Donation';

      // Only count non-shipped orders that use troop stock
      if (!isShipped && !isDonationOnly) {
        siteOrdersPhysical += physicalPackages;
      }
    }
  });

  return {
    sold: totalSold,
    revenue: totalRevenue,
    ordered: totalOrdered,
    allocated: totalAllocated,
    donations: totalDonations,
    siteOrdersPhysical: siteOrdersPhysical
  };
}

/**
 * Build troop-level aggregate totals
 * @param {Object} reconciler - DataReconciler instance
 * @param {Map} scouts - Scout dataset
 * @param {Object} siteOrders - Site orders dataset
 * @returns {Object} Troop-level totals
 */
function buildTroopTotals(reconciler, scouts, siteOrders) {
  const rawDCData = reconciler.metadata.rawDCData || [];

  // Count total DC orders
  const totalOrders = rawDCData.length;

  // Calculate package totals from transfers
  const packageTotals = calculatePackageTotals(reconciler.transfers, rawDCData);

  // Calculate net troop inventory
  const totalInventory = packageTotals.ordered - packageTotals.allocated - packageTotals.siteOrdersPhysical;

  // Calculate scout-level aggregate statistics
  const scoutCounts = calculateScoutCounts(scouts);

  return {
    orders: totalOrders,
    sold: packageTotals.sold,
    revenue: packageTotals.revenue,
    inventory: totalInventory,
    donations: packageTotals.donations,
    ordered: packageTotals.ordered,
    allocated: packageTotals.allocated,
    siteOrdersPhysical: packageTotals.siteOrdersPhysical,

    // Scout-level aggregate stats
    scouts: scoutCounts
  };
}

/**
 * Build pre-classified transfer lists with totals
 * @param {Object} reconciler - DataReconciler instance
 * @returns {Object} Transfer breakdowns by type
 */
function buildTransferBreakdowns(reconciler) {
  const c2t = [];
  const t2g = [];
  const sold = [];

  let c2tTotal = 0;
  let t2gPhysicalTotal = 0;
  let soldTotal = 0;

  reconciler.transfers.forEach(transfer => {
    const packages = transfer.packages || 0;

    // C2T - Council to Troop (inventory pickups)
    if (isC2TTransfer(transfer.type)) {
      c2t.push(transfer);
      c2tTotal += packages;
    }
    // T2G - Troop to Girl (allocations)
    else if (transfer.type === 'T2G') {
      t2g.push(transfer);

      // Only count physical packages (exclude virtual booth and Cookie Share)
      const isVirtualBooth = transfer.virtualBooth || false;
      const cookieShareCount = transfer.varieties?.['Cookie Share'] || 0;

      if (!isVirtualBooth) {
        const physicalPackages = packages - cookieShareCount;
        t2gPhysicalTotal += physicalPackages;
      }

      // All T2G is sold
      sold.push(transfer);
      soldTotal += packages;
    }
    // Other sales (D, DIRECT_SHIP, COOKIE_SHARE)
    else if (transfer.type && packages > 0) {
      const isPlanned = transfer.type === 'PLANNED';

      if (!isC2TTransfer(transfer.type) && !isPlanned) {
        sold.push(transfer);
        soldTotal += packages;
      }
    }
  });

  // Sort transfers by date (newest first)
  const sortByDate = (a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateB - dateA;
  };

  c2t.sort(sortByDate);
  t2g.sort(sortByDate);
  sold.sort(sortByDate);

  return {
    c2t,
    t2g,
    sold,
    totals: {
      c2t: c2tTotal,
      t2gPhysical: t2gPhysicalTotal,
      sold: soldTotal
    }
  };
}

/**
 * Build aggregate variety counts across all orders
 * @param {Object} reconciler - DataReconciler instance
 * @param {Map} scouts - Scout dataset
 * @returns {Object} Variety counts and inventory
 */
function buildVarieties(reconciler, scouts) {
  const byCookie = {};
  const inventory = {};

  // Aggregate varieties from all scout orders
  scouts.forEach(scout => {
    scout.orders.forEach(order => {
      Object.entries(order.varieties).forEach(([variety, count]) => {
        byCookie[variety] = (byCookie[variety] || 0) + count;
      });

      // Add donations (Cookie Share)
      if (order.donations > 0) {
        byCookie['Cookie Share'] = (byCookie['Cookie Share'] || 0) + order.donations;
      }
    });
  });

  // Calculate net troop inventory by variety
  reconciler.transfers.forEach(transfer => {
    if (!transfer.varieties) return;

    // C2T - Add to inventory
    if (isC2TTransfer(transfer.type)) {
      Object.entries(transfer.varieties).forEach(([variety, count]) => {
        inventory[variety] = (inventory[variety] || 0) + count;
      });
    }
    // T2G - Subtract from inventory (physical only)
    else if (transfer.type === 'T2G') {
      const isVirtualBooth = transfer.virtualBooth || false;

      if (!isVirtualBooth) {
        Object.entries(transfer.varieties).forEach(([variety, count]) => {
          // Don't subtract Cookie Share (it's virtual, was never in physical inventory)
          if (variety !== 'Cookie Share') {
            inventory[variety] = (inventory[variety] || 0) - count;
          }
        });
      }
    }
  });

  // Calculate totals
  const totalPhysical = Object.entries(byCookie)
    .filter(([variety]) => variety !== 'Cookie Share')
    .reduce((sum, [, count]) => sum + count, 0);

  const totalAll = Object.values(byCookie).reduce((sum, count) => sum + count, 0);

  return {
    byCookie,
    inventory,
    totalPhysical,
    totalAll
  };
}

/**
 * Build Cookie Share reconciliation tracking
 * @param {Object} reconciler - DataReconciler instance
 * @returns {Object} Cookie Share tracking data
 */
function buildCookieShareTracking(reconciler) {
  const rawDCData = reconciler.metadata.rawDCData || [];

  let dcTotal = 0;
  let dcAutoSync = 0;
  let dcManualEntry = 0;

  // Process Digital Cookie data
  rawDCData.forEach(row => {
    const orderType = row[DC_COLUMNS.ORDER_TYPE] || '';
    const paymentStatus = row[DC_COLUMNS.PAYMENT_STATUS] || '';
    const donations = parseInt(row[DC_COLUMNS.DONATION]) || 0;

    if (donations > 0) {
      dcTotal += donations;

      // Determine if auto-sync or manual entry
      // Auto-sync rules: Digital Cookie orders automatically sync to Smart Cookie when:
      //   1. Shipped orders with credit card (orders fulfilled by supplier)
      //   2. Donation-only orders with credit card (virtual Cookie Share)
      // Manual entry required: CASH payments OR girl delivery with donation (physical handoff)
      const isCreditCard = paymentStatus === 'CAPTURED';
      const isAutoSync = (orderType.includes('Shipped') || orderType === 'Donation') && isCreditCard;

      if (isAutoSync) {
        dcAutoSync += donations;
      } else {
        dcManualEntry += donations;
      }
    }
  });

  // Process Smart Cookie data
  let scTotal = 0;
  let scManualEntries = 0;

  reconciler.transfers.forEach(transfer => {
    // Look for Cookie Share in transfer varieties
    if (transfer.varieties?.['Cookie Share']) {
      scTotal += transfer.varieties['Cookie Share'];
    }

    // Track COOKIE_SHARE transfer type (manual adjustments)
    if (transfer.type?.includes('COOKIE_SHARE')) {
      scManualEntries += transfer.packages || 0;
    }
  });

  return {
    digitalCookie: {
      total: dcTotal,
      autoSync: dcAutoSync,
      manualEntry: dcManualEntry
    },
    smartCookie: {
      total: scTotal,
      manualEntries: scManualEntries
    },
    reconciled: dcTotal === scTotal
  };
}

/**
 * Build unified metadata
 * @param {Object} reconciler - DataReconciler instance
 * @returns {Object} Unified metadata
 */
function buildUnifiedMetadata(reconciler) {
  return {
    ...reconciler.metadata,
    unifiedBuildTime: new Date().toISOString(),
    scoutCount: reconciler.unified?.scouts?.size || 0,
    orderCount: Array.from(reconciler.unified?.scouts?.values() || [])
      .reduce((sum, s) => sum + s.orders.length, 0)
  };
}

// Export all functions
module.exports = {
  buildUnifiedDataset,
  buildScoutDataset,
  initializeScouts,
  classifyOrderType,
  addDCOrders,
  addInventory,
  addAllocations,
  calculateScoutTotals,
  calculateVarietyTotals,
  detectNegativeInventory,
  calculateCookieShareBreakdown,
  buildSiteOrdersDataset,
  buildTroopTotals,
  calculateScoutCounts,
  calculatePackageTotals,
  buildTransferBreakdowns,
  buildVarieties,
  buildCookieShareTracking,
  buildUnifiedMetadata
};
