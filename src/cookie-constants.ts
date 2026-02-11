// Shared Cookie Constants
// Single source of truth for all cookie-related data
//
// Adding a new cookie: Add one entry to COOKIE_REGISTRY. Everything else derives automatically.

import type { CookieType, Varieties } from './types';

// ============================================================================
// COOKIE REGISTRY — Single source of truth for every cookie property
// ============================================================================

interface CookieRegistryEntry {
  type: CookieType;
  displayName: string;
  price: number;
  isPhysical: boolean;
  dcColumnName: string | null;       // DC Excel column header (null = not in DC export)
  scApiId: number | null;            // SC API numeric ID
  scReportCode: string | null;       // SC Report C1-C11 code
  scTransferAbbr: string | null;     // SC Transfer abbreviation
  sortOrder: number;
  nameVariations: string[];          // All known string variations for normalization
}

const COOKIE_REGISTRY: readonly CookieRegistryEntry[] = [
  {
    type: 'THIN_MINTS', displayName: 'Thin Mints', price: 6, isPhysical: true,
    dcColumnName: 'Thin Mints', scApiId: 4, scReportCode: 'C6', scTransferAbbr: 'TM',
    sortOrder: 0, nameVariations: ['Thin Mint', 'Thin Mints']
  },
  {
    type: 'CARAMEL_DELITES', displayName: 'Caramel deLites', price: 6, isPhysical: true,
    dcColumnName: 'Caramel deLites', scApiId: 1, scReportCode: 'C8', scTransferAbbr: 'CD',
    sortOrder: 1, nameVariations: ['Caramel deLite', 'Caramel deLites']
  },
  {
    type: 'PEANUT_BUTTER_PATTIES', displayName: 'Peanut Butter Patties', price: 6, isPhysical: true,
    dcColumnName: 'Peanut Butter Patties', scApiId: 2, scReportCode: 'C7', scTransferAbbr: 'PBP',
    sortOrder: 2, nameVariations: ['Peanut Butter Patty', 'Peanut Butter Patties']
  },
  {
    type: 'PEANUT_BUTTER_SANDWICH', displayName: 'Peanut Butter Sandwich', price: 6, isPhysical: true,
    dcColumnName: 'Peanut Butter Sandwich', scApiId: 5, scReportCode: 'C9', scTransferAbbr: 'PBS',
    sortOrder: 3, nameVariations: ['Peanut Butter Sandwich', 'Peanut Butter Sandwiches']
  },
  {
    type: 'TREFOILS', displayName: 'Trefoils', price: 6, isPhysical: true,
    dcColumnName: 'Trefoils', scApiId: 3, scReportCode: 'C5', scTransferAbbr: 'TRE',
    sortOrder: 4, nameVariations: ['Trefoil', 'Trefoils']
  },
  {
    type: 'ADVENTUREFULS', displayName: 'Adventurefuls', price: 6, isPhysical: true,
    dcColumnName: 'Adventurefuls', scApiId: 48, scReportCode: 'C2', scTransferAbbr: 'ADV',
    sortOrder: 5, nameVariations: ['Adventureful', 'Adventurefuls']
  },
  {
    type: 'LEMONADES', displayName: 'Lemonades', price: 6, isPhysical: true,
    dcColumnName: 'Lemonades', scApiId: 34, scReportCode: 'C4', scTransferAbbr: 'LEM',
    sortOrder: 6, nameVariations: ['Lemonade', 'Lemonades']
  },
  {
    type: 'EXPLOREMORES', displayName: 'Exploremores', price: 6, isPhysical: true,
    dcColumnName: 'Exploremores', scApiId: 56, scReportCode: 'C3', scTransferAbbr: 'EXP',
    sortOrder: 7, nameVariations: ['Exploremore', 'Exploremores']
  },
  {
    type: 'CARAMEL_CHOCOLATE_CHIP', displayName: 'Caramel Chocolate Chip', price: 7, isPhysical: true,
    dcColumnName: 'Caramel Chocolate Chip', scApiId: 52, scReportCode: 'C11', scTransferAbbr: 'GFC',
    sortOrder: 8, nameVariations: ['Caramel Chocolate Chip', 'Caramel Chocolate Chips']
  },
  {
    type: 'COOKIE_SHARE', displayName: 'Cookie Share', price: 6, isPhysical: false,
    dcColumnName: null, scApiId: 37, scReportCode: 'C1', scTransferAbbr: 'CShare',
    sortOrder: 9, nameVariations: ['Cookie Share']
  }
];

