# Implementation Notes

Technical implementation details and patterns for the Cookie Tracker application (v1.3.0).

---

## Architecture

### File Organization

```
src/
├── main.ts                      # Electron main process
├── renderer.ts                  # Data loading & report coordination
├── constants.ts                 # App-wide constants (as const objects)
├── cookie-constants.ts          # Cookie varieties, ID mappings, pricing
├── types.ts                     # TypeScript interfaces & type exports
├── credentials-manager.ts       # Credential encryption (OS keychain)
├── logger.ts                    # Logging utilities
├── scraper-utils.ts             # Web scraping helpers
├── data-reconciler.ts           # Core orchestration & state management
├── renderer/
│   ├── html-builder.ts          # HTML generation utilities
│   ├── ui-controller.ts         # UI interactions & event handling
│   └── reports/                 # Report generation modules
│       ├── troop-summary.ts     # Troop-level summary
│       ├── scout-summary.ts     # Scout-level detail
│       ├── donation-alert.ts    # Cookie Share reconciliation
│       ├── booth.ts             # Booth reservations & allocations
│       ├── inventory.ts         # Inventory tracking
│       └── variety.ts           # Cookie popularity breakdown
├── data-processing/
│   ├── utils.ts                 # Shared utility functions
│   ├── data-importers.ts        # Import & parsing functions
│   └── data-calculators.ts      # Calculation & aggregation
└── scrapers/
    ├── index.ts                 # Scraper orchestration
    ├── digital-cookie.ts        # Digital Cookie API client
    ├── smart-cookie.ts          # Smart Cookie API client
    └── request-utils.ts         # Retry logic & rate limiting
```

### Module Boundaries

