# Implementation Notes

Technical implementation details and patterns for the Cookie Tracker application.

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
│       ├── available-booths.ts  # Upcoming booth availability
│       ├── inventory.ts         # Inventory tracking
│       └── variety.ts           # Cookie popularity breakdown
├── data-processing/
│   ├── utils.ts                 # Shared helpers (sumPhysicalPackages, isC2TTransfer, etc.)
│   ├── data-importers.ts        # Import & parsing functions
│   ├── data-calculators.ts      # Orchestrator: calls calculators/ in order
│   └── calculators/             # Individual calculation modules
│       ├── index.ts             # Re-exports buildScoutDataset, buildUnifiedDataset
│       ├── scout-initialization.ts  # Phase 1: Create scout objects from all sources
│       ├── order-processing.ts      # Phase 2: Classify & add DC orders to scouts
│       ├── allocation-processing.ts # Phase 3-4: T2G inventory + divider allocations
│       ├── scout-calculations.ts    # Phase 5: Compute totals & derived fields
│       ├── helpers.ts               # Shared: variety merging, scout lookup
│       ├── package-totals.ts        # Transfer-level totals by category
│       ├── troop-totals.ts          # Troop-level aggregates
│       ├── varieties.ts             # Per-variety sold/inventory totals
│       ├── transfer-breakdowns.ts   # Classified transfer lists (c2t, t2g, g2t)
│       ├── cookie-share-tracking.ts # DC vs SC Cookie Share reconciliation
│       ├── site-orders.ts           # Site order allocation tracking
│       └── metadata.ts             # Health checks & warnings
└── scrapers/
    ├── index.ts                 # Scraper orchestration
    ├── digital-cookie.ts        # Digital Cookie API client
    ├── smart-cookie.ts          # Smart Cookie API client
    └── request-utils.ts         # Retry logic & rate limiting
