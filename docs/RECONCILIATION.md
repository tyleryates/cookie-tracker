# Data Reconciliation Implementation

Technical details of the `DataReconciler` class in `data-reconciler.js`.

## Core Architecture

The `DataReconciler` class maintains three primary data structures:

- **orders** (Map) -- keyed by order number, each value is a standardized order object
- **transfers** (Array) -- all Smart Cookie transfer records
- **scouts** (Map) -- keyed by scout name, each value is an aggregated scout summary

Properties prefixed with `$` are calculated/derived fields, computed during `buildUnifiedDataset()`. They are rebuilt on each reconciliation and should never be imported directly.

## Standardized Data Model

### Order Object

All orders from all sources are normalized into a common shape:

```json
{
  "id": "229584475",
  "orderNumber": "229584475",
  "scout": "Charlie Yates",
  "scoutId": 82712,
  "gsusaId": 125877601,
  "gradeLevel": 4,
  "date": "2026-01-28T...",
  "type": "Cookies In Hand",
  "packages": 18,
  "cases": 0,
  "amount": 110.00,
  "status": "Completed",
  "paymentStatus": "CAPTURED",
  "shipStatus": "N/A",
  "includedInIO": "Y",
  "isVirtual": false,
  "varieties": { "Thin Mints": 4, "Caramel deLites": 2 },
  "organization": {
    "troopId": 1234,
    "serviceUnit": "Scripps Ranch",
    "council": "San Diego",
    "district": "Chaparral Shores"
  },
  "sources": ["DC", "SC-Report"],
  "metadata": {
    "dc": { "...original DC row..." },
    "scReport": { "...original SC row..." },
    "scApi": null
  }
}
```

Notable fields:

- **sources** tracks which systems contributed data to this order (e.g., `["DC", "SC-Report"]`).
- **metadata** preserves the original raw row from each source for debugging.
- **paymentStatus** and **shipStatus** are only populated from Digital Cookie data.
- **includedInIO** and **isVirtual** are only populated from Smart Cookie data.

### Transfer Object

Smart Cookie transfer records are stored separately and are not merged with orders:

```json
{
  "id": "T2G-2026-01-28-16491",
  "date": "2026-01-28",
  "type": "T2G",
  "orderNumber": "16491",
  "from": "1234",
  "to": "Charlie Yates",
  "packages": 47,
  "varieties": { "Thin Mints": 15, "Adventurefuls": 3 },
  "amount": 282.00,
  "virtualBooth": false,
  "source": "SC-Transfer"
}
```

The `id` field is constructed as `type-date-orderNumber`. The `packages` value is always positive (absolute value of the raw SC data, which uses negative numbers for OUT transfers).

### Scout Aggregate

Per-scout summaries calculated from orders and transfers:

```json
{
  "name": "Charlie Yates",
  "pickedUp": 47,
  "soldDC": 110,
  "soldSC": 26,
  "revenueDC": 663.90,
  "ordersDC": 16,
  "remaining": -63
}
```

The `remaining` field is `pickedUp - sold`. A negative value means the scout has sold more than they physically received (common when booth credits or direct ship credits are involved).

## Import Methods

### `importDigitalCookie(dcData)`

Parses Digital Cookie Excel export data. Converts Excel serial date numbers to ISO strings. Extracts cookie varieties from the per-variety columns into a varieties object. Calculates net packages by subtracting refunded packages from total packages. Normalizes scout names, handling "Site" orders and empty names. If an order with the same number already exists, merges the DC source into the existing order; otherwise creates a new order entry.

### `importSmartCookie(scData)`

Parses Smart Cookie transfer data. Strips the `D` prefix from Digital Cookie order numbers so they can match DC orders. Converts all quantities to absolute values (SC uses negative numbers for OUT transfers). Maps Smart Cookie abbreviations to standard cookie names (see `cookie-constants.js`). Parses the TO/FROM fields to extract scout names or troop numbers. Stores all records as transfers rather than merging them into orders.

### `importSmartCookieReport(scData)`

Parses Smart Cookie Report exports. Converts the "cases/packages" format (e.g., "2/5") to total packages by computing `(cases * 12) + packages`. Maps SC report column names (C1 through C11) to standard cookie names using the mappings in `cookie-constants.js`. Handles SC string booleans: `"TRUE"`/`"FALSE"` for fields like `CShareVirtual`, and `"Y"`/`"N"` for fields like `IncludedInIO`. Extracts organizational data (TroopID, ServiceUnit, Council). Merges with existing orders when a matching order number is found, adding `"SC-Report"` to the sources array.

### `importSmartCookieAPI(scApiData)`

Parses Smart Cookie JSON returned by the API. Extracts order data from the nested API response structure. Maps API field names to the standardized order format. Merges with existing orders when a matching order number is found, adding `"SC-API"` to the sources array.

## Deduplication Logic

Orders are deduplicated by order number. The process normalizes order numbers by stripping prefixes (like `D`) and converting to strings, then checks if the order already exists in the orders Map.

When an existing order is found, the new source is appended to the `sources` array (if not already present), the raw data is added to `metadata` under the appropriate source key, and any fields that were previously missing are filled in from the new source (e.g., if the existing order had no `scoutId` but the new source provides one, it gets added).

When no existing order is found, a new entry is created in the orders Map.

## Unified Dataset Generation

### `buildUnifiedDataset()` -- Main Entry Point

Called once after all imports complete. Returns a pre-calculated dataset that eliminates redundant calculations across reports.

The returned object contains:

- **scouts** (Map) -- complete scout dataset with all calculated fields
- **siteOrders** -- site order allocations (booth sales)
- **troopTotals** -- troop-level aggregate numbers
- **transferBreakdowns** -- pre-classified transfer lists
- **varieties** -- variety totals and inventory
- **cookieShare** -- Cookie Share tracking
- **metadata** -- import metadata

