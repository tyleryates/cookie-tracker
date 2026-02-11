// Core Type Definitions for Cookie Tracker
// Single source of truth for all data structure types

import type { OrderType, Owner, PaymentMethod, TransferCategory, TransferType } from './constants';

// ============================================================================
// COOKIE TYPES
// ============================================================================

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

export type Varieties = Partial<Record<CookieType, number>>;

// ============================================================================
// ORDER TYPES
// ============================================================================

export interface OrderMetadata {
  dc: Record<string, any> | null;
  sc: Record<string, any> | null;
  scReport: Record<string, any> | null;
  scApi: Record<string, any> | null;
}

export interface Order {
  orderNumber: string;
  scout: string;
  scoutId?: string;
  gsusaId?: string;
  gradeLevel?: string;
  date: string;
  dcOrderType?: string;
  orderType: OrderType | null;
  owner: Owner;
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

export interface TransferActions {
  submittable?: boolean;
  approvable?: boolean;
  saveable?: boolean;
}

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

export type TransferInput = Partial<Transfer> & {
  virtualBooth?: boolean;
  boothDivider?: boolean;
  directShipDivider?: boolean;
};

// ============================================================================
// ALLOCATION TYPES — Normalized single type replacing BoothSalesAllocation,
// DirectShipAllocation, and virtual booth transfer processing.
// ============================================================================

export type AllocationChannel = 'booth' | 'directShip' | 'virtualBooth';
export type AllocationSource = 'DirectShipDivider' | 'SmartBoothDivider' | 'SmartDirectShipDivider' | 'VirtualBoothTransfer';

/**
 * Unified allocation record. Every credited allocation across all channels
 * (booth sales, direct ship, virtual booth) uses this single type.
 * Channel-specific fields are optional.
 */
export interface Allocation {
  channel: AllocationChannel;
  girlId: number;
  packages: number;
  donations: number;
  varieties: Varieties;
  source: AllocationSource;

  // Booth-specific
  reservationId?: string;
  storeName?: string;
  startTime?: string;
  endTime?: string;
  reservationType?: string;

  // Booth + virtualBooth shared
  date?: string;

  // Virtual booth specific
  orderNumber?: string;
  from?: string;
  amount?: number;

  // Direct ship specific
  orderId?: string;
}

// ============================================================================
// SCOUT TYPES
// ============================================================================

export interface AllocationChannelSummary {
  packages: number;
  donations: number;
  varieties: Varieties;
}

export interface AllocationSummary {
  booth: AllocationChannelSummary;
  directShip: AllocationChannelSummary;
  virtualBooth: AllocationChannelSummary;
}

export interface ScoutTotals {
  orders: number;
  delivered: number;
  shipped: number;
  donations: number;
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
  $salesByVariety: Varieties;
  $shippedByVariety: Varieties;
  $allocationSummary: AllocationSummary;
}

export interface ScoutInventory {
  total: number;
  varieties: Varieties;
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
  /** Flat list of all credited allocations (booth, directShip, virtualBooth) */
  allocations: Allocation[];
  $allocationsByChannel: {
    booth: Allocation[];
    directShip: Allocation[];
    virtualBooth: Allocation[];
  };
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
// WARNING TYPE
// ============================================================================

export type WarningType = 'UNKNOWN_ORDER_TYPE' | 'UNKNOWN_PAYMENT_METHOD' | 'UNKNOWN_TRANSFER_TYPE' | 'SC_TRANSFER_SKIPPED';

export interface Warning {
  type: WarningType;
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

export interface ScrapeProgress {
  source: 'dc' | 'sc';
  status: string;
  progress: number;
}

export type ProgressCallback = ((progress: ScrapeProgress) => void) | null;

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
  physicalPackages: number;
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

export interface SiteOrderEntry {
  orderNumber: string;
  packages: number;
  owner: Owner;
  orderType: OrderType | null;
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
  c2tReceived: number;
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

export interface UnifiedMetadata {
  lastImportDC: string | null;
  lastImportSC: string | null;
  lastImportSCReport?: string;
  cookieIdMap: Record<number, CookieType> | null;
  sources: Array<{ type: string; date: string; records: number }>;
  unifiedBuildTime: string;
  scoutCount: number;
  orderCount: number;
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
  // Surfaced from DataStore so renderer doesn't need it
  virtualCookieShareAllocations: Map<number, number>;
  hasTransferData: boolean;
}

// ============================================================================
// APP CONFIG TYPES
// ============================================================================

export interface DayFilter {
  day: number;
  timeAfter?: string;
  timeBefore?: string;
  excludeAfter?: string;
  excludeBefore?: string;
}

export interface IgnoredTimeSlot {
  boothId: number;
  date: string;
  startTime: string;
}

export interface AppConfig {
  autoSyncEnabled: boolean;
  boothIds: number[];
  boothDayFilters: DayFilter[];
  ignoredTimeSlots: IgnoredTimeSlot[];
  lastBoothSync?: string;
}

// ============================================================================
// DATA FILE INFO
// ============================================================================

// ============================================================================
// IPC RESPONSE TYPE
// ============================================================================

export type IpcResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

// ============================================================================
// DATA FILE INFO
// ============================================================================

export interface DataFileInfo {
  name: string;
  extension: string;
  path: string;
  data?: any;
}

export interface DatasetEntry {
  label: string;
  scFile: DataFileInfo | null;
  dcFile: DataFileInfo | null;
  timestamp: string;
}

export interface LoadedSources {
  sc: boolean;
  dc: boolean;
  scReport: boolean;
  scTransfer: boolean;
  issues: string[];
  scTimestamp: string | null;
  dcTimestamp: string | null;
}

export interface LoadDataResult {
  unified: UnifiedDataset;
  datasetList: DatasetEntry[];
  loaded: LoadedSources;
}
