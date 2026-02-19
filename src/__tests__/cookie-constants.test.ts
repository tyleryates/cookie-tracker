import { describe, expect, it } from 'vitest';
import { COOKIE_ID_MAP, calculateRevenue, getCookieDisplayName, getTroopProceedsRate, normalizeCookieName } from '../cookie-constants';

describe('normalizeCookieName', () => {
  it('normalizes singular and plural forms', () => {
    expect(normalizeCookieName('Thin Mint')).toBe('THIN_MINTS');
    expect(normalizeCookieName('Thin Mints')).toBe('THIN_MINTS');
  });

  it('normalizes all known cookies', () => {
    expect(normalizeCookieName('Caramel deLites')).toBe('CARAMEL_DELITES');
    expect(normalizeCookieName('Peanut Butter Patties')).toBe('PEANUT_BUTTER_PATTIES');
    expect(normalizeCookieName('Trefoils')).toBe('TREFOILS');
    expect(normalizeCookieName('Adventurefuls')).toBe('ADVENTUREFULS');
    expect(normalizeCookieName('Lemonades')).toBe('LEMONADES');
    expect(normalizeCookieName('Exploremores')).toBe('EXPLOREMORES');
    expect(normalizeCookieName('Caramel Chocolate Chip')).toBe('CARAMEL_CHOCOLATE_CHIP');
    expect(normalizeCookieName('Cookie Share')).toBe('COOKIE_SHARE');
  });

  it('returns null for unknown names', () => {
    expect(normalizeCookieName('Unknown Cookie')).toBeNull();
    expect(normalizeCookieName('')).toBeNull();
  });
});

describe('getCookieDisplayName', () => {
  it('returns display name for known types', () => {
    expect(getCookieDisplayName('THIN_MINTS')).toBe('Thin Mints');
    expect(getCookieDisplayName('COOKIE_SHARE')).toBe('Cookie Share');
  });

  it('returns raw type for unknown types', () => {
    expect(getCookieDisplayName('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('calculateRevenue', () => {
  it('calculates revenue for standard $6 cookies', () => {
    expect(calculateRevenue({ THIN_MINTS: 10 })).toBe(60);
  });

  it('calculates revenue for $7 cookies', () => {
    expect(calculateRevenue({ CARAMEL_CHOCOLATE_CHIP: 5 })).toBe(35);
  });

  it('calculates mixed revenue', () => {
    expect(calculateRevenue({ THIN_MINTS: 2, CARAMEL_CHOCOLATE_CHIP: 3 })).toBe(33);
  });

  it('returns 0 for empty varieties', () => {
    expect(calculateRevenue({})).toBe(0);
  });

  it('includes Cookie Share at $6', () => {
    expect(calculateRevenue({ COOKIE_SHARE: 4 })).toBe(24);
  });
});

describe('getTroopProceedsRate', () => {
  it('returns 0.85 for PGA under 200', () => {
    expect(getTroopProceedsRate(0)).toBe(0.85);
    expect(getTroopProceedsRate(199)).toBe(0.85);
  });

  it('returns 0.90 for PGA 200-349', () => {
    expect(getTroopProceedsRate(200)).toBe(0.9);
    expect(getTroopProceedsRate(349)).toBe(0.9);
  });

  it('returns 0.95 for PGA 350+', () => {
    expect(getTroopProceedsRate(350)).toBe(0.95);
    expect(getTroopProceedsRate(1000)).toBe(0.95);
  });
});

describe('COOKIE_ID_MAP', () => {
  it('maps SC API IDs to cookie types', () => {
    expect(COOKIE_ID_MAP[4]).toBe('THIN_MINTS');
    expect(COOKIE_ID_MAP[1]).toBe('CARAMEL_DELITES');
    expect(COOKIE_ID_MAP[37]).toBe('COOKIE_SHARE');
    expect(COOKIE_ID_MAP[52]).toBe('CARAMEL_CHOCOLATE_CHIP');
  });
});