### Unified Dataset Structure

#### Scout Object Structure

Each scout in the `unified.scouts` Map contains identity info, classified orders, inventory, allocations, calculated totals, and diagnostic fields.

**Identity fields:** `name`, `firstName`, `lastName`, `girlId` (Smart Cookie girl ID), and `isSiteOrder` (true when lastName is "Site").

**Orders array:** Each order includes the `orderNumber`, `date`, classified `type` (GIRL_DELIVERY, GIRL_DIRECT_SHIP, etc.), original `orderType` from DC, `packages`, `physicalPackages` (excludes donations), `donations` (Cookie Share count), `varieties`, `amount`, `status`, `paymentStatus`, `needsInventory` (false for shipped or donation-only orders), and `source`.

**Inventory:** Populated from T2G transfers. Contains `total` (physical packages only) and per-cookie `varieties` breakdown.

**Credited:** Tracks booth and direct ship allocations. Each contains `packages` and `varieties`. These represent sales credit without physical package transfer.

**Totals:** Pre-calculated values including `orders` (count), `sales` (GIRL_DELIVERY physical packages), `shipped` (GIRL_DIRECT_SHIP packages), `credited` (booth + direct ship), `donations` (Cookie Share total), `totalSold` (sales + shipped + donated + credited), `inventory` (net: inventory.total minus sales), and `revenue`.

The `$breakdown` sub-object splits totalSold into `direct` (sales + shipped + donations) and `credited` (booth + direct ship allocations).

**$varietyBreakdowns:** Per-variety package counts split into `fromSales`, `fromShipped`, `fromBooth`, and `fromDirectShip`.

**$issues:** Diagnostic flags. Lists `negativeVarieties` (e.g., "Thin Mints: -3") and sets `hasNegativeInventory` when any variety is oversold.

**$cookieShare:** Cookie Share breakdown with `dcTotal`, `dcAutoSync` (shipped/donation orders with CAPTURED payment), and `dcManualEntry` (cash or in-person orders that need manual entry into SC).

#### Troop Totals Structure

Troop-level aggregates including `orders` (total DC orders), `sold` (packages sold across all transfer types), `revenue`, `inventory` (net troop inventory), `donations` (Cookie Share total), `ordered` (C2T incoming inventory), `allocated` (T2G physical packages), and `siteOrdersPhysical` (booth sales from troop stock).

Also includes a `scouts` sub-object counting `total` scouts, and how many have booth credit, direct ship credit, negative inventory, or Cookie Share.

#### Transfer Breakdowns Structure

Pre-classified transfer arrays: `c2t` (all C2T transfers), `t2g` (all T2G transfers), and `sold` (all sold transfers including T2G, D-prefixed, DIRECT_SHIP, and COOKIE_SHARE).

The `totals` sub-object provides `c2t` (total C2T packages), `t2gPhysical` (T2G physical packages, excluding virtual booth and Cookie Share), and `sold` (total sold packages).

#### Varieties Structure

Contains `byCookie` (total packages sold per variety), `inventory` (net troop inventory per variety, where negative means oversold), `totalPhysical` (excludes Cookie Share), and `totalAll` (includes Cookie Share).

### Five-Phase Scout Processing Pipeline

The `buildScoutDataset()` method processes scouts in five sequential phases:

**Phase 1: Initialize Scouts** (`initializeScouts`) -- Creates scout objects from all data sources (DC and SC) with empty structures. Extracts scout names from Digital Cookie orders and Smart Cookie data, initializes all nested data structures (orders, inventory, credited, totals), and merges girlId from Smart Cookie when available.

**Phase 2: Add DC Orders** (`addDCOrders`) -- Classifies and adds all Digital Cookie orders to the appropriate scout. Parses order details, classifies each order's type (GIRL_DELIVERY, GIRL_DIRECT_SHIP, etc.), calculates physical packages by subtracting donations, determines whether the order needs inventory, and appends the order to the scout's orders array. See [SALES-TYPES.md](SALES-TYPES.md) for the order type classification logic.

**Phase 3: Add Inventory** (`addInventory`) -- Processes T2G transfers to track physical inventory received by scouts. Filters for T2G transfers only, excludes virtual booth credits (handled in Phase 4), excludes Cookie Share (virtual, never physical), and adds physical packages and variety breakdowns to each scout's inventory.

**Phase 4: Add Allocations** (`addAllocations`) -- Adds booth and direct ship allocations, which represent sales credit without physical package transfer. Processes virtual booth credits (T2G with `virtualBooth: true`) into `scout.credited.booth` and direct ship allocations into `scout.credited.directShip`, tracking variety breakdowns for each.

**Phase 5: Calculate Totals** (`calculateScoutTotals`) -- Calculates all derived totals and `$`-prefixed fields. Sums packages by order type, builds `$varietyBreakdowns`, calculates `totalSold` and net inventory, detects negative inventory by variety for `$issues`, computes Cookie Share breakdowns for `$cookieShare`, and splits totals into direct vs. credited for `$breakdown`.

## Virtual Booth Handling

Virtual booth sales are T2G transfers where scouts receive sales credit without physical package transfer. The `virtualBooth: true` flag in Smart Cookie API data indicates this is a booth credit. The scout gets credit for sales but never physically received the packages. These must be tracked in `scout.credited.booth` and `scout.$varietyBreakdowns.fromBooth`, not in physical inventory, to prevent negative inventory and incorrect calculations.

See [EDGE-CASES.md -- Virtual Booth Tracking Buckets](EDGE-CASES.md#virtual-booth-tracking-buckets) for a comprehensive explanation including why they must be excluded from physical inventory and how they appear in reports.
