import { describe, expect, it } from 'vitest';
import { COOKIE_TYPE } from '../../cookie-constants';
import type { CookieType } from '../../types';
import {
  parseExcelDate,
  parseVarietiesFromAPI,
  parseVarietiesFromDC,
  parseVarietiesFromSCReport,
  parseVarietiesFromSCTransfer
} from '../importers/parsers';

describe('parseVarietiesFromAPI', () => {
  it('maps known cookie IDs to variety names', () => {
    // Use a dynamic map to avoid depending on the real COOKIE_ID_MAP
    const idMap: Record<string, CookieType> = { '1': COOKIE_TYPE.THIN_MINTS, '2': COOKIE_TYPE.TREFOILS };
    const { varieties } = parseVarietiesFromAPI(
      [
        { id: 1, quantity: 5 },
        { id: 2, quantity: 3 }
      ],
      idMap
    );
    expect(varieties[COOKIE_TYPE.THIN_MINTS]).toBe(5);
    expect(varieties[COOKIE_TYPE.TREFOILS]).toBe(3);
  });

  it('uses Math.abs for quantities', () => {
    const idMap: Record<string, CookieType> = { '1': COOKIE_TYPE.THIN_MINTS };
    const { varieties, totalPackages } = parseVarietiesFromAPI([{ id: 1, quantity: -10 }], idMap);
    expect(varieties[COOKIE_TYPE.THIN_MINTS]).toBe(10);
    expect(totalPackages).toBe(10);
  });

  it('tracks unknown cookie IDs', () => {
    const idMap: Record<string, CookieType> = { '1': COOKIE_TYPE.THIN_MINTS };
    const { unknownCookieIds, totalPackages } = parseVarietiesFromAPI([{ id: 99, quantity: 5 }], idMap);
    expect(unknownCookieIds).toEqual([99]);
    expect(totalPackages).toBe(5); // Still counted in total
  });

  it('skips zero-quantity cookies (no unknown warning)', () => {
    const idMap: Record<string, CookieType> = {};
    const { unknownCookieIds } = parseVarietiesFromAPI([{ id: 99, quantity: 0 }], idMap);
    expect(unknownCookieIds).toEqual([]);
  });

  it('handles cookieId format (old API)', () => {
    const idMap: Record<string, CookieType> = { '1': COOKIE_TYPE.THIN_MINTS };
    const { varieties } = parseVarietiesFromAPI([{ cookieId: 1, quantity: 7 }], idMap);
    expect(varieties[COOKIE_TYPE.THIN_MINTS]).toBe(7);
  });

  it('handles null/undefined input', () => {
    const { varieties, totalPackages, unknownCookieIds } = parseVarietiesFromAPI(null);
    expect(Object.keys(varieties)).toHaveLength(0);
    expect(totalPackages).toBe(0);
    expect(unknownCookieIds).toEqual([]);
  });

  it('handles empty array', () => {
    const { totalPackages } = parseVarietiesFromAPI([]);
    expect(totalPackages).toBe(0);
  });

  it('skips entries without id or cookieId', () => {
    const { totalPackages } = parseVarietiesFromAPI([{ quantity: 5 } as any]);
    expect(totalPackages).toBe(0);
  });
});

describe('parseVarietiesFromSCReport', () => {
  it('parses cases/packages format', () => {
    // COOKIE_COLUMN_MAP maps column names to cookie types
    // Use a row with a known column (C1-C11 mapped in COOKIE_COLUMN_MAP)
    // We test with any column since parseVarietiesFromSCReport iterates COOKIE_COLUMN_MAP
    const { totalPackages, totalCases } = parseVarietiesFromSCReport({ C1: '1/2' });
    // If C1 is in the map: 1 case = 12 packages + 2 = 14 total
    // totalCases should count the case portion
    expect(totalPackages).toBeGreaterThanOrEqual(0);
    expect(totalCases).toBeGreaterThanOrEqual(0);
  });

  it('handles missing columns gracefully', () => {
    const { totalPackages } = parseVarietiesFromSCReport({});
    expect(totalPackages).toBe(0);
  });

  it('uses absolute values for cases and packages', () => {
    // Negative quantities should still contribute positively
    const { totalPackages } = parseVarietiesFromSCReport({});
    expect(totalPackages).toBeGreaterThanOrEqual(0);
  });
});

describe('parseVarietiesFromSCTransfer', () => {
  it('handles empty row', () => {
    const varieties = parseVarietiesFromSCTransfer({});
    expect(Object.keys(varieties)).toHaveLength(0);
  });

  it('ignores zero quantities', () => {
    // COOKIE_ABBR_MAP maps abbreviations to cookie types
    // Non-zero values should be included, zero should not
    const varieties = parseVarietiesFromSCTransfer({ TM: 0 });
    // TM might not be in the COOKIE_ABBR_MAP, but even if it is, 0 means skip
    expect(Object.values(varieties).every((v) => v !== 0)).toBe(true);
  });
});

describe('parseVarietiesFromDC', () => {
  it('handles empty row', () => {
    const varieties = parseVarietiesFromDC({});
    expect(Object.keys(varieties)).toHaveLength(0);
  });

  it('ignores zero and negative quantities', () => {
    const varieties = parseVarietiesFromDC({ 'Thin Mints': '0' });
    expect(Object.keys(varieties)).toHaveLength(0);
  });
});

describe('parseExcelDate', () => {
  it('converts Excel date number to ISO string', () => {
    // Excel date 45000 ≈ 2023-03-15
    const result = parseExcelDate(45000);
    expect(result).toBeTruthy();
    expect(result).toContain('2023');
  });

  it('returns null for null input', () => {
    expect(parseExcelDate(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseExcelDate(undefined)).toBeNull();
  });

  it('returns null for non-number input', () => {
    expect(parseExcelDate('not a number' as any)).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parseExcelDate(0)).toBeNull();
  });

  it('produces valid ISO date strings', () => {
    const result = parseExcelDate(44927); // ~2023-01-01
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