- **renderer.ts** coordinates data loading and report generation; **ui-controller.ts** handles UI interactions; **html-builder.ts** provides HTML utilities; **reports/** contains focused report generators.
- **data-reconciler.ts** orchestrates data flow; **data-importers.ts** handles parsing; **data-calculators.ts** handles aggregation; **utils.ts** provides shared helpers.
- Modules have clear boundaries with no circular dependencies.

### Extensibility

- New reports: add a file to `renderer/reports/`
- New data sources: add an importer to `data-processing/data-importers.ts`
- New calculations: add a function to `data-processing/data-calculators.ts`

---

## Type System

### Constants as Source of Truth

All string constants are defined in `constants.ts` using `as const` objects. Types like `OrderType`, `TransferType`, `Owner`, and `PaymentMethod` are derived from these objects and re-exported from `types.ts`. This prevents manual type union drift.

### Key Interfaces

Defined in `types.ts`:
- **Order** — Normalized order from any source, with metadata preserving raw data per source
- **Transfer** — SC transfer record with explicit `category` field (from `TRANSFER_CATEGORY`)
- **Scout** — Per-scout aggregate with orders, inventory, credited allocations, totals, and $ fields
- **OrderMetadata** — Four source-specific raw data slots (`dc`, `sc`, `scReport`, `scApi`)
- **TransferActions** — SC transfer action flags (`submittable`, `approvable`, `saveable`)
- **IDataReconciler** — Interface for the reconciler class

### $ Prefix Convention

Pre-calculated and derived fields use a `$` prefix to distinguish them from raw source data. These are computed in `data-processing/data-calculators.ts` and consumed by reports.

**Scout-level $ fields:**
- `$varietyBreakdowns` — Per-variety counts split by source: fromSales, fromShipped, fromVirtualBooth, fromDirectShip, fromBoothSales
- `$issues` — Data quality flags: negativeInventory array, hasNegativeInventory boolean
- `$cookieShare` — DC donation breakdown: dcTotal, dcAutoSync, dcManualEntry
- `totals.$breakdown` — Splits totalSold into "direct" vs "credited"
- `totals.$orderRevenue` — Revenue from DC orders only (before credited revenue)
- `totals.$inventoryDisplay` — Per-variety inventory for display (positive values only)

---

## Constants and Configuration

All "magic numbers" and string literals are centralized in `constants.ts`:

- `PACKAGES_PER_CASE` (12), `DEFAULT_COUNCIL_ID` ('623'), Excel epoch/ms-per-day for date conversion
- `OWNER`, `ORDER_TYPE`, `PAYMENT_METHOD`, `TRANSFER_TYPE`, `ALLOCATION_METHOD` — Classification dimensions
- `DC_COLUMNS`, `SC_REPORT_COLUMNS`, `SC_API_COLUMNS` — Field name constants for imported data
- `DISPLAY_STRINGS` — UI tooltip/label strings keyed by allocation method
- `HTTP_STATUS`, `UI_TIMING` — HTTP codes and animation durations

Column name constants are used whenever reading fields from imported data, ensuring consistent references across ~85 usage sites.

---

## No Silent Defaults Principle

Financial data must NEVER have silent defaults or assumptions.

Classification functions return `null` for unknown values. The caller handles null by logging warnings or errors. This ensures unknown cookie varieties, payment methods, or order types are immediately visible rather than silently defaulting to incorrect values.

Functions following this principle: `getCookiePrice()`, `classifyPaymentMethod()`, `classifyDCOrder()`, `parseVarietiesFromAPI()`, `getMetadataKey()`.

---

## Data Model

### Order Object

All orders from all sources are normalized into a common shape with fields for order number, scout name/ID, date, type, packages (net and physical), varieties, revenue, payment/ship status, and organizational data. Each order tracks which sources contributed data (DC, SC-Report, SC-API, SC-Transfer) and preserves raw metadata from each source for debugging.

### Transfer Object

SC transfer records stored separately from orders. Key fields: type (from `transfer_type`), category (from `TRANSFER_CATEGORY`), order number, from/to, packages (absolute value), physicalPackages (sum of non-Cookie-Share varieties), physicalVarieties, and amount. The `category` field is assigned at creation time by `classifyTransferCategory()` based on the raw type string and API flags — reports dispatch on category instead of boolean flags.

### Scout Aggregate

Per-scout summaries containing:
- **Identity** — name, firstName, lastName, girlId, isSiteOrder
- **Orders** — Classified with owner, orderType, needsInventory, physicalPackages, donations
- **Inventory** — From physical T2G transfers: total and per-variety breakdown
- **Credited** — Three allocation types: virtualBooth, directShip, boothSales (each with packages, varieties, allocations[])
- **Totals** — Pre-calculated: sales, shipped, credited, donations, totalSold, inventory, revenue
- **$ Fields** — Derived: $varietyBreakdowns, $issues, $cookieShare, totals.$breakdown

---

## Reconciliation Pipeline

### Import Methods

**importDigitalCookie(dcData)** — Parses DC Excel export. Converts Excel serial dates to ISO strings. Extracts varieties from per-variety columns. Calculates net packages (total minus refunded). Normalizes scout names. Merges with existing orders by order number or creates new entries.

**importSmartCookieAPI(scApiData)** — Parses SC JSON from `/orders/search` API. Maps numeric cookie IDs to names using COOKIE_ID_MAP. Takes absolute values of all quantities. Creates transfer records. Uses `transfer_type` field (not `type`). Checks `virtual_booth` flag.

**importSmartCookieReport(scData)** — Parses SC Report Excel. Converts "cases/packages" format to total packages. Maps C1-C11 columns to cookie names. Handles string booleans. Extracts organizational data. Merges with existing orders.

**importSmartCookie(scData)** — Parses SC Transfer Excel. Strips D prefix for order matching. Converts negative quantities to absolute values. Maps abbreviations (ADV, TM, etc.) to standard names.

### Deduplication

Orders are deduplicated by order number (normalized: strip prefixes, convert to string). When a match is found, the new source is appended to the `sources` array and raw data is stored in `metadata` under the appropriate key. Missing fields are filled in from the new source.

### Five-Phase Scout Processing

`buildScoutDataset()` processes scouts in order:

1. **Initialize Scouts** — Creates scout objects from all data sources with empty structures
2. **Add DC Orders** — Classifies orders into owner/orderType dimensions, calculates physical packages
3. **Add Inventory** — Processes physical T2G transfers (using `transfer.category === GIRL_PICKUP` / `GIRL_RETURN`)
4. **Add Allocations** — Adds virtual booth, direct ship, and booth sales credits
5. **Calculate Totals** — Computes all derived totals and $ fields

### Unified Dataset

`buildUnifiedDataset()` returns:
- **scouts** — Complete scout data with all calculated fields
- **troopTotals** — Troop-level aggregates (sold, revenue, inventory, proceeds)
- **transferBreakdowns** — Pre-classified transfer lists (c2t, t2g, sold)
- **varieties** — Per-variety totals and inventory
- **cookieShare** — DC vs SC Cookie Share tracking
- **boothReservations** — Booth reservation data
- **metadata** — Import metadata and warnings

---

## Data Formats

### Smart Cookie API (`SC-*.json`)

JSON from `/webapi/api/orders/search`. Each order contains: `order_id`, `order_number`, `transfer_type` (the actual type — NOT `type` which is always "TRANSFER"), `to`, `from`, `cookies[]` array with numeric `id` and `quantity`, `total` dollar amount, `virtual_booth` boolean, and `date`.

Quantities are negative for OUT transfers. Cookie IDs must be mapped using COOKIE_ID_MAP in `cookie-constants.ts`.

### Digital Cookie (`DC-*.xlsx`)

Excel export with columns defined in `DC_COLUMNS` (constants.ts). Key fields: Girl First/Last Name, Order Number, Order Type, Payment Status, Total Packages, Refunded Packages, Donation, Current Sale Amount, and per-variety columns.

Dates are Excel serial numbers (days since 1900-01-01). Some numbers come as strings — must parse explicitly. "Completed" and "Delivered" both mean finished.

### Smart Cookie Report (`*ReportExport*.xlsx`)

Excel with columns defined in `SC_REPORT_COLUMNS`. Cookie columns C1-C11 use "cases/packages" format. Boolean fields are strings ("TRUE"/"FALSE", "Y"/"N"). Dates are parseable strings. OrderID matches DC Order Number directly.

### Smart Cookie Transfers (`*CookieOrders*.xlsx`)

Excel with abbreviated cookie names (ADV, TM, CD, etc.). Order numbers have prefixes: D for DC orders, S for direct ship. Negative values = OUT transfers. The `!ref` property is often corrupted and may need manual range fixing.

### Cookie Name Mappings

| DC Name | SC Abbreviation | SC Report Column | SC API ID | Price |
|---------|----------------|-----------------|-----------|-------|
| Adventurefuls | ADV | C2 | 48 | $6 |
| Caramel deLites | CD | C8 | 1 | $6 |
| Caramel Chocolate Chip | GFC | C11 | 52 | $7 |
| Exploremores | EXP | C3 | 56 | $6 |
| Lemonades | LEM | C4 | 34 | $6 |
| Peanut Butter Patties | PBP | C7 | 2 | $6 |
| Peanut Butter Sandwich | PBS | C9 | 5 | $6 |
| Thin Mints | TM | C6 | 4 | $6 |
| Trefoils | TRE | C5 | 3 | $6 |
| Cookie Share | CShare | C1 | 37 | $6 |

---

## HTML Generation

### Builder Helpers

`renderer/html-builder.ts` provides shared helpers: horizontal stat cards, table open/close, header rows, data rows. All reports use these rather than constructing HTML directly.

### Tooltip Handling

Variety breakdowns use `data-tooltip` attributes read by Tippy.js. Use actual `\n` characters for line breaks (not `&#10;`). Escape double quotes to `&quot;` before placing in attributes. Always use `getCookieDisplayName()` for variety names in tooltips.

### Performance

HTML generation uses the array join pattern for concatenation. Variety breakdowns are pre-calculated during reconciliation ($ fields) so reports read directly rather than re-iterating orders.

---

## Common Patterns

### Transfer Type Matching

C2T types have suffix variants. Always use `isC2TTransfer()` from `utils.ts` or startsWith check. Never exact equality.

### Sold Package Counting

Include all transfer types except C2T and PLANNED. T2G is the primary sales mechanism. D, DIRECT_SHIP, COOKIE_SHARE are additional sold types.

### Physical Inventory

Use `transfer.category` (from `TRANSFER_CATEGORY`) for dispatch. Physical inventory is affected by `GIRL_PICKUP` (adds to scout) and `GIRL_RETURN` (subtracts from scout). Other T2G categories (VIRTUAL_BOOTH_ALLOCATION, BOOTH_SALES_ALLOCATION, DIRECT_SHIP_ALLOCATION) are credits, not physical movements.

### Auto-Sync Detection

Check both payment status AND order type. Auto-sync requires CAPTURED payment AND (Shipped or Donation-only order type). In-person delivery types never auto-sync.

### Guard Clauses

Use early returns to minimize nesting. Reports check for missing data first, then proceed with main logic.

### Data Reconciler Reset

The DataReconciler accumulates data in memory. Always create a fresh instance before importing data. When loading multiple files, sort by name descending and load only the most recent.

---

## Scraper API Endpoints

### Digital Cookie

```
GET  /login                          → Extract CSRF token from HTML
POST /j_spring_security_check        → Login (form: j_username, j_password, _requestConfirmationToken)
GET  /select-role                    → Parse HTML for role options
GET  /select-role?id={roleId}        → Activate selected role
GET  /ajaxCall/generateReport?reportType=TROOP_ORDER_REPORT&troopId={id}&serviceUnitId={id}&councilId={id}
GET  /ajaxCall/downloadFile/TROOP_ORDER_REPORT/{fileName}  → Download Excel
```

Progress milestones: 10% CSRF → 20% login → 25% role → 40% prepare → 50% generate → 60% download → 70% done.

### Smart Cookie

```
POST /webapi/api/account/login       → Login with credentials
GET  /webapi/api/me                  → Initialize session
GET  /webapi/api/orders/dashboard    → Initialize orders context
POST /webapi/api/orders/search       → Fetch all orders (XSRF token in x-xsrf-token header)
```

XSRF token: extracted from cookie, URL-decode `%7C` to `|`.