```

### Module Boundaries

- **renderer.ts** coordinates data loading and report generation; **ui-controller.ts** handles UI interactions; **html-builder.ts** provides HTML utilities; **reports/** contains focused report generators.
- **data-reconciler.ts** manages state and transfer creation (including `classifyTransferCategory()`); **data-importers.ts** handles parsing; **data-calculators.ts** orchestrates the calculator modules; **calculators/** contains individual computation modules for each aspect of the unified dataset.
- Modules have clear boundaries with no circular dependencies.

### Extensibility

- New reports: add a file to `renderer/reports/`, wire up in `renderer.ts`
- New data sources: add an importer to `data-processing/data-importers.ts`
- New calculations: add a module to `data-processing/calculators/`, call from `data-calculators.ts`
- New transfer categories: add to `TRANSFER_CATEGORY` in `constants.ts`, update relevant group sets, update `classifyTransferCategory()` in `data-reconciler.ts`

---

## Type System

### Constants as Source of Truth

All string constants are defined in `constants.ts` using `as const` objects. Types like `OrderType`, `TransferType`, `Owner`, and `PaymentMethod` are derived from these objects and re-exported from `types.ts`. This prevents manual type union drift.

### Key Interfaces

Defined in `types.ts`:
- **Order** — Normalized order from any source, with metadata preserving raw data per source
- **Transfer** — SC transfer record with explicit `category` field (from `TRANSFER_CATEGORY`). Stored in `reconciler.transfers[]`. Note: this collection holds both actual inventory transfers (C2T, T2G, G2T) and order/sales records (D, COOKIE_SHARE, DIRECT_SHIP) because the SC API returns all record types through the same `/orders/search` endpoint. The `category` field distinguishes them.
- **TransferInput** — Input type for `createTransfer()`. Extends `Partial<Transfer>` with raw API classification flags (`virtualBooth`, `boothDivider`, `directShipDivider`) that are used by `classifyTransferCategory()` to determine the transfer's category but are NOT stored on the final Transfer object.
- **Scout** — Per-scout aggregate with orders, inventory, credited allocations, totals, and $ fields
- **OrderMetadata** — Four source-specific raw data slots (`dc`, `sc`, `scReport`, `scApi`)
- **TransferActions** — SC transfer action flags (`submittable`, `approvable`, `saveable`)
- **IDataReconciler** — Interface for the reconciler class

### $ Prefix Convention

Pre-calculated and derived fields use a `$` prefix to distinguish them from raw source data. These are computed in `data-processing/data-calculators.ts` and consumed by reports.

**Scout-level $ fields:**
- `$issues` — Data quality flags: negativeInventory array
- `totals.$orderRevenue` — Revenue from DC orders only (before credited revenue)
- `totals.$creditedRevenue` — Revenue from credited allocations (booth, virtual booth, direct ship)
- `totals.$troopProceeds` — Troop proceeds for this scout ($0.90/pkg after first 50 exempt)
- `totals.$proceedsDeduction` — Amount deducted from proceeds for exempt packages
- `totals.$financials` — Cash collected, electronic payments, inventory value, unsold value, cash owed
- `totals.$inventoryDisplay` — Per-variety inventory for display (positive values only)

---

## Constants and Configuration

All "magic numbers" and string literals are centralized in `constants.ts`:

- `PACKAGES_PER_CASE` (12), `DEFAULT_COUNCIL_ID` ('623'), Excel epoch/ms-per-day for date conversion
- `OWNER`, `ORDER_TYPE`, `PAYMENT_METHOD`, `TRANSFER_TYPE`, `TRANSFER_CATEGORY`, `ALLOCATION_METHOD` — Classification dimensions
- `T2G_CATEGORIES`, `TROOP_INVENTORY_IN_CATEGORIES`, `SCOUT_PHYSICAL_CATEGORIES` — Central category group sets (see below)
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

All orders from all sources are normalized into a common shape with fields for order number, scout name/ID, date, packages (net and physical), varieties, revenue, payment/ship status, and organizational data. Each order has `dcOrderType` (raw DC string for display) and `orderType` (classified enum for logic). Each order tracks which sources contributed data (DC, SC-Report, SC-API, SC-Transfer) and preserves raw metadata from each source for debugging.

### Transfer Object

SC transfer records stored separately from orders. Key fields: type (from `transfer_type`), category (from `TRANSFER_CATEGORY`), order number, from/to, packages (absolute value), physicalPackages (sum of non-Cookie-Share varieties), physicalVarieties, and amount. The `category` field is assigned at creation time by `classifyTransferCategory()` based on the raw type string and API flags — reports dispatch on category instead of boolean flags.

### Scout Aggregate

Per-scout summaries containing:
- **Identity** — name, firstName, lastName, girlId, isSiteOrder
- **Orders** — Classified with owner, orderType, needsInventory, physicalPackages, donations
- **Inventory** — From physical T2G transfers: total and per-variety breakdown
- **Credited** — Three allocation types: virtualBooth, directShip, boothSales (each with packages, varieties, allocations[])
- **Totals** — Pre-calculated: sales, shipped, credited, donations, totalSold, inventory
- **$ Fields** — Derived: $issues, totals.$orderRevenue, $creditedRevenue, $troopProceeds, $proceedsDeduction, $financials, $inventoryDisplay

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
- **troopTotals** — Troop-level aggregates (sold, revenue, inventory, proceeds, `packagesSoldFromStock`)
- **transferBreakdowns** — Pre-classified transfer lists (c2t, t2g, g2t)
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

### Transfer Classification (`classifyTransferCategory`)

Every transfer is assigned exactly one `TRANSFER_CATEGORY` at creation time in `data-reconciler.ts`. The function `classifyTransferCategory(type, virtualBooth, boothDivider, directShipDivider)` maps the raw SC API `transfer_type` string plus boolean flags to a category. The boolean flags come from the raw API data (via `TransferInput`) but are NOT stored on the final `Transfer` — only the resolved `category` is kept.

Reports dispatch on `transfer.category` (switch/if) or use the central category group sets (see below) instead of re-deriving from raw fields.

### Category Group Sets

Central `ReadonlySet<TransferCategory>` constants in `constants.ts` that group related categories. Use these instead of repeating category lists across reports — when a new category is added, update the relevant set once.

| Set | Categories | Purpose |
|-----|-----------|---------|
| `T2G_CATEGORIES` | GIRL_PICKUP, VIRTUAL_BOOTH_ALLOCATION, BOOTH_SALES_ALLOCATION, DIRECT_SHIP_ALLOCATION | All T2G sub-types (troop inventory out to scout) |
| `TROOP_INVENTORY_IN_CATEGORIES` | COUNCIL_TO_TROOP, GIRL_RETURN | Transfers that add to troop stock |
| `SCOUT_PHYSICAL_CATEGORIES` | GIRL_PICKUP, GIRL_RETURN | Transfers where physical cookies change hands at scout level |

### Transfer Type Matching

C2T types have suffix variants. Always use `isC2TTransfer()` from `utils.ts` or startsWith check. Never exact equality.

### Physical Package Counting

Use `sumPhysicalPackages(varieties)` from `data-processing/utils.ts` to count non-Cookie-Share packages. This replaces the old subtraction pattern (`packages - cookieShare`) with a positive sum of all non-virtual varieties.

### Physical Inventory

Use `transfer.category` (from `TRANSFER_CATEGORY`) for dispatch. Physical inventory is affected by `GIRL_PICKUP` (adds to scout) and `GIRL_RETURN` (subtracts from scout). Use `SCOUT_PHYSICAL_CATEGORIES.has()` for this check. Other T2G categories (VIRTUAL_BOOTH_ALLOCATION, BOOTH_SALES_ALLOCATION, DIRECT_SHIP_ALLOCATION) are credits, not physical movements.

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
