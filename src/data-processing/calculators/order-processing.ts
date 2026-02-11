// Order Processing and Classification
// Handles Digital Cookie order import and classification

import type { OrderType, Owner, PaymentMethod } from '../../constants';
import {
  DATA_SOURCES,
  DC_COLUMNS,
  DC_ORDER_TYPE_STRINGS,
  DC_PAYMENT_STATUS,
  ORDER_TYPE,
  OWNER,
  PAYMENT_METHOD,
  SPECIAL_IDENTIFIERS
} from '../../constants';
import { COOKIE_TYPE } from '../../cookie-constants';
import Logger from '../../logger';
import type { Order, Scout, Varieties, Warning } from '../../types';
import { parseVarietiesFromDC } from '../importers/parsers';

/** Classify payment method from DC payment status string */
function classifyPaymentMethod(paymentStatus: string): PaymentMethod | null {
  const ps = (paymentStatus || '').toUpperCase();
  if (ps === DC_PAYMENT_STATUS.CASH) return PAYMENT_METHOD.CASH;
  if (ps.includes(DC_PAYMENT_STATUS.VENMO)) return PAYMENT_METHOD.VENMO;
  if (ps === DC_PAYMENT_STATUS.CAPTURED || ps === DC_PAYMENT_STATUS.AUTHORIZED) return PAYMENT_METHOD.CREDIT_CARD;

  // Unknown payment status - caller handles warning
  // Do NOT assume credit card - financial tracking requires accuracy
  return null;
}

/** Classify a DC order into owner + orderType dimensions */
function classifyDCOrder(isSiteOrder: boolean, dcOrderType: string): { owner: Owner; orderType: OrderType | null } {
  const owner = isSiteOrder ? OWNER.TROOP : OWNER.GIRL;
  const lc = dcOrderType.toLowerCase();

  if (dcOrderType === DC_ORDER_TYPE_STRINGS.DONATION) {
    return { owner, orderType: ORDER_TYPE.DONATION };
  }
  if (lc.includes(DC_ORDER_TYPE_STRINGS.SHIPPED.toLowerCase())) {
    return { owner, orderType: ORDER_TYPE.DIRECT_SHIP };
  }
  if (lc.includes('cookies in hand')) {
    return { owner, orderType: isSiteOrder ? ORDER_TYPE.BOOTH : ORDER_TYPE.IN_HAND };
  }
  // In-Person Delivery, In Person Delivery, Pick Up — all are DELIVERY
  if (lc.includes('in-person delivery') || lc.includes('in person delivery') || lc.includes('pick up')) {
    return { owner, orderType: ORDER_TYPE.DELIVERY };
  }

  // Unknown — caller handles warning
  return { owner, orderType: null };
}

/** Extract basic order information from DC row */
function extractBasicOrderInfo(row: Record<string, any>): {
  orderNumber: string;
  date: any;
  packages: number;
  physicalPackages: number;
  donations: number;
  amount: number;
  status: string;
  paymentStatus: string;
  dcOrderType: string;
} {
  const totalPkgs = parseInt(row[DC_COLUMNS.TOTAL_PACKAGES], 10) || 0;
  const refundedPkgs = parseInt(row[DC_COLUMNS.REFUNDED_PACKAGES], 10) || 0;
  const packages = totalPkgs - refundedPkgs;
  const donations = parseInt(row[DC_COLUMNS.DONATION], 10) || 0;
  const physicalPackages = packages - donations;
  const amountStr = row[DC_COLUMNS.CURRENT_SALE_AMOUNT] || '0';
  const amount = parseFloat(String(amountStr).replace(/[$,]/g, '')) || 0;

  return {
    orderNumber: row[DC_COLUMNS.ORDER_NUMBER],
    date: row[DC_COLUMNS.ORDER_DATE],
    packages,
    physicalPackages,
    donations,
    amount,
    status: row[DC_COLUMNS.ORDER_STATUS],
    paymentStatus: row[DC_COLUMNS.PAYMENT_STATUS] || '',
    dcOrderType: row[DC_COLUMNS.ORDER_TYPE] || ''
  };
}

