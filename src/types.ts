// Core Type Definitions for Cookie Tracker
// Single source of truth for all data structure types

import type { ALLOCATION_CHANNEL, ALLOCATION_SOURCE, OrderType, Owner, PaymentMethod, TransferCategory, TransferType } from './constants';

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
  dc: Record<string, unknown> | null;
  sc: Record<string, unknown> | null;
  scReport: Record<string, unknown> | null;
  scApi: Record<string, unknown> | null;
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
  metadata: OrderMetadata;
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
// ALLOCATION TYPES
// ============================================================================

export type AllocationChannel = (typeof ALLOCATION_CHANNEL)[keyof typeof ALLOCATION_CHANNEL];
export type AllocationSource = (typeof ALLOCATION_SOURCE)[keyof typeof ALLOCATION_SOURCE];

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

interface AllocationChannelSummary {
  packages: number;
  donations: number;
  varieties: Varieties;
}

interface AllocationSummary {
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
  $orderStatusCounts: { needsApproval: number; pending: number; completed: number };
}

export interface ScoutInventory {
  total: number;
  varieties: Varieties;
}

export interface Scout {
  name: string;
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
// DATA STORE METADATA
// ============================================================================

interface ImportMetadata {
  lastImportDC: string | null;
  lastImportSC: string | null;
  lastImportSCReport?: string;
  cookieIdMap: Record<string, CookieType> | null;
  sources: Array<{ type: string; date: string; records: number }>;
}

export interface DataStoreMetadata extends ImportMetadata {
  rawDCData?: Record<string, any>[];
  warnings: Warning[];
}

// ============================================================================
// RAW SCOUT DATA (pre-unified, stored in DataStore.scouts)
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
  digitalCookie: { username: string; password: string; role?: string; councilId?: string };
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

export interface UnifiedMetadata extends ImportMetadata {
  unifiedBuildTime: string;
  scoutCount: number;
  orderCount: number;
  healthChecks: HealthChecks;
}

export interface UnifiedDataset {
  scouts: Record<string, Scout>;
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
  virtualCookieShareAllocations: Record<string, number>;
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
// IPC RESPONSE TYPE
// ============================================================================

export type IpcResponse<T = unknown> = { success: true; data: T } | { success: false; error: string };

// ============================================================================
// IPC CONTRACT TYPES
// ============================================================================

export interface ScrapeSourceResult {
  success: boolean;
  source: string;
  filePath?: string;
  error?: string;
  orderCount?: number;
  totalCases?: number;
}

export interface ScrapeResults {
  digitalCookie: ScrapeSourceResult | null;
  smartCookie: ScrapeSourceResult | null;
  success: boolean;
  error?: string;
}

export interface IpcChannelMap {
  'load-data': {
    request: { specificSc?: DataFileInfo | null; specificDc?: DataFileInfo | null } | undefined;
    response: LoadDataResult | null;
  };
  'save-file': { request: { filename: string; content: string; type?: string }; response: { path: string } };
  'load-credentials': { request: undefined; response: Credentials };
  'save-credentials': { request: Credentials; response: undefined };
  'load-config': { request: undefined; response: AppConfig };
  'save-config': { request: AppConfig; response: undefined };
  'update-config': { request: Partial<AppConfig>; response: AppConfig };
  'scrape-websites': { request: undefined; response: ScrapeResults };
  'cancel-sync': { request: undefined; response: undefined };
  'refresh-booth-locations': { request: undefined; response: BoothLocation[] };
}

export interface IpcEventMap {
  'scrape-progress': ScrapeProgress;
  'update-available': { version: string };
}

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
