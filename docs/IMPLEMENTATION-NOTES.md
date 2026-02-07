# Implementation Notes

Technical implementation details and patterns used in the Cookie Tracker application.

**Cookie Tracker v1.2.0 Implementation Guide**

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

All "magic numbers" and configuration values are centralized in a single constants file. Key values include the packages-per-case count (12), the default council ID for Girl Scouts San Diego (`623`), the Excel epoch date (Dec 30, 1899), and milliseconds-per-day for date conversion.

### String Constant Categories

All string literals used across multiple files are also centralized in `constants.js`:

- `ORDER_TYPES` - Internal order type classifications (5 types)
- `DC_COLUMNS` - Digital Cookie Excel column names (12 fields)
- `SC_REPORT_COLUMNS` - Smart Cookie Report CSV column names (15 fields)
- `SC_API_COLUMNS` - Smart Cookie API JSON field names (7 fields)
- `DISPLAY_STRINGS` - UI tooltip/label strings (2 strings)

Column name constants are used whenever reading fields from imported data, ensuring consistent field references and preventing typos across approximately 85 usage sites.

---

## HTML Generation

### HTML Builder Helpers

**File:** `renderer/html-builder.js`

Provides helper functions for consistent HTML generation across reports: horizontal stat cards, table open/close, header rows, and data rows. All report modules use these shared helpers rather than constructing HTML directly.

---

## Calculated Fields Pattern

### $ Prefix Convention

Pre-calculated and derived fields use a `$` prefix to distinguish them from raw source data. These fields are computed in `data-processing/data-calculators.js` (specifically `calculateScoutTotals()` and `buildUnifiedDataset()`) and consumed by all report generation functions in `renderer.js`.

#### Scout-Level $ Fields

- **`$varietyBreakdowns`** - Contains four sub-objects tracking cookie varieties by source: sales (GIRL_DELIVERY orders), shipped (GIRL_DIRECT_SHIP orders), booth (virtual booth credits), and direct ship (direct ship allocations).

- **`$issues`** - Tracks data quality problems. Contains an array of negative variety strings and a boolean flag indicating negative inventory, used to trigger warnings in reports.

- **`$cookieShare`** - Breaks down Cookie Share totals from Digital Cookie into three counts: total, auto-synced (shipped/donation orders with CAPTURED payment status), and manual-entry-needed (cash or in-person delivery orders).

- **`totals.$breakdown`** - Splits the scout's total sold into "direct" (sales + shipped + donations) and "credited" (booth + direct ship allocations).

There are currently no $ prefix fields at the troop level; all troop fields are direct aggregations.

---

## Performance Optimizations

### Report Data Pre-calculation

Variety breakdowns and derived totals are calculated once during data reconciliation and stored as $ prefix fields. Report generators read these pre-calculated values directly rather than re-iterating over orders each time a report is rendered.

### Transfer Type Filtering

When counting sold packages in `buildTroopTotals()` and `buildTransferBreakdowns()`, T2G transfers are counted first as the primary sales mechanism. Other transfer types with positive package counts are then included, explicitly excluding C2T transfers (incoming inventory) and PLANNED transfers (future orders). This explicit-exclusion approach catches current and future sold types automatically while keeping business logic readable.

**See also:** [CRITICAL-BUSINESS-RULES.md - When Packages Are Sold](CRITICAL-BUSINESS-RULES.md#when-packages-are-sold)

---

## Common Patterns

### Case/Package Conversion

All case-to-package and package-to-case conversions use the `PACKAGES_PER_CASE` constant from `constants.js`. Display formatting shows full cases plus remaining packages (e.g., "2 cases + 5 pkgs").

### C2T Transfer Type Matching

C2T transfer types have suffix variants (e.g., `C2T`, `C2T(P)`). Always match using a starts-with check rather than exact equality to handle all current and future variants.

### Excel Date Parsing

Digital Cookie dates are Excel serial numbers (days since the Excel epoch). Conversion multiplies the serial number by milliseconds-per-day and adds it to the epoch constant, both defined in `constants.js`.

### HTML Escaping

User-generated content (scout names, customer data) is escaped via `escapeHtml()` from `html-builder.js` before insertion into HTML. System-generated values like numeric IDs and constant strings do not require escaping.

### Tooltip Generation

Variety breakdowns and other hover details are rendered as newline-delimited text, HTML-escaped, and attached to elements via `data-tooltip` attributes. Tippy.js reads these attributes to display interactive tooltips.

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
│   ├── smart-cookie.js         # Smart Cookie API scraper
│   └── request-utils.js        # Retry logic & rate limiting
└── docs/
    ├── CRITICAL-BUSINESS-RULES.md  # Business logic documentation
    ├── IMPLEMENTATION-NOTES.md     # This file
    ├── DATA-FORMATS.md             # API reference
    └── ...
```

**Architecture Principles:**

- **renderer.js** coordinates data loading and report generation; **ui-controller.js** handles UI interactions; **html-builder.js** provides HTML utilities; **reports/** contains focused report generators.
- **data-reconciler.js** orchestrates data flow; **data-importers.js** handles parsing; **data-calculators.js** handles aggregation; **utils.js** provides shared helpers.
- Modules have clear boundaries with no circular dependencies. Functions use guard clauses to minimize nesting.

### Extensibility

- New reports: add a file to `renderer/reports/`.
- New data sources: add an importer to `data-processing/data-importers.js`.
- New calculations: add a function to `data-processing/data-calculators.js`.

---

*Cookie Tracker v1.2.0 - Implementation guide for developers*