// ============================================================================
// DERIVED EXPORTS — Same names/values as before, computed from registry
// ============================================================================

// COOKIE_TYPE enum: Record<CookieType, CookieType>
export const COOKIE_TYPE: Record<CookieType, CookieType> = Object.fromEntries(
  COOKIE_REGISTRY.map(e => [e.type, e.type])
) as Record<CookieType, CookieType>;

// Standard display order (used across all reports)
export const COOKIE_ORDER: readonly CookieType[] =
  [...COOKIE_REGISTRY].sort((a, b) => a.sortOrder - b.sortOrder).map(e => e.type);

// Physical cookie types (excludes Cookie Share which is virtual)
export const PHYSICAL_COOKIE_TYPES: readonly CookieType[] =
  COOKIE_REGISTRY.filter(e => e.isPhysical).sort((a, b) => a.sortOrder - b.sortOrder).map(e => e.type);

// Digital Cookie Excel column names
export const DC_COOKIE_COLUMNS: readonly string[] =
  COOKIE_REGISTRY.filter(e => e.dcColumnName !== null).sort((a, b) => a.sortOrder - b.sortOrder).map(e => e.dcColumnName!);

// Smart Cookie API numeric ID to cookie type
export const COOKIE_ID_MAP: Record<number, CookieType> = Object.fromEntries(
  COOKIE_REGISTRY.filter(e => e.scApiId !== null).map(e => [e.scApiId!, e.type])
) as Record<number, CookieType>;

// Smart Cookie Report column mapping (C1-C11)
export const COOKIE_COLUMN_MAP: Record<string, CookieType> = Object.fromEntries(
  COOKIE_REGISTRY.filter(e => e.scReportCode !== null).map(e => [e.scReportCode!, e.type])
) as Record<string, CookieType>;

// Smart Cookie Transfer abbreviation mapping
export const COOKIE_ABBR_MAP: Record<string, CookieType> = Object.fromEntries(
  COOKIE_REGISTRY.filter(e => e.scTransferAbbr !== null).map(e => [e.scTransferAbbr!, e.type])
) as Record<string, CookieType>;

// Display names (internal, used by getCookieDisplayName)
const COOKIE_DISPLAY_NAMES: Record<CookieType, string> = Object.fromEntries(
  COOKIE_REGISTRY.map(e => [e.type, e.displayName])
) as Record<CookieType, string>;

// Prices (internal, used by getCookiePrice)
const COOKIE_PRICES: Record<CookieType, number> = Object.fromEntries(
  COOKIE_REGISTRY.map(e => [e.type, e.price])
) as Record<CookieType, number>;

// Name normalization map (internal, used by normalizeCookieName)
const COOKIE_NAME_NORMALIZATION: Record<string, CookieType> = Object.fromEntries(
  COOKIE_REGISTRY.flatMap(e => e.nameVariations.map(v => [v, e.type]))
) as Record<string, CookieType>;

// ============================================================================
// TROOP PROCEEDS
// ============================================================================

/** Get troop proceeds rate based on Per Girl Average */
export function getTroopProceedsRate(pga: number): number {
  if (pga >= 350) return 0.95;
  if (pga >= 200) return 0.9;
  return 0.85;
}

// First N packages per girl are exempt from troop proceeds
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
  return COOKIE_NAME_NORMALIZATION[rawName] || null;
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
        `Cannot calculate revenue: unknown price for cookie type "${displayName}" (${cookieType}). Update COOKIE_REGISTRY in cookie-constants.ts`
      );
    }
    total += count! * price;
  });
  return total;
}
