// Core Type Definitions for Cookie Tracker
// Single source of truth for all data structure types

import type { OrderType, Owner, PaymentMethod, TransferCategory, TransferType } from './constants';

// ============================================================================
// COOKIE TYPES
// ============================================================================

/**
 * Cookie variety type - string literal union
 * Use this instead of arbitrary strings for type safety
 */
export type CookieType =
  | 'THIN_MINTS'
  | 'CARAMEL_DELITES'
  | 'PEANUT_BUTTER_PATTIES'
  | 'PEANUT_BUTTER_SANDWICH'
  | 'TREFOILS'
  | 'ADVENTUREFULS'
  | 'LEMONADES'
  | 'EXPLOREMORES'
  | 'CARAMEL_CHOCOLATE_CHIP'
  | 'COOKIE_SHARE';

/**
 * Varieties object - maps cookie types to package counts
 * Keys must be valid CookieType constants
 */
export type Varieties = Partial<Record<CookieType, number>>;

// ============================================================================
// ORDER TYPES
// ============================================================================

/**
 * Metadata attached to each order, keyed by data source
 */
export interface OrderMetadata {
  dc: Record<string, any> | null;
  sc: Record<string, any> | null;
  scReport: Record<string, any> | null;
  scApi: Record<string, any> | null;
}

/**
 * Order data structure
 */
export interface Order {
  orderNumber: string;
  scout: string;
  scoutId?: string;
  gsusaId?: string;
  gradeLevel?: string;
  date: string;
  /** Raw DC order type string for display (e.g. "Shipped with Donation", "In-Person Delivery") */
  dcOrderType?: string;
  /** Classified order type enum — used for logic/dispatch (from classifyDCOrder) */
  orderType: OrderType | null;
  owner: Owner;
  /** Whether this order draws from the scout's physical inventory (GIRL + DELIVERY/IN_HAND only) */
  needsInventory: boolean;
  packages: number;
  physicalPackages: number;
  donations: number;
  amount: number;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: PaymentMethod | null;
  varieties: Varieties;
  cases?: number;
  organization?: {
    troopId?: string;
    serviceUnit?: string;
    council?: string;
    district?: string | null;
  };
  sources: string[];
  metadata?: OrderMetadata;
}

// ============================================================================
// TRANSFER TYPES
// ============================================================================

/**
 * Transfer data structure (Smart Cookie records from /orders/search API)
 *
 * Stored in reconciler.transfers[]. Includes both actual inventory transfers
 * (C2T, T2G, G2T) and order/sales records (D, COOKIE_SHARE, DIRECT_SHIP) that
 * the SC API returns through the same endpoint. The `category` field distinguishes
 * these — see TRANSFER_CATEGORY and its category groups in constants.ts.
 *
 * Separate from reconciler.orders (Order type), which holds customer-facing sale
 * data enriched from DC + SC Report with payment info, ship status, etc.
 * Some records exist in both collections (e.g., D-prefixed SC records also
 * create/enrich an Order).
 */

/**
 * Actions available on a Smart Cookie transfer
 */
export interface TransferActions {
  submittable?: boolean;
  approvable?: boolean;
  saveable?: boolean;
}

/**
 * Transfer data structure (Smart Cookie inventory movements)
 */
export interface Transfer {
  type: TransferType;
  category: TransferCategory;
  date: string;
  orderNumber?: string;
  from: string;
  to: string;
  packages: number;
  physicalPackages: number;
  cases: number;
  varieties: Varieties;
  physicalVarieties: Varieties;
  amount?: number;
  status?: string;
  actions?: TransferActions;
}

/**
 * Input type for createTransfer() — includes classification flags from raw API data
 * that are used to determine the transfer category but not stored on the final Transfer.
 */
export type TransferInput = Partial<Transfer> & {
  virtualBooth?: boolean;
  boothDivider?: boolean;
  directShipDivider?: boolean;
};

// ============================================================================
// SCOUT TYPES
// ============================================================================

export interface ScoutTotals {
  orders: number;
  delivered: number;
  shipped: number;
  donations: number;
  /** Total credited packages (booth + virtual booth + direct ship). Used by totalSold calculation — reports use totalCredited() helper for display. */
  credited: number;
  totalSold: number;
  inventory: number;
  $financials: {
    cashCollected: number;
    electronicPayments: number;
    inventoryValue: number;
    unsoldValue: number;
    cashOwed: number;
  };
  $inventoryDisplay: Varieties;
}

