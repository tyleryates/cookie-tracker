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
  T2T: 'T2T', // Troop to Troop (direction depends on from/to — see TROOP_OUTGOING category)
  T2G: 'T2G', // Troop to Girl (inventory out)
  G2T: 'G2T', // Girl to Troop (inventory return)
  D: 'D', // Digital Cookie order synced to SC (raw API value)
  COOKIE_SHARE: 'COOKIE_SHARE', // Manual Cookie Share entry
  COOKIE_SHARE_D: 'COOKIE_SHARE_D', // DC-synced Cookie Share
  DIRECT_SHIP: 'DIRECT_SHIP', // DC direct ship synced to SC
  PLANNED: 'PLANNED' // Planned/future orders (not counted as sold)
} as const;

export type TransferType = (typeof TRANSFER_TYPE)[keyof typeof TRANSFER_TYPE];

// Explicit transfer category — every transfer gets exactly one category at creation time.
//
// NOTE: The SC API returns ALL record types through /orders/search, so DataStore.transfers[]
// contains both actual inventory transfers (C2T, T2G, G2T) AND order/sales records (D,
// COOKIE_SHARE, DIRECT_SHIP) that aren't really "transfers." The category documents which is
// which. See category groups below for how reports distinguish them.
export const TRANSFER_CATEGORY = {
  // Actual inventory transfers
  COUNCIL_TO_TROOP: 'COUNCIL_TO_TROOP', // C2T, C2T(P), incoming T2T — inventory received
  TROOP_OUTGOING: 'TROOP_OUTGOING', // T2T from our troop — inventory sent to another troop
  GIRL_PICKUP: 'GIRL_PICKUP', // T2G physical pickup
  VIRTUAL_BOOTH_ALLOCATION: 'VIRTUAL_BOOTH_ALLOCATION', // T2G virtual booth
  BOOTH_SALES_ALLOCATION: 'BOOTH_SALES_ALLOCATION', // T2G booth divider
  DIRECT_SHIP_ALLOCATION: 'DIRECT_SHIP_ALLOCATION', // T2G direct ship divider
  GIRL_RETURN: 'GIRL_RETURN', // G2T
  // Order/sales records (not actual transfers — stored in transfers[] because SC API returns them there)
  DC_ORDER_RECORD: 'DC_ORDER_RECORD', // D — DC order synced to SC (not a sale, just a sync record)
  COOKIE_SHARE_RECORD: 'COOKIE_SHARE_RECORD', // COOKIE_SHARE, COOKIE_SHARE_D (manual or DC-synced)
  BOOTH_COOKIE_SHARE: 'BOOTH_COOKIE_SHARE', // COOKIE_SHARE from booth divider (automatic)
  DIRECT_SHIP: 'DIRECT_SHIP', // Shipped from supplier (order record, not inventory movement)
  PLANNED: 'PLANNED' // Future/uncommitted order
} as const;

export type TransferCategory = (typeof TRANSFER_CATEGORY)[keyof typeof TRANSFER_CATEGORY];

// Category groups — define once, use everywhere.
// When adding a new TRANSFER_CATEGORY, update the relevant groups here.

export const T2G_CATEGORIES: ReadonlySet<TransferCategory> = new Set([
  TRANSFER_CATEGORY.GIRL_PICKUP,
  TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION,
  TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION,
  TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION
]);

export const TROOP_INVENTORY_IN_CATEGORIES: ReadonlySet<TransferCategory> = new Set([
  TRANSFER_CATEGORY.COUNCIL_TO_TROOP,
  TRANSFER_CATEGORY.GIRL_RETURN
]);

export const SCOUT_PHYSICAL_CATEGORIES: ReadonlySet<TransferCategory> = new Set([
  TRANSFER_CATEGORY.GIRL_PICKUP,
  TRANSFER_CATEGORY.GIRL_RETURN
]);

// Allocation channel — how the credited sale was made
export const ALLOCATION_CHANNEL = {
  BOOTH: 'booth',
  DIRECT_SHIP: 'directShip',
  VIRTUAL_BOOTH: 'virtualBooth'
} as const;

// Allocation source — which SC system produced the allocation
export const ALLOCATION_SOURCE = {
  DIRECT_SHIP_DIVIDER: 'DirectShipDivider',
  SMART_BOOTH_DIVIDER: 'SmartBoothDivider',
  SMART_DIRECT_SHIP_DIVIDER: 'SmartDirectShipDivider',
  VIRTUAL_BOOTH_TRANSFER: 'VirtualBoothTransfer'
} as const;

// Smart Cookie booth reservation types
export const BOOTH_RESERVATION_TYPE = {
  LOTTERY: 'LOTTERY',
  FCFS: 'FCFS'
} as const;

// Smart Cookie transfer status values
export const SC_TRANSFER_STATUS = {
  SAVED: 'SAVED'
} as const;

