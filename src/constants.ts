// Application-wide Constants
// Single source of truth for magic numbers, configuration values, and string literals

// ============================================================================
// INVENTORY
// ============================================================================

export const PACKAGES_PER_CASE = 12;
// Note: Cookie prices moved to cookie-constants.ts (most are $6, but Caramel Chocolate Chip is $7)

// ============================================================================
// DATA SOURCE IDENTIFIERS
// ============================================================================

export const DATA_SOURCES = {
  DIGITAL_COOKIE: 'DC',
  SMART_COOKIE: 'SC',
  SMART_COOKIE_REPORT: 'SC-Report',
  SMART_COOKIE_API: 'SC-API'
} as const;

export type DataSource = (typeof DATA_SOURCES)[keyof typeof DATA_SOURCES];

// ============================================================================
// ORDER CLASSIFICATION — Multi-dimensional type system (see RULES.md)
// ============================================================================

// Who does the sale belong to?
export const OWNER = {
  GIRL: 'GIRL',
  TROOP: 'TROOP'
} as const;

export type Owner = (typeof OWNER)[keyof typeof OWNER];

// How was the sale made?
export const ORDER_TYPE = {
  DELIVERY: 'DELIVERY', // Online order for local/in-person delivery
  DIRECT_SHIP: 'DIRECT_SHIP', // Online order shipped by supplier (no local inventory)
  BOOTH: 'BOOTH', // In-person booth sale (cash or DC app for card/venmo)
  IN_HAND: 'IN_HAND', // Girl sells door-to-door with cookies in hand
  DONATION: 'DONATION' // Donation only (Cookie Share, no physical cookies)
} as const;

export type OrderType = (typeof ORDER_TYPE)[keyof typeof ORDER_TYPE];

