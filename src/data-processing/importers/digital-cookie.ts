// Digital Cookie Import

import { DATA_SOURCES, DC_COLUMNS } from '../../constants';
import type { DataStore } from '../../data-store';
import { mergeOrCreateOrder } from '../../data-store-operations';
import type { RawDataRow } from '../../types';
import { parseExcelDate, parseVarietiesFromDC, safeParseFloat, safeParseInt } from './parsers';
import { recordImportMetadata, updateScoutData } from './scout-helpers';

/** Import Digital Cookie order data from Excel export */
export function importDigitalCookie(store: DataStore, dcData: RawDataRow[]): void {
  store.rawDCData = dcData;

  for (const row of dcData) {
    const orderNum = String(row[DC_COLUMNS.ORDER_NUMBER]);
    const scout = `${row[DC_COLUMNS.GIRL_FIRST_NAME] || ''} ${row[DC_COLUMNS.GIRL_LAST_NAME] || ''}`.trim();

    const varieties = parseVarietiesFromDC(row);

    const orderData = {
      orderNumber: orderNum,
      scout: scout,
      date: parseExcelDate(row[DC_COLUMNS.ORDER_DATE]) ?? undefined,
      packages:
        safeParseInt(row[DC_COLUMNS.TOTAL_PACKAGES], `DC order ${orderNum} total`) -
        safeParseInt(row[DC_COLUMNS.REFUNDED_PACKAGES], `DC order ${orderNum} refunded`),
      amount: safeParseFloat(row[DC_COLUMNS.CURRENT_SALE_AMOUNT], `DC order ${orderNum} amount`),
      status: row[DC_COLUMNS.ORDER_STATUS],
      paymentStatus: row[DC_COLUMNS.PAYMENT_STATUS],
      varieties: varieties
    };

    // Merge or create order (DC is source of truth for order details)
    mergeOrCreateOrder(store, orderNum, orderData, DATA_SOURCES.DIGITAL_COOKIE, row);

    // Register scout
    updateScoutData(store, scout, {});
  }

  recordImportMetadata(store, 'lastImportDC', DATA_SOURCES.DIGITAL_COOKIE, dcData.length);
}
