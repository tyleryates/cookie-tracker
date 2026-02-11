// Digital Cookie Import

import { DATA_SOURCES, DC_COLUMNS } from '../../constants';
import type { DataStore } from '../../data-store';
import { mergeOrCreateOrder } from '../../data-store-operations';
import { parseExcelDate, parseVarietiesFromDC } from './parsers';
import { recordImportMetadata, updateScoutData } from './scout-helpers';

/** Import Digital Cookie order data from Excel export */
export function importDigitalCookie(reconciler: DataStore, dcData: Record<string, any>[]): void {
  reconciler.metadata.rawDCData = dcData;

  dcData.forEach((row: Record<string, any>) => {
    const orderNum = String(row[DC_COLUMNS.ORDER_NUMBER]);
    const scout = `${row[DC_COLUMNS.GIRL_FIRST_NAME] || ''} ${row[DC_COLUMNS.GIRL_LAST_NAME] || ''}`.trim();

    const varieties = parseVarietiesFromDC(row);

    const orderData = {
      orderNumber: orderNum,
      scout: scout,
      date: parseExcelDate(row[DC_COLUMNS.ORDER_DATE]) ?? undefined,
      packages: (parseInt(row[DC_COLUMNS.TOTAL_PACKAGES], 10) || 0) - (parseInt(row[DC_COLUMNS.REFUNDED_PACKAGES], 10) || 0),
      amount: parseFloat(row[DC_COLUMNS.CURRENT_SALE_AMOUNT]) || 0,
      status: row[DC_COLUMNS.ORDER_STATUS],
      paymentStatus: row[DC_COLUMNS.PAYMENT_STATUS],
      varieties: varieties
    };

    // Merge or create order (DC is source of truth for order details)
    mergeOrCreateOrder(reconciler, orderNum, orderData, DATA_SOURCES.DIGITAL_COOKIE, row);

    // Register scout
    updateScoutData(reconciler, scout, {});
  });

  recordImportMetadata(reconciler, 'lastImportDC', DATA_SOURCES.DIGITAL_COOKIE, dcData.length);
}
