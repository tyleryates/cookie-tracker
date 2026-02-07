// Application-wide Constants
// Single source of truth for magic numbers, configuration values, and string literals

// ============================================================================
// INVENTORY & PRICING
// ============================================================================

const PACKAGES_PER_CASE = 12;


// ============================================================================
// DATA SOURCE IDENTIFIERS
// ============================================================================

const DATA_SOURCES = {
  DIGITAL_COOKIE: 'DC',
  SMART_COOKIE: 'SC',
  SMART_COOKIE_REPORT: 'SC-Report',
  SMART_COOKIE_API: 'SC-API'
};

// ============================================================================
// ORDER TYPE CLASSIFICATION (Internal)
// ============================================================================

const ORDER_TYPES = {
  GIRL_DELIVERY: 'GIRL_DELIVERY',
  GIRL_DIRECT_SHIP: 'GIRL_DIRECT_SHIP',
  TROOP_GIRL_DELIVERY: 'TROOP_GIRL_DELIVERY',
  TROOP_DIRECT_SHIP: 'TROOP_DIRECT_SHIP',
  DONATION_ONLY: 'DONATION_ONLY'
};


// ============================================================================
// DATA SOURCE COLUMN NAMES
// ============================================================================

// Digital Cookie Excel Export Column Names
const DC_COLUMNS = {
  ORDER_NUMBER: 'Order Number',
  GIRL_FIRST_NAME: 'Girl First Name',
  GIRL_LAST_NAME: 'Girl Last Name',
  ORDER_DATE: 'Order Date (Central Time)',
  ORDER_TYPE: 'Order Type',
  TOTAL_PACKAGES: 'Total Packages (Includes Donate & Gift)',
  REFUNDED_PACKAGES: 'Refunded Packages',
  CURRENT_SALE_AMOUNT: 'Current Sale Amount',
  ORDER_STATUS: 'Order Status',
  PAYMENT_STATUS: 'Payment Status',
  SHIP_STATUS: 'Ship Status',
  DONATION: 'Donation'
};

// Smart Cookie Report CSV Column Names
const SC_REPORT_COLUMNS = {
  ORDER_ID: 'OrderID',
  REF_NUMBER: 'RefNumber',
  GIRL_NAME: 'GirlName',
  GIRL_ID: 'GirlID',
  GSUSA_ID: 'GSUSAID',
  GRADE_LEVEL: 'GradeLevel',
  ORDER_DATE: 'OrderDate',
  ORDER_TYPE_DESC: 'OrderTypeDesc',
  TOTAL: 'Total',
  INCLUDED_IN_IO: 'IncludedInIO',
  CSHARE_VIRTUAL: 'CShareVirtual',
  TROOP_ID: 'TroopID',
  SERVICE_UNIT_DESC: 'ServiceUnitDesc',
  COUNCIL_DESC: 'CouncilDesc',
  PARAM_TITLE: 'ParamTitle'
};

// Smart Cookie API JSON Field Names
const SC_API_COLUMNS = {
  TYPE: 'TYPE',
  ORDER_NUM: 'ORDER #',
  TO: 'TO',
  FROM: 'FROM',
  DATE: 'DATE',
  TOTAL: 'TOTAL',
  TOTAL_AMOUNT: 'TOTAL $'
};

// ============================================================================
// DISPLAY STRINGS (UI Labels & Tooltips)
// ============================================================================

const DISPLAY_STRINGS = {
  TROOP_GIRL_DELIVERED: 'Troop Girl Delivered',
  TROOP_DIRECT_SHIP: 'Troop Direct Ship'
};

// ============================================================================
// DATE & TIME
// ============================================================================

const EXCEL_EPOCH = new Date(1899, 11, 30);  // Excel date serialization epoch
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// CONFIGURATION
// ============================================================================

// Default Council ID (Girl Scouts San Diego)
const DEFAULT_COUNCIL_ID = '623';

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

const HTTP_STATUS = {
  OK: 200,              // Request successful
  FOUND: 302            // Redirect (used by authentication endpoints)
};

// ============================================================================
// UI TIMING CONSTANTS
// ============================================================================

const UI_TIMING = {
  TOOLTIP_DELAY_SHOW: 100,  // Milliseconds before showing tooltip
  TOOLTIP_DELAY_HIDE: 0     // Milliseconds before hiding tooltip
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  PACKAGES_PER_CASE,
  DATA_SOURCES,
  ORDER_TYPES,

  // Data Source Column Names
  DC_COLUMNS,
  SC_REPORT_COLUMNS,
  SC_API_COLUMNS,

  // Display Strings
  DISPLAY_STRINGS,

  // Date & Time
  EXCEL_EPOCH,
  MS_PER_DAY,

  // Configuration
  DEFAULT_COUNCIL_ID,

  // HTTP Status Codes
  HTTP_STATUS,

  // UI Timing
  UI_TIMING
};