// How troop orders get credited to girls in SC
export const ALLOCATION_METHOD = {
  VIRTUAL_BOOTH_DIVIDER: 'VIRTUAL_BOOTH_DIVIDER', // For TROOP DELIVERY orders
  DIRECT_SHIP_DIVIDER: 'DIRECT_SHIP_DIVIDER', // For TROOP DIRECT_SHIP orders
  BOOTH_SALES_DIVIDER: 'BOOTH_SALES_DIVIDER' // For TROOP BOOTH orders (Smart Booth Divider API)
} as const;

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
  TOTAL: 'Total',
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

export const DISPLAY_STRINGS: Record<string, string> = {
  [ALLOCATION_METHOD.VIRTUAL_BOOTH_DIVIDER]: 'Troop Girl Delivered',
  [ALLOCATION_METHOD.DIRECT_SHIP_DIVIDER]: 'Troop Direct Ship',
  [ALLOCATION_METHOD.BOOTH_SALES_DIVIDER]: 'Booth Sales'
};

// ============================================================================
// DATE & TIME
// ============================================================================

export const EXCEL_EPOCH = new Date(1899, 11, 30); // Excel date serialization epoch
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Booth day/time filter UI
export const BOOTH_TIME_SLOTS = [
  { start: '08:00', end: '10:00', label: '8–10a' },
  { start: '10:00', end: '12:00', label: '10a–12p' },
  { start: '12:00', end: '14:00', label: '12–2p' },
  { start: '14:00', end: '16:00', label: '2–4p' },
  { start: '16:00', end: '18:00', label: '4–6p' },
  { start: '18:00', end: '20:00', label: '6–8p' }
] as const;

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ============================================================================
// SPECIAL IDENTIFIERS
// ============================================================================

// Identifiers for special order types and scouts
export const SPECIAL_IDENTIFIERS = {
  SITE_ORDER_LASTNAME: 'Site', // DC: Identifies troop site orders (booth sales)
  TROOP_FIRSTNAME_PREFIX: 'Troop', // DC: Site order first name format ("Troop3990")
  DC_ORDER_PREFIX: 'D', // SC: DC orders in Smart Cookie are prefixed with "D"
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

// Digital Cookie order status values (raw API strings, used in includes() checks)
export const DC_ORDER_STATUS = {
  NEEDS_APPROVAL: 'Needs Approval',
  STATUS_DELIVERED: 'Status Delivered',
  COMPLETED: 'Completed',
  DELIVERED: 'Delivered',
  SHIPPED: 'Shipped',
  PENDING: 'Pending',
  APPROVED_FOR_DELIVERY: 'Approved for Delivery'
} as const;

// Digital Cookie order type strings (for pattern matching)
export const DC_ORDER_TYPE_STRINGS = {
  DONATION: 'Donation', // Pure donation order
  SHIPPED: 'Shipped' // Used in .includes() checks for shipped orders
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
// PIPELINE FILES — Single source of truth for filenames in current/
// ============================================================================

export const PIPELINE_FILES = {
  SC_ORDERS: 'sc-orders.json',
  SC_DIRECT_SHIP: 'sc-direct-ship.json',
  SC_COOKIE_SHARES: 'sc-cookie-shares.json',
  SC_RESERVATIONS: 'sc-reservations.json',
  SC_BOOTH_ALLOCATIONS: 'sc-booth-allocations.json',
  SC_BOOTH_CATALOG: 'sc-booth-catalog.json',
  SC_BOOTH_LOCATIONS: 'sc-booth-locations.json',
  SC_COOKIE_ID_MAP: 'sc-cookie-id-map.json',
  DC_EXPORT: 'dc-export.xlsx',
  UNIFIED: 'unified.json'
} as const;

// ============================================================================
// SYNC ENDPOINTS — Per-endpoint sync status registry
// ============================================================================

/** Derive a human-readable frequency label from milliseconds */
export function formatMaxAge(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours === 1) return 'Hourly';
  return `${hours} hours`;
}

export const SYNC_ENDPOINTS = [
  { id: 'sc-orders', source: 'SC', name: 'Orders', maxAgeMs: 3_600_000, syncAction: 'sync', group: 'reports' },
  { id: 'sc-direct-ship', source: 'SC', name: 'Direct Ship Allocations', maxAgeMs: 3_600_000, syncAction: 'sync', group: 'reports' },
  { id: 'sc-cookie-shares', source: 'SC', name: 'Cookie Share Details', maxAgeMs: 3_600_000, syncAction: 'sync', group: 'reports' },
  { id: 'sc-reservations', source: 'SC', name: 'Reservations', maxAgeMs: 3_600_000, syncAction: 'sync', group: 'reports' },
  { id: 'sc-booth-allocations', source: 'SC', name: 'Booth Allocations', maxAgeMs: 3_600_000, syncAction: 'sync', group: 'reports' },
  { id: 'dc-troop-report', source: 'DC', name: 'Troop Report', maxAgeMs: 3_600_000, syncAction: 'sync', group: 'reports' },
  { id: 'sc-booth-catalog', source: 'SC', name: 'Booth Catalog', maxAgeMs: 14_400_000, syncAction: 'manual', group: 'booth-availability' },
  {
    id: 'sc-booth-availability',
    source: 'SC',
    name: 'Booth Finder',
    maxAgeMs: 900_000,
    syncAction: 'refreshBooths',
    group: 'booth-availability'
  }
] as const;
