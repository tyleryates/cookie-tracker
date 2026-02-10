// Data Reconciliation System
// Standardizes and merges data from Digital Cookie and Smart Cookie

import { DATA_SOURCES, TRANSFER_CATEGORY, type TransferCategory } from './constants';
import { COOKIE_TYPE } from './cookie-constants';
import { buildUnifiedDataset } from './data-processing/data-calculators';
import { importDigitalCookie, importSmartCookie, importSmartCookieAPI, importSmartCookieReport } from './data-processing/data-importers';
import { isIncomingInventory, sumPhysicalPackages } from './data-processing/utils';
import Logger from './logger';
import type {
  BoothLocation,
  BoothReservationImported,
  BoothSalesAllocation,
  DirectShipAllocation,
  IDataReconciler,
  Order,
  OrderMetadata,
  RawScoutData,
  ReconcilerMetadata,
  Transfer,
  TransferInput,
  UnifiedDataset,
  Varieties
} from './types';

/** Classify a transfer into an explicit category based on type + flags */
function classifyTransferCategory(
  type: string,
  virtualBooth: boolean,
  boothDivider: boolean,
  directShipDivider: boolean
): TransferCategory {
  if (isIncomingInventory(type)) return TRANSFER_CATEGORY.COUNCIL_TO_TROOP;
  if (type === 'G2T') return TRANSFER_CATEGORY.GIRL_RETURN;
  if (type === 'T2G') {
    if (virtualBooth) return TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION;
    if (boothDivider) return TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION;
    if (directShipDivider) return TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION;
    return TRANSFER_CATEGORY.GIRL_PICKUP;
  }
  if (type === 'D') return TRANSFER_CATEGORY.DC_ORDER_RECORD;
  if (type === 'COOKIE_SHARE' || type === 'COOKIE_SHARE_D') {
    if (boothDivider) return TRANSFER_CATEGORY.BOOTH_COOKIE_SHARE;
    return TRANSFER_CATEGORY.COOKIE_SHARE_RECORD;
  }
  if (type === 'DIRECT_SHIP') return TRANSFER_CATEGORY.DIRECT_SHIP;
  if (type === 'PLANNED') return TRANSFER_CATEGORY.PLANNED;
  Logger.warn(`Unknown transfer type "${type}" — defaulting to DC_ORDER_RECORD category`);
  return TRANSFER_CATEGORY.DC_ORDER_RECORD;
}

/**
 * DataReconciler - Merges and standardizes data from multiple sources
 *
 * IMPORTANT CONVENTION: Properties prefixed with $ are calculated/derived fields
 * - These are computed from raw imported data during buildUnifiedDataset()
 * - Examples: $issues, $orderRevenue, $creditedRevenue
 * - Do not import these directly - they are rebuilt on each reconciliation
 * - This convention helps distinguish between source data and computed values
 */
class DataReconciler implements IDataReconciler {
  orders: Map<string, Order>;
  transfers: Transfer[];
  scouts: Map<string, RawScoutData>;
  troopNumber: string | null;
  boothSalesAllocations: BoothSalesAllocation[] | null;
  boothReservations: BoothReservationImported[] | null;
  boothLocations: BoothLocation[] | null;
  directShipAllocations: DirectShipAllocation[] | null;
  metadata: ReconcilerMetadata;
  unified: UnifiedDataset | null;
  virtualCookieShareAllocations: Map<number, number> | null;
  boothCookieShareAllocations: Map<number, number> | null;

  constructor() {
    this.orders = new Map();
    this.transfers = [];
    this.scouts = new Map();
    this.troopNumber = null;
    this.boothSalesAllocations = null;
    this.boothReservations = null;
    this.boothLocations = null;
    this.directShipAllocations = null;
    this.metadata = {
      lastImportDC: null,
      lastImportSC: null,
      cookieIdMap: null,
      sources: [],
      warnings: []
    };
    this.unified = null;
    this.virtualCookieShareAllocations = null;
    this.boothCookieShareAllocations = null;
  }

