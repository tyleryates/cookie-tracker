// Shared Cookie Constants
// Single source of truth for all cookie-related data

import type { CookieType, Varieties } from './types';

// ============================================================================
// COOKIE TYPE CONSTANTS (Internal IDs - use these in code, not strings)
// ============================================================================

export const COOKIE_TYPE: Record<CookieType, CookieType> = {
  THIN_MINTS: 'THIN_MINTS',
  CARAMEL_DELITES: 'CARAMEL_DELITES',
  PEANUT_BUTTER_PATTIES: 'PEANUT_BUTTER_PATTIES',
  PEANUT_BUTTER_SANDWICH: 'PEANUT_BUTTER_SANDWICH',
  TREFOILS: 'TREFOILS',
  ADVENTUREFULS: 'ADVENTUREFULS',
  LEMONADES: 'LEMONADES',
  EXPLOREMORES: 'EXPLOREMORES',
  CARAMEL_CHOCOLATE_CHIP: 'CARAMEL_CHOCOLATE_CHIP',
  COOKIE_SHARE: 'COOKIE_SHARE' // Virtual donations
};

// Display names for cookie types (for UI rendering)
const COOKIE_DISPLAY_NAMES = {
  [COOKIE_TYPE.THIN_MINTS]: 'Thin Mints',
  [COOKIE_TYPE.CARAMEL_DELITES]: 'Caramel deLites',
  [COOKIE_TYPE.PEANUT_BUTTER_PATTIES]: 'Peanut Butter Patties',
  [COOKIE_TYPE.PEANUT_BUTTER_SANDWICH]: 'Peanut Butter Sandwich',
  [COOKIE_TYPE.TREFOILS]: 'Trefoils',
  [COOKIE_TYPE.ADVENTUREFULS]: 'Adventurefuls',
  [COOKIE_TYPE.LEMONADES]: 'Lemonades',
  [COOKIE_TYPE.EXPLOREMORES]: 'Exploremores',
  [COOKIE_TYPE.CARAMEL_CHOCOLATE_CHIP]: 'Caramel Chocolate Chip',
  [COOKIE_TYPE.COOKIE_SHARE]: 'Cookie Share'
} as { [K in CookieType]: string };

// Standard cookie variety display order (used across all reports)
export const COOKIE_ORDER: readonly CookieType[] = [
  COOKIE_TYPE.THIN_MINTS,
  COOKIE_TYPE.CARAMEL_DELITES,
  COOKIE_TYPE.PEANUT_BUTTER_PATTIES,
  COOKIE_TYPE.PEANUT_BUTTER_SANDWICH,
  COOKIE_TYPE.TREFOILS,
  COOKIE_TYPE.ADVENTUREFULS,
  COOKIE_TYPE.LEMONADES,
  COOKIE_TYPE.EXPLOREMORES,
  COOKIE_TYPE.CARAMEL_CHOCOLATE_CHIP,
  COOKIE_TYPE.COOKIE_SHARE
];

// Physical cookie types (excludes Cookie Share which is virtual)
export const PHYSICAL_COOKIE_TYPES: readonly CookieType[] = [
  COOKIE_TYPE.THIN_MINTS,
  COOKIE_TYPE.CARAMEL_DELITES,
  COOKIE_TYPE.PEANUT_BUTTER_PATTIES,
  COOKIE_TYPE.PEANUT_BUTTER_SANDWICH,
  COOKIE_TYPE.TREFOILS,
  COOKIE_TYPE.ADVENTUREFULS,
  COOKIE_TYPE.LEMONADES,
  COOKIE_TYPE.EXPLOREMORES,
  COOKIE_TYPE.CARAMEL_CHOCOLATE_CHIP
];

// Digital Cookie Excel column names (display names used as column headers)
// These are read from DC export, then normalized to COOKIE_TYPE constants
export const DC_COOKIE_COLUMNS: readonly string[] = [
  'Thin Mints',
  'Caramel deLites',
  'Peanut Butter Patties',
  'Peanut Butter Sandwich',
  'Trefoils',
  'Adventurefuls',
  'Lemonades',
  'Exploremores',
  'Caramel Chocolate Chip'
];

// ============================================================================
// DATA SOURCE MAPPINGS (External formats → Internal COOKIE_TYPE constants)
// ============================================================================

