// Data Store Operations — Factory functions for creating orders and transfers

import { DATA_SOURCES, OWNER, TRANSFER_CATEGORY, TRANSFER_TYPE, type TransferCategory } from './constants';
import { buildPhysicalVarieties, isIncomingInventory, sumPhysicalPackages } from './data-processing/utils';
import type { DataStore } from './data-store';
import Logger from './logger';
import type { Order, OrderMetadata, Transfer, TransferInput } from './types';

/** Classify a transfer into an explicit category based on type + flags */
function classifyTransferCategory(
  type: string | undefined,
  virtualBooth: boolean,
  boothDivider: boolean,
  directShipDivider: boolean
): TransferCategory {
  if (!type) {
    Logger.warn('Missing transfer type — defaulting to DC_ORDER_RECORD category');
    return TRANSFER_CATEGORY.DC_ORDER_RECORD;
  }
  if (isIncomingInventory(type)) return TRANSFER_CATEGORY.COUNCIL_TO_TROOP;
  if (type === TRANSFER_TYPE.G2T) return TRANSFER_CATEGORY.GIRL_RETURN;
  if (type === TRANSFER_TYPE.T2G) {
    if (virtualBooth) return TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION;
    if (boothDivider) return TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION;
    if (directShipDivider) return TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION;
    return TRANSFER_CATEGORY.GIRL_PICKUP;
  }
  if (type === TRANSFER_TYPE.D) return TRANSFER_CATEGORY.DC_ORDER_RECORD;
  if (type === TRANSFER_TYPE.COOKIE_SHARE || type === TRANSFER_TYPE.COOKIE_SHARE_D) {
    if (boothDivider) return TRANSFER_CATEGORY.BOOTH_COOKIE_SHARE;
    return TRANSFER_CATEGORY.COOKIE_SHARE_RECORD;
  }
  if (type === TRANSFER_TYPE.DIRECT_SHIP) return TRANSFER_CATEGORY.DIRECT_SHIP;
  if (type === TRANSFER_TYPE.PLANNED) return TRANSFER_CATEGORY.PLANNED;
  Logger.warn(`Unknown transfer type "${type}" — defaulting to DC_ORDER_RECORD category`);
  return TRANSFER_CATEGORY.DC_ORDER_RECORD;
}

/** Create a new Order object with defaults */
function createOrder(data: Partial<Order>, source: string): Order {
  return {
    orderNumber: data.orderNumber || '',
    scout: data.scout || '',
    scoutId: data.scoutId ?? undefined,
    gsusaId: data.gsusaId ?? undefined,
    gradeLevel: data.gradeLevel ?? undefined,
    date: data.date || '',
    orderType: data.orderType || null,
    owner: data.owner || OWNER.TROOP,
    packages: data.packages || 0,
    physicalPackages: data.physicalPackages || 0,
    donations: data.donations || 0,
    cases: data.cases || 0,
    amount: data.amount || 0,
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
    data.directShipDivider || false
  );

  const physicalPackages = sumPhysicalPackages(data.varieties);

  const physicalVarieties = data.varieties ? buildPhysicalVarieties(data.varieties) : {};

  return {
    date: data.date || '',
    type: data.type || TRANSFER_TYPE.D,
    category: category,
    orderNumber: data.orderNumber,
    from: data.from || '',
    to: data.to || '',
    packages: data.packages || 0,
    physicalPackages: physicalPackages,
    cases: data.cases || 0,
    varieties: data.varieties || {},
    physicalVarieties: physicalVarieties,
    amount: data.amount,
    status: data.status || '',
    actions: data.actions || {}
  };
}

/** Get the metadata key for a data source */
function getMetadataKey(source: string): keyof OrderMetadata {
  const keyMap: Record<string, keyof OrderMetadata> = {
    [DATA_SOURCES.DIGITAL_COOKIE]: 'dc',
    [DATA_SOURCES.SMART_COOKIE]: 'sc',
    [DATA_SOURCES.SMART_COOKIE_REPORT]: 'scReport',
    [DATA_SOURCES.SMART_COOKIE_API]: 'scApi'
  };

  if (!keyMap[source]) {
    Logger.warn(`Unknown data source "${source}" - using fallback key. Update getMetadataKey() in data-store-operations.ts`);
    return 'dc';
  }

  return keyMap[source];
}

/** Merge into existing order or create new one, storing it in the data store */
export function mergeOrCreateOrder(
  store: DataStore,
  orderNum: string,
  orderData: Partial<Order>,
  source: string,
  rawData: Record<string, any>,
  enrichmentFn?: ((existing: Order, newData: Partial<Order>) => void) | null
): Order {
  const metadataKey = getMetadataKey(source);

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
