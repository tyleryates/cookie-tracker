# Implementation Notes

Technical implementation details and patterns used in the Cookie Tracker application.

**Cookie Tracker v1.0.0 Implementation Guide**

---

## Table of Contents

1. [Constants and Configuration](#constants-and-configuration)
2. [HTML Generation](#html-generation)
3. [Calculated Fields Pattern](#calculated-fields-pattern)
4. [Performance Optimizations](#performance-optimizations)
5. [Common Patterns](#common-patterns)

---

## Constants and Configuration

### Centralized Constants File

**File:** `constants.js`

All "magic numbers" and configuration values are centralized in a single constants file for maintainability.

**Key Constants:**
```javascript
const PACKAGES_PER_CASE = 12;              // Standard case size
const DEFAULT_COUNCIL_ID = '623';          // Girl Scouts San Diego
const EXCEL_EPOCH = new Date(1899, 11, 30); // Excel date serialization
const MS_PER_DAY = 24 * 60 * 60 * 1000;   // Milliseconds per day

// Cookie pricing (per package)
const COOKIE_PRICING = {
  'Thin Mints': 6,
  'Caramel deLites': 6,
  // ... most varieties are $6
  'Caramel Chocolate Chip': 7  // Special pricing!
};
```

**Usage:**
```javascript
const { PACKAGES_PER_CASE, DEFAULT_COUNCIL_ID } = require('./constants');

// Case calculations
const cases = Math.round(packages / PACKAGES_PER_CASE);

// Default council in credentials
councilId: DEFAULT_COUNCIL_ID
```

**Why Centralized:**
- Single source of truth - update once, applies everywhere
- Easier to maintain across seasons (pricing changes, new councils)
- No "magic numbers" scattered throughout codebase
- Self-documenting (constants have descriptive names)

### String Constant Categories

All string literals used across multiple files are centralized in `constants.js`:

**Available Constants:**
- `ORDER_TYPES` - Internal order type classifications (5 types)
- `DC_COLUMNS` - Digital Cookie Excel column names (12 fields)
- `SC_REPORT_COLUMNS` - Smart Cookie Report CSV column names (15 fields)
- `SC_API_COLUMNS` - Smart Cookie API JSON field names (7 fields)
- `DISPLAY_STRINGS` - UI tooltip/label strings (4 strings)

**See:** `constants.js` for the complete list with all values.

**Usage:**
```javascript
const { DC_COLUMNS, ORDER_TYPES } = require('./constants');

// Parsing Digital Cookie data
const firstName = row[DC_COLUMNS.GIRL_FIRST_NAME];
const lastName = row[DC_COLUMNS.GIRL_LAST_NAME];

// Order type classification
if (order.type === ORDER_TYPES.GIRL_DELIVERY) {
  // Handle girl delivery orders
}
```

**Benefits:**
- Prevents typos in column name strings (~85 instances replaced)
- Single point of update if Girl Scouts changes export formats
- Better IDE autocomplete and documentation
- Type-safe references (easier to add TypeScript later)
- Self-documenting (clear which fields come from which source)

---

## HTML Generation

### HTML Builder Pattern

**File:** `html-builder.js`

Efficient HTML generation using array.join() instead of string concatenation.

**Problem with String Concatenation:**
```javascript
// ❌ SLOW - creates new string object for each +=
let html = '';
html += '<div>';
html += '<p>Text</p>';
html += '</div>';
// 140+ concatenations in generateSummaryReport() = slow for 50+ scouts
```

**Solution - HtmlBuilder:**
```javascript
// ✅ FAST - array operations then single join
const builder = createBuilder();
builder.add('<div>');
builder.add('<p>Text</p>');
builder.add('</div>');
const html = builder.build(); // Single join operation
```

**Performance Impact:**
- Fast report generation for large datasets (50+ scouts)
- Scales well with troop size
- Memory efficient (no intermediate string objects)

**Common Utilities:**
```javascript
const {
  createBuilder,          // Create new HtmlBuilder
  buildVarietyTooltip,    // Standardized tooltip generation
  createHorizontalStats,  // DRY stats display
  startTable,             // Table opening
  createTableHeader,      // Table header row
  createTableRow,         // Table data row
  endTable               // Table closing
} = require('./html-builder');

// Example usage
const builder = createBuilder();
builder.add('<h3>Report Title</h3>');
builder.add(createHorizontalStats([
  { label: 'Total', value: 100, color: '#2196F3' }
]));
builder.add(startTable('table-normal'));
builder.add(createTableHeader(['Name', 'Value']));
// ... add rows
builder.add(endTable());
return builder.build();
```

---

## Calculated Fields Pattern

### $ Prefix Convention

**Pattern:** Pre-calculated/derived fields use `$` prefix to distinguish from source data.

**Why:** Makes it clear which fields are computed vs. raw data from API.

**Where Calculated:**
- `data-reconciler.js` - `calculateScoutTotals()` method (called by buildUnifiedDataset)
- `data-reconciler.js` - `buildUnifiedDataset()` method

**Where Used:**
- All report generation functions in `renderer.js`

#### Complete List of $ Prefix Fields

**Scout-Level Fields:**

```javascript
scout.$varietyBreakdowns = {
  fromSales: {},      // Varieties from GIRL_DELIVERY orders (physical sales)
  fromShipped: {},    // Varieties from GIRL_DIRECT_SHIP orders
  fromBooth: {},      // Varieties from virtual booth credits
  fromDirectShip: {}  // Varieties from direct ship allocations
};

scout.$issues = {
  negativeVarieties: [],      // Array of "Variety: -count" strings
  hasNegativeInventory: false // Boolean flag for report warnings
};

scout.$cookieShare = {
  dcTotal: 23,        // Total Cookie Share from all DC orders
  dcAutoSync: 15,     // Auto-synced (Shipped/Donation + CAPTURED payment)
  dcManualEntry: 8    // Needs manual entry (CASH or In Person delivery)
};

scout.totals.$breakdown = {
  direct: 141,        // sales + shipped + donations
  credited: 18        // booth + directShip allocations
};
```

**Troop-Level Fields:**

Currently no $ prefix fields at troop level (all fields are direct aggregations, not derived).

**Usage Pattern:**

```javascript
// Example: Checking for negative inventory
if (scout.$issues.hasNegativeInventory) {
  console.warn(`Scout ${scout.name} has negative inventory:`, scout.$issues.negativeVarieties);
}

// Example: Displaying variety breakdown
const salesVarieties = scout.$varietyBreakdowns.fromSales;  // Direct access
Object.entries(salesVarieties).forEach(([variety, count]) => {
  console.log(`${variety}: ${count} packages from sales`);
});

// Example: Cookie Share manual entry check
if (scout.$cookieShare.dcManualEntry > 0) {
  alert(`Manual entry needed: ${scout.$cookieShare.dcManualEntry} packages`);
}
```

**Benefits:**
- Clear separation of concerns (source vs computed)
- Easy to identify what's pre-calculated
- Can verify calculations by re-computing from source
- Self-documenting code
- Prevents accidental overwrite of source data

---

## Performance Optimizations

### Report Data Pre-calculation

**Strategy:** Calculate once during data reconciliation, reuse across all reports.

**Before (Slow):**
```javascript
// Each report recalculates variety totals
function generateReport() {
  const salesVarieties = {};
  scout.orders.forEach(order => {
    Object.entries(order.varieties).forEach(([variety, count]) => {
      salesVarieties[variety] = (salesVarieties[variety] || 0) + count;
    });
  });
  // ... repeated for each report
}
```

**After (Fast):**
```javascript
// Calculate once in data-reconciler.js
scout.$varietyBreakdowns = {
  fromSales: {...},    // Pre-calculated
  fromShipped: {...}   // Pre-calculated
};

// Use in reports
function generateReport() {
  const salesVarieties = scout.$varietyBreakdowns.fromSales; // Direct access
}
```

**Impact:**
- Eliminates redundant calculations (same data, multiple reports)
- Reports generate instantly after initial reconciliation
- Unified dataset can be cached/exported

### Transfer Type Filtering

**Pattern:** Explicit exclusion of non-sold transfer types.

Used in `buildTroopTotals()` and `buildTransferBreakdowns()` where we need granular control:

```javascript
// Count T2G first (primary sales mechanism)
if (transfer.type === 'T2G') {
  totalSold += transfer.packages || 0;
}
// Then count other sold types (D, DIRECT_SHIP, COOKIE_SHARE)
// Explicitly exclude C2T (incoming inventory) and PLANNED (future orders)
else if (transfer.type && transfer.packages > 0) {
  const isCtoT = transfer.type === 'C2T' ||
                 transfer.type === 'C2T(P)' ||
                 transfer.type.startsWith('C2T');
  const isPlanned = transfer.type === 'PLANNED';

  if (!isCtoT && !isPlanned) {
    totalSold += transfer.packages || 0;
  }
}
```

**Why This Pattern:**
- Explicit exclusion makes business logic clear
- T2G handled separately (primary sales mechanism)
- Excludes C2T (incoming inventory) and PLANNED (future orders)
- Catches any other sold types (D, DIRECT_SHIP, COOKIE_SHARE) automatically

**See also:** [CRITICAL-BUSINESS-RULES.md - When Packages Are Sold](CRITICAL-BUSINESS-RULES.md#when-packages-are-sold) for business logic explanation

---

## Common Patterns

### Case/Package Conversion

**Pattern:** Always use `PACKAGES_PER_CASE` constant.

```javascript
const { PACKAGES_PER_CASE } = require('./constants');

// Packages to cases
const cases = Math.round(packages / PACKAGES_PER_CASE);

// Cases to packages
const packages = cases * PACKAGES_PER_CASE;

// Display with breakdown
const cases = Math.floor(packages / PACKAGES_PER_CASE);
const remaining = packages % PACKAGES_PER_CASE;
const display = `${cases} case${cases !== 1 ? 's' : ''} + ${remaining} pkg${remaining !== 1 ? 's' : ''}`;
```

### C2T Transfer Type Matching

**Pattern:** Use `startsWith()` for suffix variants.

```javascript
// ✅ CORRECT - handles C2T, C2T(P), and future variants
if (transfer.type.startsWith('C2T')) {
  // This is incoming inventory, not sold
}

// ❌ WRONG - misses C2T(P)
if (transfer.type === 'C2T') {
  // Will miss C2T(P) transfers!
}
```

### Excel Date Parsing

**Pattern:** Use constants for epoch and conversion.

```javascript
const { EXCEL_EPOCH, MS_PER_DAY } = require('./constants');

function parseExcelDate(excelDate) {
  if (!excelDate || typeof excelDate !== 'number') return null;
  return new Date(EXCEL_EPOCH.getTime() + excelDate * MS_PER_DAY).toISOString();
}
```

### HTML Escaping

**Pattern:** Escape user-generated content, skip system values.

```javascript
const { escapeHtml } = require('./html-builder');

// ✅ Escape user input
html += `<td>${escapeHtml(scoutName)}</td>`;

// ✅ Skip for numeric IDs (safe)
html += `<td>${scoutId}</td>`;

// ✅ Skip for known system values
html += `<td>${COOKIE_ORDER[0]}</td>`; // "Thin Mints" from constants
```

### Tooltip Generation

**Pattern:** Use standardized helper for consistency.

```javascript
const { buildVarietyTooltip, buildTooltipAttr } = require('./html-builder');

// Build tooltip text
const tooltipText = buildVarietyTooltip(varieties, sortVarietiesByOrder);

// Add to HTML
const attr = buildTooltipAttr(tooltipText);
html += `<td class="tooltip-cell"${attr}>${total}</td>`;
```

---

## File Organization

```
cookie-tracker/
├── main.js                      # Electron main process
├── renderer.js                  # Data loading & report coordination
├── constants.js                 # App-wide constants
├── cookie-constants.js          # Cookie varieties & mappings
├── credentials-manager.js       # Credential encryption
├── logger.js                    # Logging utilities
├── scraper-utils.js            # Web scraping helpers
├── data-reconciler.js          # Core orchestration & state management
├── renderer/
│   ├── html-builder.js         # HTML generation utilities
│   ├── ui-controller.js        # UI interactions & event handling
│   └── reports/                # Report generation modules
│       ├── troop-summary.js    # Troop-level summary report
│       ├── inventory.js        # Inventory tracking report
│       ├── scout-summary.js    # Scout-level detail report
│       ├── variety.js          # Cookie variety breakdown
│       └── donation-alert.js   # Cookie Share reconciliation
├── data-processing/
│   ├── utils.js                # Shared utility functions
│   ├── data-importers.js       # Import & parsing functions
│   └── data-calculators.js     # Calculation & building functions
├── scrapers/
│   ├── index.js                # Scraper orchestration
│   ├── digital-cookie.js       # Digital Cookie scraper
│   └── smart-cookie.js         # Smart Cookie API scraper
└── docs/
    ├── CRITICAL-BUSINESS-RULES.md  # Business logic documentation
    ├── IMPLEMENTATION-NOTES.md     # This file
    ├── DATA-FORMATS.md             # API reference
    └── ...
```

**Architecture Principles:**

✅ **Separation of Concerns:**
- **renderer.js** - Data loading and report coordination
- **renderer/ui-controller.js** - UI interactions, modals, and event handling
- **renderer/html-builder.js** - HTML/CSS generation utilities
- **renderer/reports/** - Focused report generators (5 specialized modules)
- **data-reconciler.js** - Core orchestration and state management
- **data-processing/data-importers.js** - Data import and parsing functions
- **data-processing/data-calculators.js** - Calculations and aggregations
- **data-processing/utils.js** - Shared utility functions

✅ **Code Quality:**
- Modular architecture (no monolithic files)
- All functions focused and testable
- Clear module boundaries (no circular dependencies)
- Guard clauses used throughout (minimal nesting)
- Centralized constants and utilities

---

## Architecture Benefits

### 1. **Maintainability**
- Small, focused files are easier to understand
- Clear responsibilities reduce cognitive load
- Changes are isolated to specific modules

### 2. **Testability**
- Pure functions can be tested in isolation
- Helper functions are individually testable
- Mock data is easier to construct

### 3. **Extensibility**
- New reports: Add file to `renderer/reports/`
- New data sources: Add importer to `data-processing/data-importers.js`
- New calculations: Add function to `data-processing/data-calculators.js`

### 4. **Performance**
- Pre-calculated fields ($ prefix) avoid redundant computation
- HTML builder uses array.join() for efficient string building
- Data reconciliation happens once, reports reuse results

---

*Cookie Tracker v1.0.0 - Implementation guide for developers*
