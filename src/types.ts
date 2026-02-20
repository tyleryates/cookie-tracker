// Core Type Definitions for Cookie Tracker
// Single source of truth for all data structure types

import type {
  ALLOCATION_CHANNEL,
  ALLOCATION_SOURCE,
  DataSource,
  OrderType,
  Owner,
  PaymentMethod,
  SyncStatus,
  TransferCategory,
  TransferType,
  WarningType
} from './constants';
import type { SCCookieMapEntry, SCMeResponse } from './scrapers/sc-types';
import type { DCRole, SeasonalDataFiles } from './seasonal-data';

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

/** A single row of parsed spreadsheet/API data with dynamic column names */
export type RawDataRow = Record<string, any>;

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
  sources: DataSource[];
  metadata: OrderMetadata;
}

// ============================================================================
// TRANSFER TYPES
// ============================================================================

interface TransferActions {
  submittable: boolean;
  approvable: boolean;
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
  actions: TransferActions;
}

export type TransferInput = Partial<Transfer> & {
  virtualBooth?: boolean;
  boothDivider?: boolean;
  directShipDivider?: boolean;
  troopNumber?: string;
  troopName?: string;
};

// ============================================================================
// ALLOCATION TYPES
// ============================================================================

type AllocationChannel = (typeof ALLOCATION_CHANNEL)[keyof typeof ALLOCATION_CHANNEL];
type AllocationSource = (typeof ALLOCATION_SOURCE)[keyof typeof ALLOCATION_SOURCE];

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
// FINANCE PAYMENT TYPES
// ============================================================================

export interface FinancePayment {
  id: number;
  date: string; // normalized YYYY-MM-DD
  amount: number;
  method: string; // "Cash", "Check", etc.
  reference: string;
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
    paymentsTurnedIn: number;
    cashDue: number;
  };
  $inventoryDisplay: Varieties;
  $salesByVariety: Varieties;
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
  payments: FinancePayment[];
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
  sources: Array<{ type: DataSource; date: string; records: number }>;
}