  createOrder(data: Partial<Order>, source: string): Order {
    return {
      id: data.orderNumber || `${source}-${Date.now()}`,
      orderNumber: data.orderNumber || '',
      scout: data.scout || '',
      scoutId: data.scoutId || null,
      gsusaId: data.gsusaId || null,
      gradeLevel: data.gradeLevel || null,
      date: data.date || '',
      type: data.type || '',
      orderType: data.orderType || null,
      owner: data.owner || 'TROOP',
      needsInventory: data.needsInventory || false,
      packages: data.packages || 0,
      physicalPackages: data.physicalPackages || 0,
      donations: data.donations || 0,
      cases: data.cases || 0,
      amount: data.amount || 0,
      status: data.status,
      paymentStatus: data.paymentStatus,
      shipStatus: data.shipStatus,
      includedInIO: data.includedInIO || null,
      isVirtual: data.isVirtual || null,
      varieties: data.varieties || {},
      organization: {
        troopId: data.organization?.troopId || null,
        serviceUnit: data.organization?.serviceUnit || null,
        council: data.organization?.council || null,
        district: data.organization?.district || null
      },
      sources: [source],
      metadata: {
        dc: null,
        sc: null,
        scReport: null,
        scApi: null
      }
    };
  }

  createTransfer(data: TransferInput): Transfer {
    // Classify transfer category explicitly — no remainder logic
    const category = classifyTransferCategory(
      data.type as string,
      data.virtualBooth || false,
      data.boothDivider || false,
      data.directShipDivider || false
    );

    // Physical packages = sum of non-Cookie-Share varieties (positive sum, not subtraction)
    const physicalPackages = sumPhysicalPackages(data.varieties);

    // Physical varieties (excluding Cookie Share)
    const physicalVarieties: Varieties = {};
    if (data.varieties) {
      Object.entries(data.varieties).forEach(([variety, count]) => {
        if (variety !== COOKIE_TYPE.COOKIE_SHARE) {
          (physicalVarieties as Record<string, any>)[variety] = count;
        }
      });
    }

    return {
      id: `${data.type}-${data.date}-${data.orderNumber}`,
      date: data.date,
      type: data.type,
      category: category,
      orderNumber: data.orderNumber,
      from: data.from,
      to: data.to,
      packages: data.packages, // Total (includes Cookie Share if present)
      physicalPackages: physicalPackages, // Sum of non-Cookie-Share varieties
      cases: data.cases || 0,
      varieties: data.varieties,
      physicalVarieties: physicalVarieties,
      amount: data.amount,
      status: data.status || '',
      actions: data.actions || {},
      source: data.source
    };
  }

  mergeOrCreateOrder(
    orderNum: string,
    orderData: Partial<Order>,
    source: string,
    rawData: Record<string, any>,
    enrichmentFn?: ((existing: Order, newData: Partial<Order>) => void) | null
  ): Order {
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

  getMetadataKey(source: string): keyof OrderMetadata {
    const keyMap: Record<string, keyof OrderMetadata> = {
      [DATA_SOURCES.DIGITAL_COOKIE]: 'dc',
      [DATA_SOURCES.SMART_COOKIE]: 'sc',
      [DATA_SOURCES.SMART_COOKIE_REPORT]: 'scReport',
      [DATA_SOURCES.SMART_COOKIE_API]: 'scApi'
    };

    if (!keyMap[source]) {
      Logger.warn(`Unknown data source "${source}" - using fallback key. Update getMetadataKey() in data-reconciler.ts`);
      return 'dc';
    }

    return keyMap[source];
  }

  importDigitalCookie(dcData: Record<string, any>[]): void {
    importDigitalCookie(this, dcData);
  }

  importSmartCookieReport(reportData: Record<string, any>[]): void {
    importSmartCookieReport(this, reportData);
  }

  importSmartCookieAPI(apiData: Record<string, any>): void {
    importSmartCookieAPI(this, apiData);
  }

  importSmartCookie(scData: Record<string, any>[]): void {
    importSmartCookie(this, scData);
  }

  buildUnifiedDataset(): UnifiedDataset {
    this.unified = buildUnifiedDataset(this);
    return this.unified;
  }
}

export default DataReconciler;
