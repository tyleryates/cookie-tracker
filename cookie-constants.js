// Shared Cookie Constants
// Single source of truth for all cookie-related data

// Standard cookie variety display order (used across all reports)
const COOKIE_ORDER = [
  'Thin Mints',
  'Caramel deLites',
  'Peanut Butter Patties',
  'Peanut Butter Sandwich',
  'Trefoils',
  'Adventurefuls',
  'Lemonades',
  'Exploremores',
  'Caramel Chocolate Chip',
  'Cookie Share'  // Virtual donations
];

// Physical cookie types (excludes Cookie Share which is virtual)
const PHYSICAL_COOKIE_TYPES = [
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

// Smart Cookie API numeric ID to cookie name mapping
// Verified against Smart Cookie CSV export
// Can also be fetched dynamically from: GET https://app.abcsmartcookies.com/webapi/api/me/allcookies
// (includes pricing, sequence, and availability data)
const COOKIE_ID_MAP = {
  1: 'Caramel deLites',
  2: 'Peanut Butter Patties',
  3: 'Trefoils',
  4: 'Thin Mints',
  5: 'Peanut Butter Sandwich',
  34: 'Lemonades',
  37: 'Cookie Share',
  48: 'Adventurefuls',
  52: 'Caramel Chocolate Chip',
  56: 'Exploremores'
};

// Smart Cookie Report column mapping (C1-C11)
const COOKIE_COLUMN_MAP = {
  'C1': 'Cookie Share',
  'C2': 'Adventurefuls',
  'C3': 'Exploremores',
  'C4': 'Lemonades',
  'C5': 'Trefoils',
  'C6': 'Thin Mints',
  'C7': 'Peanut Butter Patties',
  'C8': 'Caramel deLites',
  'C9': 'Peanut Butter Sandwich',
  'C11': 'Caramel Chocolate Chip'
};

// Smart Cookie Transfer abbreviation mapping
const COOKIE_ABBR_MAP = {
  'CShare': 'Cookie Share',
  'ADV': 'Adventurefuls',
  'EXP': 'Exploremores',
  'LEM': 'Lemonades',
  'TRE': 'Trefoils',
  'TM': 'Thin Mints',
  'PBP': 'Peanut Butter Patties',
  'CD': 'Caramel deLites',
  'PBS': 'Peanut Butter Sandwich',
  'GFC': 'Caramel Chocolate Chip'
};

module.exports = {
  COOKIE_ORDER,
  PHYSICAL_COOKIE_TYPES,
  COOKIE_ID_MAP,
  COOKIE_COLUMN_MAP,
  COOKIE_ABBR_MAP
};
