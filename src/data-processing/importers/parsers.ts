// Pure Parsing Functions for cookie data

import { EXCEL_EPOCH, MS_PER_DAY, PACKAGES_PER_CASE } from '../../constants';
import { COOKIE_ABBR_MAP, COOKIE_COLUMN_MAP, COOKIE_ID_MAP, DC_COOKIE_COLUMNS, normalizeCookieName } from '../../cookie-constants';
import Logger from '../../logger';
import type { CookieType, Varieties } from '../../types';

/** Parse cookie varieties from Digital Cookie row */
export function parseVarietiesFromDC(row: Record<string, any>): Varieties {
  const varieties: Record<string, number> = {};
  DC_COOKIE_COLUMNS.forEach((columnName) => {
    const count = parseInt(row[columnName], 10) || 0;
    if (count > 0) {
      const cookieType = normalizeCookieName(columnName);
      if (!cookieType) {
        Logger.warn(
          `Unknown cookie variety "${columnName}" in Digital Cookie data. Update COOKIE_NAME_NORMALIZATION in cookie-constants.ts`
        );
      } else {
        varieties[cookieType] = count;
      }
    }
  });
  return varieties as Varieties;
}

/** Parse cookie varieties from Smart Cookie Report row */
export function parseVarietiesFromSCReport(row: Record<string, any>): { varieties: Varieties; totalCases: number; totalPackages: number } {
  const varieties: Record<string, number> = {};
  let totalCases = 0;
  let totalPackages = 0;

  Object.entries(COOKIE_COLUMN_MAP).forEach(([col, cookieType]) => {
    const value = row[col] || '0/0';
    const parts = String(value).split('/');
    const cases = parseInt(parts[0], 10) || 0;
    const packages = parseInt(parts[1], 10) || 0;
    const total = cases * PACKAGES_PER_CASE + packages;

    if (total > 0) {
      varieties[cookieType] = total;
    }
    totalCases += Math.abs(cases);
    totalPackages += Math.abs(total);
  });

  return { varieties: varieties as Varieties, totalCases, totalPackages };
}

/** Parse cookie varieties from Smart Cookie API cookies array */
export function parseVarietiesFromAPI(
  cookiesArray: Array<{ id?: number; cookieId?: number; quantity: number }> | null,
  dynamicCookieIdMap: Record<number, CookieType> | null = null
): { varieties: Varieties; totalPackages: number } {
  const varieties: Record<string, number> = {};
  let totalPackages = 0;
  const idMap = dynamicCookieIdMap || COOKIE_ID_MAP;

  (cookiesArray || []).forEach((cookie) => {
    const cookieId = cookie.id || cookie.cookieId;
    if (cookieId === undefined) return;
    const cookieName = idMap[cookieId];

    if (!cookieName && cookieId && cookie.quantity !== 0) {
      // Unknown cookie ID - log warning to prevent silent data loss
      Logger.warn(`Unknown cookie ID ${cookieId} with quantity ${cookie.quantity}. Update COOKIE_ID_MAP in cookie-constants.ts`);
    }

    if (cookieName && cookie.quantity !== 0) {
      varieties[cookieName] = Math.abs(cookie.quantity);
      totalPackages += Math.abs(cookie.quantity);
    }
  });

  return { varieties: varieties as Varieties, totalPackages };
}

/** Parse cookie varieties from Smart Cookie transfer row */
export function parseVarietiesFromSCTransfer(row: Record<string, any>): Varieties {
  const varieties: Record<string, number> = {};

  Object.entries(COOKIE_ABBR_MAP).forEach(([abbr, cookieType]) => {
    const count = parseInt(row[abbr], 10) || 0;
    if (count !== 0) {
      varieties[cookieType] = count;
    }
  });

  return varieties as Varieties;
}

/** Parse Excel date number to ISO string */
export function parseExcelDate(excelDate: number | null | undefined): string | null {
  if (!excelDate || typeof excelDate !== 'number') return null;
  return new Date(EXCEL_EPOCH.getTime() + excelDate * MS_PER_DAY).toISOString();
}
