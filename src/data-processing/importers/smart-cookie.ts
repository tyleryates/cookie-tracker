// Smart Cookie Import Functions

import { DATA_SOURCES, PACKAGES_PER_CASE, SC_API_COLUMNS, SC_REPORT_COLUMNS, SPECIAL_IDENTIFIERS, TRANSFER_TYPE } from '../../constants';
import type { DataStore } from '../../data-store';
import { createTransfer, mergeOrCreateOrder } from '../../data-store-operations';
import type { SCOrdersResponse } from '../../scrapers/sc-types';
import type { Order, RawDataRow, TransferInput } from '../../types';
import { isC2TTransfer } from '../utils';
import { parseVarietiesFromAPI, parseVarietiesFromSCReport, parseVarietiesFromSCTransfer } from './parsers';
import { mergeDCOrderFromSC, recordImportMetadata, trackScoutFromAPITransfer, updateScoutData } from './scout-helpers';

/** Import Smart Cookie Report data (ReportExport.xlsx) */
export function importSmartCookieReport(store: DataStore, reportData: RawDataRow[]): void {
  for (const row of reportData) {
    const orderNum = String(row[SC_REPORT_COLUMNS.ORDER_ID] || row[SC_REPORT_COLUMNS.REF_NUMBER]);
    const scout = row[SC_REPORT_COLUMNS.GIRL_NAME] || '';

    // Parse varieties from C1-C11 columns (format: "cases/packages")
    const { varieties, totalCases, totalPackages } = parseVarietiesFromSCReport(row);

    // Parse total (also in "cases/packages" format)
    const totalParts = String(row[SC_REPORT_COLUMNS.TOTAL] || '0/0').split('/');
    const fieldCases = parseInt(totalParts[0], 10) || 0;
    const fieldPkgs = parseInt(totalParts[1], 10) || 0;
    const computed = fieldCases * PACKAGES_PER_CASE + fieldPkgs;
    const totalFromField = computed > 0 ? computed : totalPackages;

    const orderData = {
      orderNumber: orderNum,
      scout: scout,
      scoutId: row[SC_REPORT_COLUMNS.GIRL_ID],
      gsusaId: row[SC_REPORT_COLUMNS.GSUSA_ID],
      gradeLevel: row[SC_REPORT_COLUMNS.GRADE_LEVEL],
      date: row[SC_REPORT_COLUMNS.ORDER_DATE],
      packages: totalFromField,
      cases: totalCases,
      varieties: varieties,
      organization: {
        troopId: row[SC_REPORT_COLUMNS.TROOP_ID],
        serviceUnit: row[SC_REPORT_COLUMNS.SERVICE_UNIT_DESC],
        council: row[SC_REPORT_COLUMNS.COUNCIL_DESC],
        district: row[SC_REPORT_COLUMNS.PARAM_TITLE] ? row[SC_REPORT_COLUMNS.PARAM_TITLE].match(/District = ([^;]+)/)?.[1]?.trim() : null
      }
    };

    // Merge or create order with enrichment
    mergeOrCreateOrder(store, orderNum, orderData, DATA_SOURCES.SMART_COOKIE_REPORT, row, (existing: Order, newData: Partial<Order>) => {
      existing.scoutId = newData.scoutId;
      existing.gsusaId = newData.gsusaId;
      existing.gradeLevel = newData.gradeLevel;
      existing.cases = newData.cases;
      existing.organization = {
        troopId: newData.organization?.troopId,
        serviceUnit: newData.organization?.serviceUnit,
        council: newData.organization?.council,
        district: newData.organization?.district
      };
    });

    // Register scout with metadata
    updateScoutData(store, scout, {
      scoutId: orderData.scoutId,
      gsusaId: orderData.gsusaId,
      gradeLevel: orderData.gradeLevel,
      serviceUnit: orderData.organization?.serviceUnit
    });
  }

  recordImportMetadata(store, 'lastImportSCReport', DATA_SOURCES.SMART_COOKIE_REPORT, reportData.length);
}