export interface DataStoreMetadata extends ImportMetadata {
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

export interface Warning {
  type: WarningType;
  message?: string;
  orderNumber?: string;
  orderType?: string;
  paymentStatus?: string;
  scout?: string;
  reason?: string;
  file?: string;
  // Transfer context
  from?: string;
  to?: string;
  date?: string;
  packages?: number;
}

// ============================================================================
// PROGRESS CALLBACK
// ============================================================================

export interface ScrapeProgress {
  endpoint: string;
  status: Exclude<SyncStatus, 'idle'>;
  cached?: boolean;
  durationMs?: number;
  dataSize?: number;
  httpStatus?: number;
  error?: string;
}

export type ProgressCallback = ((progress: ScrapeProgress) => void) | null;

// ============================================================================
// SYNC STATE (per-endpoint sync tracking)
// ============================================================================

export interface EndpointSyncState {
  status: SyncStatus;
  lastSync: string | null;
  cached?: boolean;
  durationMs?: number;
  dataSize?: number;
  httpStatus?: number;
  error?: string;
}

export interface SyncState {
  syncing: boolean;
  refreshingBooths: boolean;
  endpoints: Record<string, EndpointSyncState>;
}

// ============================================================================
// CREDENTIALS
// ============================================================================

export interface Credentials {
  digitalCookie: { username: string; password: string; role?: string; councilId?: string };
  smartCookie: { username: string; password: string };
}

/** Password-free credential summary returned to the renderer */
export interface CredentialsSummary {
  digitalCookie: { username: string; hasPassword: boolean; role?: string; councilId?: string };
  smartCookie: { username: string; hasPassword: boolean };
}

/** Partial credential update — main process merges with existing */
export interface CredentialPatch {
  smartCookie?: Partial<Credentials['smartCookie']>;
  digitalCookie?: Partial<Credentials['digitalCookie']>;
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
  address: { street: string; city: string; state: string; zip: string; latitude?: number; longitude?: number };
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
  t2tOut: number;
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
  t2tOut: Transfer[];
  t2g: Transfer[];
  g2t: Transfer[];
  totals: {
    c2t: number;
    t2tOut: number;
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
  unknownCookieIds: number;
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
// PROFILE TYPES
// ============================================================================

export interface ProfileInfo {
  name: string;
  dirName: string;
  createdAt: string;
}

export interface ProfilesConfig {
  activeProfile: string;
  profiles: ProfileInfo[];
}

export interface ActiveProfile {
  dirName: string;
  name: string;
  isDefault: boolean;
}

/** Build an ActiveProfile from a ProfileInfo entry */
export function toActiveProfile(info: ProfileInfo): ActiveProfile {
  return { dirName: info.dirName, name: info.name, isDefault: info.dirName === 'default' };
}

// ============================================================================
// APP CONFIG TYPES
// ============================================================================

export interface BoothFinderConfig {
  enabled: boolean;
  autoRefresh: boolean;
  imessage: boolean;
  imessageRecipient: string;
  notifiedSlots: string[];
  ids: number[];
  dayFilters: string[];
  ignoredSlots: string[];
}

export interface AppConfig {
  autoUpdate: boolean;
  autoSync: boolean;
  /** Only present when manually added to config.json — the app never creates this key */
  boothFinder?: BoothFinderConfig;
}

/** Patch type for update-config IPC — allows partial updates to nested boothFinder */
export type AppConfigPatch = {
  autoUpdate?: boolean;
  autoSync?: boolean;
  boothFinder?: Partial<BoothFinderConfig>;
};

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
  /** Per-endpoint final statuses (set by orchestrator from progress events) */
  endpointStatuses: Record<
    string,
    { status: 'synced' | 'error'; lastSync?: string; durationMs?: number; dataSize?: number; httpStatus?: number; error?: string }
  >;
}

export interface EndpointMetadata {
  lastSync: string | null;
  status: Extract<SyncStatus, 'synced' | 'error'>;
  durationMs?: number;
  dataSize?: number;
  httpStatus?: number;
  error?: string;
}

export interface Timestamps {
  endpoints: Record<string, EndpointMetadata>;
  lastUnifiedBuild: string | null;
}

export interface IpcChannelMap {
  'load-data': {
    request: undefined;
    response: LoadDataResult | null;
  };
  'save-file': { request: { filename: string; content: string }; response: { path: string } };
  'load-credentials': { request: undefined; response: CredentialsSummary };
  'save-credentials': { request: CredentialPatch; response: { success: boolean; error?: string; path?: string; encrypted?: boolean } };
  'load-config': { request: undefined; response: AppConfig };
  'update-config': { request: AppConfigPatch; response: AppConfig };
  'scrape-websites': { request: undefined; response: ScrapeResults };
  'refresh-booth-locations': { request: undefined; response: BoothLocation[] };
  'fetch-booth-catalog': { request: undefined; response: BoothLocation[] };
  'export-data': { request: undefined; response: { path: string } | null };
  'verify-sc': {
    request: { username: string; password: string };
    response: { troop: SCMeResponse; cookies: SCCookieMapEntry[] };
  };
  'verify-dc': {
    request: { username: string; password: string };
    response: { roles: DCRole[] };
  };
  'save-seasonal-data': {
    request: Partial<SeasonalDataFiles>;
    response: undefined;
  };
  'load-seasonal-data': {
    request: undefined;
    response: SeasonalDataFiles;
  };
  'load-timestamps': { request: undefined; response: Timestamps };
  'record-unified-build': { request: undefined; response: undefined };
  'load-profiles': { request: undefined; response: ProfilesConfig };
  'switch-profile': { request: { dirName: string }; response: ProfilesConfig };
  'delete-profile': { request: { dirName: string }; response: ProfilesConfig };
  'import-profile': { request: { name: string }; response: ProfilesConfig | null };
  'quit-and-install': {
    request: undefined;
    response: undefined;
  };
  'check-for-updates': {
    request: undefined;
    response: undefined;
  };
  'send-imessage': {
    request: { recipient: string; message: string };
    response: undefined;
  };
  'set-dock-badge': {
    request: { count: number };
    response: undefined;
  };
  'log-message': {
    request: string;
    response: undefined;
  };
}

export interface IpcEventMap {
  'scrape-progress': ScrapeProgress;
  'update-available': { version: string };
  'update-downloaded': { version: string };
}

// ============================================================================
// DATA FILE INFO
// ============================================================================

export interface DataFileInfo {
  name: string;
  extension: string;
  path: string;
  data?: unknown;
}

export interface LoadedSources {
  sc: boolean;
  dc: boolean;
  scReport: boolean;
  scTransfer: boolean;
  issues: string[];
}

export interface LoadDataResult {
  unified: UnifiedDataset;
  loaded: LoadedSources;
}