export interface ScoutInventory {
  total: number;
  varieties: Varieties;
}

export interface ScoutCredited {
  virtualBooth: {
    packages: number;
    donations: number;
    varieties: Varieties;
    allocations: Array<{
      orderNumber?: string;
      date: string;
      from: string;
      packages: number;
      varieties: Varieties;
      amount: number;
    }>;
  };
  directShip: {
    packages: number;
    donations: number;
    varieties: Varieties;
    allocations: Array<{
      packages: number;
      varieties: Varieties;
      source: string;
    }>;
  };
  boothSales: {
    packages: number;
    donations: number;
    varieties: Varieties;
    allocations: Array<{
      reservationId?: string;
      storeName: string;
      date: string;
      startTime: string;
      endTime: string;
      packages: number;
      donations: number;
      varieties: Varieties;
      source: string;
    }>;
  };
}

export interface Scout {
  name: string;
  firstName?: string;
  lastName?: string;
  girlId?: number;
  scoutId?: string;
  gsusaId?: string;
  gradeLevel?: string;
  isSiteOrder: boolean;
  totals: ScoutTotals;
  inventory: ScoutInventory;
  credited: ScoutCredited;
  orders: Order[];
  $hasUnallocatedSiteOrders?: boolean;
  $issues?: {
    negativeInventory?: Array<{
      variety: CookieType;
      inventory: number;
      sales: number;
      shortfall: number;
    }>;
  };
}

// ============================================================================
// RECONCILER METADATA
// ============================================================================

export interface ReconcilerMetadata {
  lastImportDC: string | null;
  lastImportSC: string | null;
  lastImportSCReport?: string;
  cookieIdMap: Record<number, CookieType> | null;
  rawDCData?: Record<string, any>[];
  sources: Array<{
    type: string;
    date: string;
    records: number;
  }>;
  warnings: Warning[];
}

// ============================================================================
// RAW SCOUT DATA (pre-unified, stored in reconciler.scouts)
// ============================================================================

export interface RawScoutData {
  name: string;
  scoutId: number | null;
  gsusaId: string | null;
  gradeLevel: string | null;
  serviceUnit: string | null;
  troopId: string | null;
  council: string | null;
  district: string | null;
}

// ============================================================================
// RECONCILER INTERFACE (for typing function parameters)
// ============================================================================

export interface IDataReconciler {
  orders: Map<string, Order>;
  transfers: Transfer[];
  scouts: Map<string, RawScoutData>;
  troopNumber: string | null;
  boothSalesAllocations: BoothSalesAllocation[] | null;
  boothReservations: BoothReservationImported[] | null;
  boothLocations: BoothLocation[] | null;
  directShipAllocations: DirectShipAllocation[] | null;
  virtualCookieShareAllocations: Map<number, number> | null;
  boothCookieShareAllocations: Map<number, number> | null;
  metadata: ReconcilerMetadata;
  unified: UnifiedDataset | null;
  createOrder(data: Partial<Order>, source: string): Order;
  createTransfer(data: TransferInput): Transfer;
  mergeOrCreateOrder(
    orderNum: string,
    orderData: Partial<Order>,
    source: string,
    rawData: Record<string, any>,
    enrichmentFn?: ((existing: Order, newData: Partial<Order>) => void) | null
  ): Order;
  getMetadataKey(source: string): keyof OrderMetadata;
}

// ============================================================================
// WARNING TYPE (used across calculator modules)
// ============================================================================

export interface Warning {
  type: string;
  message?: string;
  orderNumber?: string;
  orderType?: string;
  paymentStatus?: string;
  scout?: string;
  reason?: string;
  file?: string;
}

// ============================================================================
// PROGRESS CALLBACK
// ============================================================================

export type ProgressCallback = ((progress: { status: string; progress: number }) => void) | null;

// ============================================================================
// CREDENTIALS
// ============================================================================

export interface Credentials {
  digitalCookie: { username: string; password: string; role?: string };
  smartCookie: { username: string; password: string };
}

// ============================================================================
// BOOTH & RESERVATION TYPES
// ============================================================================

export interface BoothSalesAllocation {
  girlId: number;
  packages: number;
  varieties: Varieties;
  trackedCookieShare: number;
  reservationId?: string;
  booth: {
    boothId?: string;
    storeName: string;
    address: string;
  };
  timeslot: {
    date: string;
    startTime: string;
    endTime: string;
  };
  reservationType: string;
  source: string;
}