// How was payment collected?
export const PAYMENT_METHOD = {
  CREDIT_CARD: 'CREDIT_CARD',
  VENMO: 'VENMO',
  CASH: 'CASH'
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

// Smart Cookie transfer classifications
export const TRANSFER_TYPE = {
  C2T: 'C2T', // Council to Troop (inventory in)
  C2T_P: 'C2T(P)', // Council to Troop planned (with parentheses)
  T2T: 'T2T', // Troop to Troop (inventory in from another troop)
  T2G: 'T2G', // Troop to Girl (inventory out)
  G2T: 'G2T', // Girl to Troop (inventory return)
  D: 'D', // Digital Cookie order synced to SC (raw API value)
  COOKIE_SHARE: 'COOKIE_SHARE', // Manual Cookie Share entry
  COOKIE_SHARE_D: 'COOKIE_SHARE_D', // DC-synced Cookie Share
  DIRECT_SHIP: 'DIRECT_SHIP', // DC direct ship synced to SC
  PLANNED: 'PLANNED' // Planned/future orders (not counted as sold)
} as const;

export type TransferType = (typeof TRANSFER_TYPE)[keyof typeof TRANSFER_TYPE];

// Explicit transfer category — replaces boolean dispatch (isPhysical, virtualBooth, etc.)
// Every transfer gets exactly one category assigned at creation time.
// Reports use category for dispatch instead of nested if/else on booleans.
export const TRANSFER_CATEGORY = {
  COUNCIL_TO_TROOP: 'COUNCIL_TO_TROOP', // C2T, C2T(P), T2T — inventory received
  GIRL_PICKUP: 'GIRL_PICKUP', // T2G physical pickup
  VIRTUAL_BOOTH_ALLOCATION: 'VIRTUAL_BOOTH_ALLOCATION', // T2G virtual booth
  BOOTH_SALES_ALLOCATION: 'BOOTH_SALES_ALLOCATION', // T2G booth divider
  DIRECT_SHIP_ALLOCATION: 'DIRECT_SHIP_ALLOCATION', // T2G direct ship divider
  GIRL_RETURN: 'GIRL_RETURN', // G2T
  DC_ORDER_RECORD: 'DC_ORDER_RECORD', // D (sync record, not a sale)
  COOKIE_SHARE_RECORD: 'COOKIE_SHARE_RECORD', // COOKIE_SHARE, COOKIE_SHARE_D (manual or DC-synced)
  BOOTH_COOKIE_SHARE: 'BOOTH_COOKIE_SHARE', // COOKIE_SHARE from booth divider (automatic)
  DIRECT_SHIP: 'DIRECT_SHIP', // DIRECT_SHIP
  PLANNED: 'PLANNED' // Future orders
} as const;

export type TransferCategory = (typeof TRANSFER_CATEGORY)[keyof typeof TRANSFER_CATEGORY];

// How troop orders get credited to girls in SC
export const ALLOCATION_METHOD = {
  VIRTUAL_BOOTH_DIVIDER: 'VIRTUAL_BOOTH_DIVIDER', // For TROOP DELIVERY orders
  DIRECT_SHIP_DIVIDER: 'DIRECT_SHIP_DIVIDER', // For TROOP DIRECT_SHIP orders
  BOOTH_SALES_DIVIDER: 'BOOTH_SALES_DIVIDER', // For TROOP BOOTH orders (Smart Booth Divider API)
  MANUAL: 'MANUAL' // For manual allocation (fallback)
} as const;

export type AllocationMethod = (typeof ALLOCATION_METHOD)[keyof typeof ALLOCATION_METHOD];

// ============================================================================
// DATA SOURCE COLUMN NAMES
// ============================================================================

// Digital Cookie Excel Export Column Names
export const DC_COLUMNS = {
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
} as const;

// Smart Cookie Report CSV Column Names
export const SC_REPORT_COLUMNS = {
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
} as const;

// Smart Cookie API JSON Field Names
export const SC_API_COLUMNS = {
  TYPE: 'TYPE',
  ORDER_NUM: 'ORDER #',
  TO: 'TO',
  FROM: 'FROM',
  DATE: 'DATE',
  TOTAL: 'TOTAL',
  TOTAL_AMOUNT: 'TOTAL $'
} as const;

// ============================================================================
// DISPLAY STRINGS (UI Labels & Tooltips)
// ============================================================================

export const DISPLAY_STRINGS: Record<AllocationMethod, string> = {
  [ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]: 'Troop Girl Delivered',
  [ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]: 'Troop Direct Ship',
  [ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]: 'Booth Sales',
  [ALLOCATION_METHOD.MANUAL]: 'Manual Allocation'
};

// ============================================================================
// DATE & TIME
// ============================================================================

export const EXCEL_EPOCH = new Date(1899, 11, 30); // Excel date serialization epoch
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// SPECIAL IDENTIFIERS
// ============================================================================

// Identifiers for special order types and scouts
export const SPECIAL_IDENTIFIERS = {
  SITE_ORDER_LASTNAME: 'Site', // DC: Identifies troop site orders (booth sales)
  TROOP_FIRSTNAME_PREFIX: 'Troop', // DC: Site order first name format ("Troop3990")
  XSRF_TOKEN_COOKIE: 'XSRF-TOKEN' // SC: Cookie name for CSRF token
} as const;

// ============================================================================
// DATA SOURCE VALUES (Raw strings from external APIs)
// ============================================================================

// Digital Cookie payment status values (raw API strings)
export const DC_PAYMENT_STATUS = {
  CAPTURED: 'CAPTURED', // Credit card payment captured
  AUTHORIZED: 'AUTHORIZED', // Credit card payment authorized
  CASH: 'CASH', // Cash payment
  VENMO: 'VENMO' // Venmo payment (may appear in variations)
} as const;

// Digital Cookie order type strings (for pattern matching)
export const DC_ORDER_TYPE_STRINGS = {
  DONATION: 'Donation', // Pure donation order
  SHIPPED: 'Shipped' // Used in .includes() checks for shipped orders
} as const;

// Smart Cookie boolean string values
export const SC_BOOLEAN = {
  TRUE: 'TRUE',
  FALSE: 'FALSE'
} as const;

// ============================================================================
// CONFIGURATION
// ============================================================================

// Default Council ID (Girl Scouts San Diego)
export const DEFAULT_COUNCIL_ID = '623';

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

export const HTTP_STATUS = {
  OK: 200, // Request successful
  FOUND: 302 // Redirect (used by authentication endpoints)
} as const;

// ============================================================================
// UI TIMING CONSTANTS
// ============================================================================

export const UI_TIMING = {
  TOOLTIP_DELAY_SHOW: 100, // Milliseconds before showing tooltip
  TOOLTIP_DELAY_HIDE: 0 // Milliseconds before hiding tooltip
} as const;

// ============================================================================
// BOOTH AVAILABILITY CONFIG
// TODO: Make user-configurable via settings UI
// ============================================================================

/** Booth IDs to fetch availability for (used by scraper + report display) */
export const BOOTH_IDS = [4187, 4217, 4286, 9337, 9338, 8099, 21593];