// Smart Cookie API numeric ID to cookie type mapping
// Verified against Smart Cookie CSV export
// Can also be fetched dynamically from: GET https://app.abcsmartcookies.com/webapi/api/me/allcookies
// (includes pricing, sequence, and availability data)
export const COOKIE_ID_MAP: Record<number, CookieType> = {
  1: COOKIE_TYPE.CARAMEL_DELITES,
  2: COOKIE_TYPE.PEANUT_BUTTER_PATTIES,
  3: COOKIE_TYPE.TREFOILS,
  4: COOKIE_TYPE.THIN_MINTS,
  5: COOKIE_TYPE.PEANUT_BUTTER_SANDWICH,
  34: COOKIE_TYPE.LEMONADES,
  37: COOKIE_TYPE.COOKIE_SHARE,
  48: COOKIE_TYPE.ADVENTUREFULS,
  52: COOKIE_TYPE.CARAMEL_CHOCOLATE_CHIP,
  56: COOKIE_TYPE.EXPLOREMORES
};

// Smart Cookie Report column mapping (C1-C11)
export const COOKIE_COLUMN_MAP: Record<string, CookieType> = {
  C1: COOKIE_TYPE.COOKIE_SHARE,
  C2: COOKIE_TYPE.ADVENTUREFULS,
  C3: COOKIE_TYPE.EXPLOREMORES,
  C4: COOKIE_TYPE.LEMONADES,
  C5: COOKIE_TYPE.TREFOILS,
  C6: COOKIE_TYPE.THIN_MINTS,
  C7: COOKIE_TYPE.PEANUT_BUTTER_PATTIES,
  C8: COOKIE_TYPE.CARAMEL_DELITES,
  C9: COOKIE_TYPE.PEANUT_BUTTER_SANDWICH,
  C11: COOKIE_TYPE.CARAMEL_CHOCOLATE_CHIP
};

// Smart Cookie Transfer abbreviation mapping
export const COOKIE_ABBR_MAP: Record<string, CookieType> = {
  CShare: COOKIE_TYPE.COOKIE_SHARE,
  ADV: COOKIE_TYPE.ADVENTUREFULS,
  EXP: COOKIE_TYPE.EXPLOREMORES,
  LEM: COOKIE_TYPE.LEMONADES,
  TRE: COOKIE_TYPE.TREFOILS,
  TM: COOKIE_TYPE.THIN_MINTS,
  PBP: COOKIE_TYPE.PEANUT_BUTTER_PATTIES,
  CD: COOKIE_TYPE.CARAMEL_DELITES,
  PBS: COOKIE_TYPE.PEANUT_BUTTER_SANDWICH,
  GFC: COOKIE_TYPE.CARAMEL_CHOCOLATE_CHIP
};

// ============================================================================
// NORMALIZATION (External string names → Internal COOKIE_TYPE constants)
// ============================================================================

// Cookie variety name normalization map
// Maps all known variations from data sources to COOKIE_TYPE constants
// New variations should be added here when discovered
const COOKIE_NAME_NORMALIZATION: Record<string, CookieType> = {
  // Thin Mints
  'Thin Mint': COOKIE_TYPE.THIN_MINTS,
  'Thin Mints': COOKIE_TYPE.THIN_MINTS,

  // Caramel deLites
  'Caramel deLite': COOKIE_TYPE.CARAMEL_DELITES,
  'Caramel deLites': COOKIE_TYPE.CARAMEL_DELITES,

  // Peanut Butter Patties
  'Peanut Butter Patty': COOKIE_TYPE.PEANUT_BUTTER_PATTIES,
  'Peanut Butter Patties': COOKIE_TYPE.PEANUT_BUTTER_PATTIES,

  // Peanut Butter Sandwich
  'Peanut Butter Sandwich': COOKIE_TYPE.PEANUT_BUTTER_SANDWICH,
  'Peanut Butter Sandwiches': COOKIE_TYPE.PEANUT_BUTTER_SANDWICH,

  // Trefoils
  Trefoil: COOKIE_TYPE.TREFOILS,
  Trefoils: COOKIE_TYPE.TREFOILS,

  // Adventurefuls
  Adventureful: COOKIE_TYPE.ADVENTUREFULS,
  Adventurefuls: COOKIE_TYPE.ADVENTUREFULS,

  // Lemonades
  Lemonade: COOKIE_TYPE.LEMONADES,
  Lemonades: COOKIE_TYPE.LEMONADES,

  // Exploremores
  Exploremore: COOKIE_TYPE.EXPLOREMORES,
  Exploremores: COOKIE_TYPE.EXPLOREMORES,

  // Caramel Chocolate Chip
  'Caramel Chocolate Chip': COOKIE_TYPE.CARAMEL_CHOCOLATE_CHIP,
  'Caramel Chocolate Chips': COOKIE_TYPE.CARAMEL_CHOCOLATE_CHIP,

  // Cookie Share
  'Cookie Share': COOKIE_TYPE.COOKIE_SHARE
};

