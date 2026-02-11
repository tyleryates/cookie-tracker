// Smart Cookie Import Functions

import { DATA_SOURCES, PACKAGES_PER_CASE, SC_API_COLUMNS, SC_REPORT_COLUMNS, TRANSFER_TYPE } from '../../constants';
import type { DataStore } from '../../data-store';
import { createTransfer, mergeOrCreateOrder } from '../../data-store-operations';
import type { Order } from '../../types';
import { isC2TTransfer } from '../utils';
import { importAllocations } from './allocations';
import { parseVarietiesFromAPI, parseVarietiesFromSCReport, parseVarietiesFromSCTransfer } from './parsers';
import { mergeDCOrderFromSC, trackScoutFromAPITransfer, updateScoutData } from './scout-helpers';

/** Import Smart Cookie Report data (ReportExport.xlsx) */
export function importSmartCookieReport(reconciler: DataStore, reportData: Record<string, any>[]): void {
  reportData.forEach((row: Record<string, any>) => {
    const orderNum = String(row[SC_REPORT_COLUMNS.ORDER_ID] || row[SC_REPORT_COLUMNS.REF_NUMBER]);
    const scout = row[SC_REPORT_COLUMNS.GIRL_NAME] || '';

    // Parse varieties from C1-C13 columns (format: "cases/packages")
    const { varieties, totalCases, totalPackages } = parseVarietiesFromSCReport(row);

    // Parse total (also in "cases/packages" format)
    const totalParts = String(row[SC_REPORT_COLUMNS.TOTAL] || '0/0').split('/');
    const fieldCases = parseInt(totalParts[0], 10) || 0;
    const fieldPkgs = parseInt(totalParts[1], 10) || 0;
    const totalFromField = fieldCases * PACKAGES_PER_CASE + fieldPkgs || totalPackages;

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
    mergeOrCreateOrder(
      reconciler,
      orderNum,
      orderData,
      DATA_SOURCES.SMART_COOKIE_REPORT,
      row,
      (existing: Order, newData: Partial<Order>) => {
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
      }
    );

    // Register scout with metadata
    updateScoutData(reconciler, scout, {
      scoutId: orderData.scoutId,
      gsusaId: orderData.gsusaId,
      gradeLevel: orderData.gradeLevel,
      serviceUnit: orderData.organization?.serviceUnit
    });
  });

  reconciler.metadata.lastImportSCReport = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.SMART_COOKIE_REPORT,
    date: new Date().toISOString(),
    records: reportData.length
  });
}

/** Import Smart Cookie API data from API endpoints */
export function importSmartCookieAPI(reconciler: DataStore, apiData: Record<string, any>): void {
  const orders = apiData.orders || [];

  orders.forEach((order: Record<string, any>) => {
    // Handle both old format and new /orders/search API format
    // Use transfer_type for actual transfer type (C2T(P), T2G, D, etc.)
    // order.type is just "TRANSFER" for all transfers
    const type = order.transfer_type || order.type || order.orderType || '';
    const orderNum = String(order.order_number || order.orderNumber || '');
    const to = order.to || '';
    const from = order.from || '';

    // Parse varieties from cookies array
    // Handle both formats: cookies[].id (new API) or cookies[].cookieId (old format)
    const { varieties, totalPackages } = parseVarietiesFromAPI(order.cookies);

    const transferData = {
      date: order.date || order.createdDate,
      type: type,
      orderNumber: orderNum,
      from: from,
      to: to,
      packages: totalPackages,
      cases: Math.round(Math.abs(order.total_cases || 0) / PACKAGES_PER_CASE), // Convert packages to cases
      varieties: varieties,
      amount: Math.abs(parseFloat(order.total || order.totalPrice) || 0),
      virtualBooth: order.virtual_booth || false,
      boothDivider: !!(order.smart_divider_id && !order.virtual_booth),
      status: order.status || '',
      actions: order.actions || {}
    };

    reconciler.transfers.push(createTransfer(transferData));

    if (orderNum.startsWith('D')) {
      mergeDCOrderFromSC(reconciler, orderNum, to, transferData, varieties, DATA_SOURCES.SMART_COOKIE_API, order);
    }

    trackScoutFromAPITransfer(reconciler, type, to, from);
  });

  importAllocations(reconciler, apiData);

  reconciler.metadata.lastImportSC = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.SMART_COOKIE_API,
    date: new Date().toISOString(),
    records: orders.length
  });
}

/** Import Smart Cookie data */
export function importSmartCookie(reconciler: DataStore, scData: Record<string, any>[]): void {
  scData.forEach((row: Record<string, any>) => {
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
      amount: parseFloat(row[SC_API_COLUMNS.TOTAL_AMOUNT]) || 0
    };

    reconciler.transfers.push(createTransfer(transferData));

    // Handle Digital Cookie orders in Smart Cookie (COOKIE_SHARE with D prefix)
    if (type.includes('COOKIE_SHARE') && orderNum.startsWith('D')) {
      mergeDCOrderFromSC(reconciler, orderNum, to, transferData, varieties, DATA_SOURCES.SMART_COOKIE, row);
    }

    // Extract troop number from C2T transfers (Council to Troop)
    if (isC2TTransfer(type) && to && !reconciler.troopNumber) {
      reconciler.troopNumber = to;
    }

    // Register scout pickups (T2G - Troop to Girl)
    // Check if transfer is FROM troop TO scout (not troop-to-troop)
    if (type === TRANSFER_TYPE.T2G && reconciler.troopNumber && from === reconciler.troopNumber && to !== reconciler.troopNumber) {
      updateScoutData(reconciler, to, {});
    }

    // Register scout returns (G2T - Girl to Troop)
    if (type === TRANSFER_TYPE.G2T && reconciler.troopNumber && to === reconciler.troopNumber && from !== reconciler.troopNumber) {
      updateScoutData(reconciler, from, {});
    }

    // Register scouts from Cookie Share transfers
    if (type.includes('COOKIE_SHARE') && reconciler.troopNumber && from === reconciler.troopNumber) {
      updateScoutData(reconciler, to, {});
    }
  });

  reconciler.metadata.lastImportSC = new Date().toISOString();
  reconciler.metadata.sources.push({
    type: DATA_SOURCES.SMART_COOKIE,
    date: new Date().toISOString(),
    records: scData.length
  });
}
