// Data Store Operations — Factory functions for creating orders and transfers

import { DATA_SOURCE_METADATA_KEY, type DataSource, OWNER, TRANSFER_CATEGORY, TRANSFER_TYPE, type TransferCategory } from './constants';
import { buildPhysicalVarieties, isC2TTransfer, sumPhysicalPackages } from './data-processing/utils';
import type { DataStore } from './data-store';
import Logger from './logger';
import type { Order, Transfer, TransferInput } from './types';

/** Check if a from/to field matches our troop number.
 *  Handles format mismatch: troopNumber is a numeric ID (e.g. "3990")
 *  but the API from/to fields may contain names (e.g. "Troop 3990"). */
function matchesTroopNumber(field: string, troopNumber: string): boolean {
  if (field === troopNumber) return true;
  // Extract the numeric part from the field and compare
  const digits = field.match(/\d+/)?.[0];
  return digits === troopNumber;
}

/** Simple type → category lookup for types with no special-case logic */
const TRANSFER_TYPE_CATEGORY: Record<string, TransferCategory> = {
  [TRANSFER_TYPE.G2T]: TRANSFER_CATEGORY.GIRL_RETURN,
  [TRANSFER_TYPE.D]: TRANSFER_CATEGORY.DC_ORDER_RECORD,
  [TRANSFER_TYPE.DIRECT_SHIP]: TRANSFER_CATEGORY.DIRECT_SHIP,
  [TRANSFER_TYPE.PLANNED]: TRANSFER_CATEGORY.COUNCIL_TO_TROOP
};

/** Determine T2T direction: outgoing if our troop is the sender, otherwise incoming */
function classifyT2T(from: string | undefined, troopNumber: string | undefined, troopName: string | undefined): TransferCategory {
  if (from && troopNumber && matchesTroopNumber(from, troopNumber)) return TRANSFER_CATEGORY.TROOP_OUTGOING;
  if (from && troopName && matchesTroopNumber(from, troopName)) return TRANSFER_CATEGORY.TROOP_OUTGOING;
  if (!troopNumber && !troopName) {
    Logger.warn(`T2T transfer from="${from || '(empty)'}" cannot determine direction — defaulting to incoming`);
  }
  return TRANSFER_CATEGORY.COUNCIL_TO_TROOP;
}

/** Classify T2G based on divider flags */
function classifyT2G(virtualBooth: boolean, boothDivider: boolean, directShipDivider: boolean): TransferCategory {
  if (virtualBooth) return TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION;
  if (boothDivider) return TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION;
  if (directShipDivider) return TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION;
  return TRANSFER_CATEGORY.GIRL_PICKUP;
}

/** Classify Cookie Share based on booth divider flag */
function classifyCookieShare(boothDivider: boolean): TransferCategory {
  return boothDivider ? TRANSFER_CATEGORY.BOOTH_COOKIE_SHARE : TRANSFER_CATEGORY.COOKIE_SHARE_RECORD;
}

/** Classify a transfer into an explicit category based on type + flags */
function classifyTransferCategory(
  type: string | undefined,
  virtualBooth: boolean,
  boothDivider: boolean,
  directShipDivider: boolean,
  from?: string,
  troopNumber?: string,
  troopName?: string
): TransferCategory {
  if (!type) {
    Logger.warn('Missing transfer type — defaulting to DC_ORDER_RECORD category');
    return TRANSFER_CATEGORY.DC_ORDER_RECORD;
  }
  if (isC2TTransfer(type)) return TRANSFER_CATEGORY.COUNCIL_TO_TROOP;
  if (type === TRANSFER_TYPE.T2T) return classifyT2T(from, troopNumber, troopName);
  if (type === TRANSFER_TYPE.T2G) return classifyT2G(virtualBooth, boothDivider, directShipDivider);
  if (type === TRANSFER_TYPE.COOKIE_SHARE || type === TRANSFER_TYPE.COOKIE_SHARE_D) return classifyCookieShare(boothDivider);
  const mapped = TRANSFER_TYPE_CATEGORY[type];
  if (mapped) return mapped;
  Logger.warn(`Unknown transfer type "${type}" — defaulting to DC_ORDER_RECORD category`);
  return TRANSFER_CATEGORY.DC_ORDER_RECORD;
}

/** Create a new Order object with defaults */
function createOrder(data: Partial<Order>, source: DataSource): Order {
  return {
    orderNumber: data.orderNumber || '',
    scout: data.scout || '',
    scoutId: data.scoutId ?? undefined,
    gsusaId: data.gsusaId ?? undefined,
    gradeLevel: data.gradeLevel ?? undefined,
    date: data.date || '',
    orderType: data.orderType ?? null,
    owner: data.owner ?? OWNER.TROOP,
    packages: data.packages ?? 0,
    physicalPackages: data.physicalPackages ?? 0,
    donations: data.donations ?? 0,
    cases: data.cases ?? 0,
    amount: data.amount ?? 0,
    status: data.status,
    paymentStatus: data.paymentStatus,
    varieties: data.varieties || {},
    organization: {
      troopId: data.organization?.troopId ?? undefined,
      serviceUnit: data.organization?.serviceUnit ?? undefined,
      council: data.organization?.council ?? undefined,
      district: data.organization?.district ?? undefined
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

/** Create a Transfer with explicit category classification */
export function createTransfer(data: TransferInput): Transfer {
  const category = classifyTransferCategory(
    data.type,
    data.virtualBooth || false,
    data.boothDivider || false,
    data.directShipDivider || false,
    data.from,
    data.troopNumber,
    data.troopName
  );

  const physicalPackages = sumPhysicalPackages(data.varieties);

  const physicalVarieties = data.varieties ? buildPhysicalVarieties(data.varieties) : {};

  return {
    date: data.date || '',
    type: data.type ?? TRANSFER_TYPE.D,
    category: category,
    orderNumber: data.orderNumber,
    from: data.from || '',
    to: data.to || '',
    packages: data.packages ?? 0,
    physicalPackages: physicalPackages,
    cases: data.cases ?? 0,
    varieties: data.varieties ?? {},
    physicalVarieties: physicalVarieties,
    amount: data.amount,
    status: data.status || '',
    actions: {
      submittable: data.actions?.submittable ?? false,
      approvable: data.actions?.approvable ?? false
    }
  };
}

/** Merge into existing order or create new one, storing it in the data store */
export function mergeOrCreateOrder(
  store: DataStore,
  orderNum: string,
  orderData: Partial<Order>,
  source: DataSource,
  rawData: Record<string, unknown>,
  enrichmentFn?: ((existing: Order, newData: Partial<Order>) => void) | null
): Order {
  const metadataKey = DATA_SOURCE_METADATA_KEY[source];

  if (store.orders.has(orderNum)) {
    const existing = store.orders.get(orderNum)!;

    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }

    existing.metadata[metadataKey] = rawData;

    if (enrichmentFn) {
      enrichmentFn(existing, orderData);
    } else {
      Object.assign(existing, orderData);
    }

    return existing;
  } else {
    const order = createOrder(orderData, source);
    order.metadata[metadataKey] = rawData;
    store.orders.set(orderNum, order);
    return order;
  }
}