// ============================================================================
// COOKIE PRICING (Keyed by COOKIE_TYPE constants)
// ============================================================================

// Cookie prices (per package)
// Most cookies are $6, but Caramel Chocolate Chip is $7
const COOKIE_PRICES = {
  [COOKIE_TYPE.THIN_MINTS]: 6,
  [COOKIE_TYPE.CARAMEL_DELITES]: 6,
  [COOKIE_TYPE.PEANUT_BUTTER_PATTIES]: 6,
  [COOKIE_TYPE.PEANUT_BUTTER_SANDWICH]: 6,
  [COOKIE_TYPE.TREFOILS]: 6,
  [COOKIE_TYPE.ADVENTUREFULS]: 6,
  [COOKIE_TYPE.LEMONADES]: 6,
  [COOKIE_TYPE.EXPLOREMORES]: 6,
  [COOKIE_TYPE.CARAMEL_CHOCOLATE_CHIP]: 7, // Premium price
  [COOKIE_TYPE.COOKIE_SHARE]: 6 // Virtual donation
} as { [K in CookieType]: number };

// Troop proceeds per package (what the troop gets to keep)
// Rate depends on Per Girl Average (PGA = packages credited / active girls)

/** Get troop proceeds rate based on Per Girl Average */
export function getTroopProceedsRate(pga: number): number {
  if (pga >= 350) return 0.95;
  if (pga >= 200) return 0.9;
  return 0.85;
}

// First N packages per girl are exempt from troop proceeds
// Only applies to girls who have sold at least 1 package
export const PROCEEDS_EXEMPT_PACKAGES = 50;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize cookie variety name to COOKIE_TYPE constant
 * @param rawName - Raw cookie variety name from data source
 * @returns COOKIE_TYPE constant or null if unknown
 */
export function normalizeCookieName(rawName: string): CookieType | null {
  if (!rawName) return null;

  const normalized = COOKIE_NAME_NORMALIZATION[rawName];
  if (!normalized) {
    // Unknown variety - caller must handle warning
    return null;
  }

  return normalized;
}

/**
 * Get display name for a cookie type
 * @param cookieType - COOKIE_TYPE constant
 * @returns Display name for UI rendering
 */
export function getCookieDisplayName(cookieType: string): string {
  return COOKIE_DISPLAY_NAMES[cookieType as CookieType] || cookieType;
}

/**
 * Get the price for a specific cookie type
 * @param cookieType - COOKIE_TYPE constant
 * @returns Price per package or null if unknown
 */
function getCookiePrice(cookieType: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(COOKIE_PRICES, cookieType)) {
    // Unknown variety - caller must handle warning
    // Do NOT assume $6 - financial tracking requires accuracy
    return null;
  }
  return COOKIE_PRICES[cookieType as CookieType];
}

/**
 * Calculate revenue from varieties object
 * @param varieties - Object with COOKIE_TYPE constants as keys and counts as values
 * @returns Total revenue
 * @throws Error if any variety has unknown price
 */
export function calculateRevenue(varieties: Varieties): number {
  let total = 0;
  Object.entries(varieties).forEach(([cookieType, count]) => {
    const price = getCookiePrice(cookieType);
    if (price === null) {
      const displayName = getCookieDisplayName(cookieType);
      throw new Error(
        `Cannot calculate revenue: unknown price for cookie type "${displayName}" (${cookieType}). Update COOKIE_PRICES in cookie-constants.ts`
      );
    }
    total += count! * price;
  });
  return total;
}