export interface DirectShipAllocation {
  girlId: number;
  packages: number;
  varieties: Varieties;
  trackedCookieShare?: number;
  orderId?: string;
  source: string;
}

export interface BoothReservationImported {
  id: string;
  troopId: string;
  booth: {
    boothId: string;
    storeName: string;
    address: string;
    reservationType: string;
    isDistributed: boolean;
    isVirtuallyDistributed: boolean;
  };
  timeslot: { date: string; startTime: string; endTime: string };
  cookies: Varieties;
  totalPackages: number;
  trackedCookieShare: number;
}

export interface BoothTimeSlot {
  startTime: string;
  endTime: string;
}

export interface BoothAvailableDate {
  date: string;
  timeSlots: BoothTimeSlot[];
}

export interface BoothLocation {
  id: number;
  storeName: string;
  address: { street: string; city: string; state: string; zip: string };
  reservationType: string;
  notes: string;
  availableDates?: BoothAvailableDate[];
}

// ============================================================================
// UNIFIED DATASET
// ============================================================================

// Sub-types for unified dataset components

export interface SiteOrderEntry {
  orderNumber: string;
  packages: number;
  owner: string;
  orderType: string | null;
}

export interface SiteOrderCategory {
  orders: SiteOrderEntry[];
  total: number;
  allocated: number;
  unallocated: number;
  hasWarning: boolean;
}

export interface SiteOrdersDataset {
  directShip: SiteOrderCategory;
  girlDelivery: SiteOrderCategory;
  boothSale: SiteOrderCategory;
}

export interface ScoutCounts {
  total: number;
  active: number;
  inactive: number;
  withNegativeInventory: number;
}

export interface TroopTotals {
  troopProceeds: number;
  proceedsRate: number;
  proceedsDeduction: number;
  proceedsExemptPackages: number;
  inventory: number;
  donations: number;
  ordered: number;
  directShip: number;
  boothDividerT2G: number;
  virtualBoothT2G: number;
  girlDelivery: number;
  girlInventory: number;
  pendingPickup: number;
  boothSalesPackages: number;
  boothSalesDonations: number;
  packagesCredited: number;
  grossProceeds: number;
  scouts: ScoutCounts;
}

export interface TransferBreakdowns {
  c2t: Transfer[];
  t2g: Transfer[];
  g2t: Transfer[];
  totals: {
    c2t: number;
    t2gPhysical: number;
    g2t: number;
  };
}

export interface VarietiesResult {
  byCookie: Varieties;
  inventory: Varieties;
  total: number;
}

export interface CookieShareTracking {
  digitalCookie: {
    total: number;
    manualEntry: number;
  };
  smartCookie: {
    manualEntries: number;
  };
  reconciled: boolean;
}

export interface HealthChecks {
  warningsCount: number;
  unknownOrderTypes: number;
  unknownPaymentMethods: number;
  unknownTransferTypes: number;
}

export interface UnifiedMetadata extends ReconcilerMetadata {
  unifiedBuildTime: string;
  scoutCount: number;
  orderCount: number;
  warnings: Warning[];
  healthChecks: HealthChecks;
}

export interface UnifiedDataset {
  scouts: Map<string, Scout>;
  siteOrders: SiteOrdersDataset;
  troopTotals: TroopTotals;
  transferBreakdowns: TransferBreakdowns;
  varieties: VarietiesResult;
  cookieShare: CookieShareTracking;
  boothReservations: BoothReservationImported[];
  boothLocations: BoothLocation[];
  metadata: UnifiedMetadata;
  warnings: Warning[];
}

// ============================================================================
// APP CONFIG TYPES
// ============================================================================

export interface DayFilter {
  /** 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat */
  day: number;
  /** If set, only show time slots starting within this range (24h, e.g. "16:00") */
  timeAfter?: string;
  timeBefore?: string;
  /** If set, exclude time slots starting within this range (24h) */
  excludeAfter?: string;
  excludeBefore?: string;
}

export interface IgnoredTimeSlot {
  boothId: number;
  date: string; // YYYY-MM-DD
  startTime: string; // "16:00" or "4:00 PM"
}

export interface AppConfig {
  autoSyncEnabled: boolean;
  boothIds: number[];
  boothDayFilters: DayFilter[];
  ignoredTimeSlots: IgnoredTimeSlot[];
}

// ============================================================================
// DATA FILE INFO (for file listing in renderer)
// ============================================================================

export interface DataFileInfo {
  name: string;
  extension: string;
  path: string;
  data?: any;
}