/** Parse cookie varieties from DC row, adding Cookie Share for donations */
function parseOrderVarieties(row: Record<string, any>, donations: number): Varieties {
  const varieties = parseVarietiesFromDC(row);
  if (donations > 0) {
    (varieties as Record<string, number>)[COOKIE_TYPE.COOKIE_SHARE] = donations;
  }
  return varieties;
}

/** Build complete order object from parsed components */
function buildOrderObject(
  basicInfo: ReturnType<typeof extractBasicOrderInfo>,
  varieties: Varieties,
  classification: { owner: Owner; orderType: OrderType | null },
  paymentMethod: PaymentMethod | null
): Order {
  return {
    orderNumber: basicInfo.orderNumber,
    scout: '',
    date: basicInfo.date,
    owner: classification.owner,
    orderType: classification.orderType,
    dcOrderType: basicInfo.dcOrderType,
    packages: basicInfo.packages,
    physicalPackages: basicInfo.physicalPackages,
    donations: basicInfo.donations,
    varieties: varieties,
    amount: basicInfo.amount,
    status: basicInfo.status,
    paymentStatus: basicInfo.paymentStatus,
    paymentMethod: paymentMethod,
    sources: [DATA_SOURCES.DIGITAL_COOKIE]
  };
}

/** Record classification warning */
function recordClassificationWarning(warnings: Warning[], warningData: Warning): void {
  warnings.push(warningData);

  const { type, orderNumber, orderType, paymentStatus } = warningData;
  if (type === 'UNKNOWN_ORDER_TYPE') {
    Logger.warn(`Unknown Digital Cookie order type "${orderType}" (order ${orderNumber})`);
  } else if (type === 'UNKNOWN_PAYMENT_METHOD') {
    Logger.warn(`Unknown payment status "${paymentStatus}" (order ${orderNumber})`);
  }
}

/** Parse and classify a single Digital Cookie order */
function parseAndClassifyOrder(row: Record<string, any>, lastName: string, warnings: Warning[]): Order {
  const basicInfo = extractBasicOrderInfo(row);
  const varieties = parseOrderVarieties(row, basicInfo.donations);

  // Classify order
  const isSiteOrder = lastName === SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME;
  const classification = classifyDCOrder(isSiteOrder, basicInfo.dcOrderType);

  if (!classification.orderType) {
    recordClassificationWarning(warnings, {
      type: 'UNKNOWN_ORDER_TYPE',
      orderNumber: basicInfo.orderNumber,
      orderType: basicInfo.dcOrderType,
      scout: `${row[DC_COLUMNS.GIRL_FIRST_NAME] || ''} ${lastName}`.trim()
    });
  }

  // Classify payment method
  const paymentMethod = classifyPaymentMethod(basicInfo.paymentStatus);

  if (!paymentMethod) {
    recordClassificationWarning(warnings, {
      type: 'UNKNOWN_PAYMENT_METHOD',
      orderNumber: basicInfo.orderNumber,
      paymentStatus: basicInfo.paymentStatus,
      scout: `${row[DC_COLUMNS.GIRL_FIRST_NAME] || ''} ${lastName}`.trim()
    });
  }

  return buildOrderObject(basicInfo, varieties, classification, paymentMethod);
}

/** Add and classify orders from Digital Cookie */
function addDCOrders(scoutDataset: Map<string, Scout>, rawDCData: Record<string, any>[], warnings: Warning[] = []): void {
  rawDCData.forEach((row: Record<string, any>) => {
    const firstName = row[DC_COLUMNS.GIRL_FIRST_NAME] || '';
    const lastName = row[DC_COLUMNS.GIRL_LAST_NAME] || '';
    const name = `${firstName} ${lastName}`.trim();

    const scout = scoutDataset.get(name);
    if (!scout) return;

    const order = parseAndClassifyOrder(row, lastName, warnings);
    scout.orders.push(order);
  });
}

export { addDCOrders };