/** Import Smart Cookie orders from /orders/search API endpoint */
export function importSmartCookieOrders(store: DataStore, ordersData: SCOrdersResponse): void {
  const orders = ordersData.orders || [];

  for (const order of orders) {
    // Handle both old format and new /orders/search API format
    // Use transfer_type for actual transfer type (C2T(P), T2G, D, etc.)
    // order.type is just "TRANSFER" for all transfers
    const type = order.transfer_type || order.type || order.orderType || '';
    const orderNum = String(order.order_number || order.orderNumber || '');
    const to = order.to || '';
    const from = order.from || '';

    // Parse varieties from cookies array
    // Handle both formats: cookies[].id (new API) or cookies[].cookieId (old format)
    const { varieties, totalPackages, unknownCookieIds } = parseVarietiesFromAPI(order.cookies);
    for (const id of unknownCookieIds) {
      store.metadata.warnings.push({
        type: 'UNKNOWN_COOKIE_ID',
        message: `Unknown cookie ID ${id} in order ${orderNum}`,
        orderNumber: orderNum
      });
    }

    const date = order.date || order.createdDate || '';
    const totalValue = String(order.total ?? order.totalPrice ?? '0');

    const transferData = {
      date,
      type: type,
      orderNumber: orderNum,
      from: from,
      to: to,
      packages: totalPackages,
      cases: Math.round(Math.abs(order.total_cases || 0) / PACKAGES_PER_CASE), // Convert packages to cases
      varieties: varieties,
      amount: Math.abs(parseFloat(totalValue) || 0),
      virtualBooth: order.virtual_booth || false,
      boothDivider: !!(order.smart_divider_id && !order.virtual_booth),
      status: order.status || '',
      actions: order.actions || {},
      troopNumber: store.troopNumber || undefined,
      troopName: store.troopName || undefined
    };

    store.transfers.push(createTransfer(transferData as TransferInput));

    if (orderNum.startsWith(SPECIAL_IDENTIFIERS.DC_ORDER_PREFIX)) {
      mergeDCOrderFromSC(store, orderNum, to, transferData, varieties, DATA_SOURCES.SMART_COOKIE_API, order as Record<string, unknown>);
    }

    trackScoutFromAPITransfer(store, type, to, from);
  }

  recordImportMetadata(store, 'lastImportSC', DATA_SOURCES.SMART_COOKIE_API, orders.length);
}

/** Import Smart Cookie data */
export function importSmartCookie(store: DataStore, scData: RawDataRow[]): void {
  for (const row of scData) {
    const type = row[SC_API_COLUMNS.TYPE] || '';
    const orderNum = String(row[SC_API_COLUMNS.ORDER_NUM] || '');
    const to = row[SC_API_COLUMNS.TO] || '';
    const from = row[SC_API_COLUMNS.FROM] || '';

    const varieties = parseVarietiesFromSCTransfer(row);

    const transferData = {
      date: row[SC_API_COLUMNS.DATE],
      type: type,
      orderNumber: orderNum,
      from: from,
      to: to,
      packages: parseInt(row[SC_API_COLUMNS.TOTAL], 10) || 0,
      varieties: varieties,
      amount: parseFloat(row[SC_API_COLUMNS.TOTAL_AMOUNT]) || 0,
      troopNumber: store.troopNumber || undefined,
      troopName: store.troopName || undefined
    };

    store.transfers.push(createTransfer(transferData));

    // Handle Digital Cookie orders in Smart Cookie (COOKIE_SHARE with D prefix)
    if (type.includes(TRANSFER_TYPE.COOKIE_SHARE) && orderNum.startsWith(SPECIAL_IDENTIFIERS.DC_ORDER_PREFIX)) {
      mergeDCOrderFromSC(store, orderNum, to, transferData, varieties, DATA_SOURCES.SMART_COOKIE, row);
    }

    // Extract troop number from C2T transfers (Council to Troop)
    if (isC2TTransfer(type) && to && !store.troopNumber) {
      store.troopNumber = to;
    }

    // Register scout pickups (T2G - Troop to Girl)
    // Check if transfer is FROM troop TO scout (not troop-to-troop)
    if (type === TRANSFER_TYPE.T2G && store.troopNumber && from === store.troopNumber && to !== store.troopNumber) {
      updateScoutData(store, to, {});
    }

    // Register scout returns (G2T - Girl to Troop)
    if (type === TRANSFER_TYPE.G2T && store.troopNumber && to === store.troopNumber && from !== store.troopNumber) {
      updateScoutData(store, from, {});
    }

    // Register scouts from Cookie Share transfers
    if (type.includes(TRANSFER_TYPE.COOKIE_SHARE) && store.troopNumber && from === store.troopNumber) {
      updateScoutData(store, to, {});
    }
  }

  recordImportMetadata(store, 'lastImportSC', DATA_SOURCES.SMART_COOKIE, scData.length);
}
