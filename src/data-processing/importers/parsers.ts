// Pure Parsing Functions for cookie data

import { EXCEL_EPOCH, MS_PER_DAY, PACKAGES_PER_CASE } from '../../constants';
import { COOKIE_ABBR_MAP, COOKIE_COLUMN_MAP, COOKIE_ID_MAP, DC_COOKIE_COLUMNS, normalizeCookieName } from '../../cookie-constants';
import Logger from '../../logger';
import type { CookieType, RawDataRow, Varieties } from '../../types';

/** Safely parse an integer, logging a warning if the value is non-empty but not numeric */
export function safeParseInt(value: unknown, context: string): number {
  if (value == null || value === '') return 0;
  const n = parseInt(String(value), 10);
  if (Number.isNaN(n)) {
    Logger.warn(`Non-numeric value "${value}" in ${context} — treating as 0`);
    return 0;
  }
  return n;
}

/** Safely parse a float, logging a warning if the value is non-empty but not numeric */
export function safeParseFloat(value: unknown, context: string): number {
  if (value == null || value === '') return 0;
  const cleaned = String(value).replace(/[$,]/g, '');
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) {
    Logger.warn(`Non-numeric value "${value}" in ${context} — treating as 0`);
    return 0;
  }
  return n;
}

/** Parse cookie varieties from Digital Cookie row */
export function parseVarietiesFromDC(row: RawDataRow): Varieties {
  const varieties: Record<string, number> = {};
  for (const columnName of DC_COOKIE_COLUMNS) {
    const count = safeParseInt(row[columnName], `DC variety "${columnName}"`);
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
  }
  return varieties as Varieties;
}

/** Parse cookie varieties from Smart Cookie Report row */
export function parseVarietiesFromSCReport(row: RawDataRow): { varieties: Varieties; totalCases: number; totalPackages: number } {
  const varieties: Record<string, number> = {};
  let totalCases = 0;
  let totalPackages = 0;

  for (const [col, cookieType] of Object.entries(COOKIE_COLUMN_MAP)) {
    const value = row[col] || '0/0';
    const parts = String(value).split('/');
    if (parts.length < 2) {
      Logger.warn(`SC Report variety "${col}" has unexpected format "${value}" (expected "cases/packages") — treating as 0`);
    }
    const cases = safeParseInt(parts[0], `SC Report "${col}" cases`);
    const packages = safeParseInt(parts[1], `SC Report "${col}" packages`);
    const total = cases * PACKAGES_PER_CASE + packages;

    if (total > 0) {
      varieties[cookieType] = total;
    }
    totalCases += Math.abs(cases);
    totalPackages += Math.abs(total);
  }

  return { varieties: varieties as Varieties, totalCases, totalPackages };
}

/** Parse cookie varieties from Smart Cookie API cookies array */
export function parseVarietiesFromAPI(
  cookiesArray: Array<{ id?: number; cookieId?: number; quantity: number }> | null | undefined,
  dynamicCookieIdMap: Record<string, CookieType> | null | undefined = null
): { varieties: Varieties; totalPackages: number; unknownCookieIds: number[] } {
  const varieties: Record<string, number> = {};
  let totalPackages = 0;
  const unknownCookieIds: number[] = [];
  const idMap = dynamicCookieIdMap || COOKIE_ID_MAP;

  for (const cookie of cookiesArray || []) {
    const cookieId = cookie.id || cookie.cookieId;
    if (cookieId === undefined) continue;
    const cookieName = idMap[cookieId];
    const qty = Math.abs(cookie.quantity);

    if (!cookieName && cookieId && cookie.quantity !== 0) {
      Logger.warn(`Unknown cookie ID ${cookieId} with quantity ${cookie.quantity}. Update COOKIE_ID_MAP in cookie-constants.ts`);
      unknownCookieIds.push(cookieId);
      // Still count in totalPackages so transfer.packages reflects actual movement
      totalPackages += qty;
    }

    if (cookieName && cookie.quantity !== 0) {
      varieties[cookieName] = qty;
      totalPackages += qty;
    }
  }

  return { varieties: varieties as Varieties, totalPackages, unknownCookieIds };
}

/** Parse cookie varieties from Smart Cookie transfer row */
export function parseVarietiesFromSCTransfer(row: RawDataRow): Varieties {
  const varieties: Record<string, number> = {};

  for (const [abbr, cookieType] of Object.entries(COOKIE_ABBR_MAP)) {
    const count = safeParseInt(row[abbr], `SC Transfer "${abbr}"`);
    if (count !== 0) {
      varieties[cookieType] = count;
    }
  }

  return varieties as Varieties;
}

/** Parse Excel date number to ISO string */
export function parseExcelDate(excelDate: number | null | undefined): string | null {
  if (!excelDate || typeof excelDate !== 'number') return null;
  return new Date(EXCEL_EPOCH.getTime() + excelDate * MS_PER_DAY).toISOString();
}
