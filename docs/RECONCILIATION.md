# Data Reconciliation Implementation

Technical details of the `DataReconciler` class implementation.

## Core Architecture

The `DataReconciler` class (`data-reconciler.js`) maintains three primary data structures:

```javascript
{
  orders: Map,      // Key: order number → standardized order object
  transfers: Array, // All SC transfer records
  scouts: Map       // Key: scout name → aggregated scout data
}
```

## Standardized Data Model

### Order Object

All orders from all sources are normalized into this format:

```javascript
{
  id: "229584475",                    // Unique identifier
  orderNumber: "229584475",           // Original order number
  scout: "Charlie Yates",             // Scout name (normalized)
  scoutId: 82712,                     // SC GirlID (if available)
  gsusaId: 125877601,                 // GSUSA ID (if available)
  gradeLevel: 4,                      // Scout grade (if available)
  date: "2026-01-28T...",            // ISO date string
  type: "Cookies In Hand",            // Order type
  packages: 18,                       // Total packages (net of refunds)
  cases: 0,                           // Cases (if from SC Report)
  amount: 110.00,                     // Total amount
  status: "Completed",                // Order status
  paymentStatus: "CAPTURED",          // Payment status (DC only)
  shipStatus: "N/A",                  // Shipping status (DC only)
  includedInIO: "Y",                  // Included in Initial Order (SC only)
  isVirtual: false,                   // Virtual Cookie Share (SC only)
  varieties: {                        // Cookie breakdown
    "Thin Mints": 4,
    "Caramel deLites": 2
  },
  organization: {                     // Organizational hierarchy
    troopId: 1234,
    serviceUnit: "Scripps Ranch",
    council: "San Diego",
    district: "Chaparral Shores"
  },
  sources: ["DC", "SC-Report"],       // Which systems have this order
  metadata: {                         // Original data from each source
    dc: { /* original DC row */ },
    scReport: { /* original SC row */ },
    scApi: null
  }
}
```

### Transfer Object

SC Transfer records are stored separately (not merged with orders):

```javascript
{
  id: "T2G-2026-01-28-16491",        // Unique ID: type-date-orderNum
  date: "2026-01-28",                // Transfer date
  type: "T2G",                       // Transfer type
  orderNumber: "16491",              // Order/transfer number
  from: "1234",                      // Source (troop/scout/warehouse)
  to: "Charlie Yates",               // Destination (scout/troop)
  packages: 47,                      // Total packages (absolute value)
  varieties: {                       // Cookie breakdown
    "Thin Mints": 15,
    "Adventurefuls": 3
  },
  amount: 282.00,                    // Total dollar amount
  virtualBooth: false,               // Virtual booth credit (no physical transfer)
  source: "SC-Transfer"              // Data source
}
```

### Scout Aggregate

Per-scout summaries calculated from orders and transfers:

```javascript
{
  name: "Charlie Yates",             // Scout name
  pickedUp: 47,                      // Total picked up (from T2G)
  soldDC: 110,                       // Packages sold via DC
  soldSC: 26,                        // Packages sold via SC
  revenueDC: 663.90,                 // Revenue from DC
  ordersDC: 16,                      // Number of DC orders
  remaining: -63                     // picked up - sold (negative = oversold)
}
```

## Import Methods

### `importDigitalCookie(dcData)`

Parses Digital Cookie Excel export:

1. **Parse Excel dates**: Convert serial numbers to ISO strings
2. **Extract varieties**: Parse cookie columns into varieties object
3. **Calculate net packages**: Subtract refunded packages
4. **Normalize scout names**: Handle "Site" orders, empty names
5. **Merge or create**: If order exists, merge sources; otherwise create new

**Key transformations**:
```javascript
// Date conversion
const date = this.parseExcelDate(row['Order Date (Central Time)']);

// Net packages
const packages = parseInt(row['Total Packages (Includes Donate & Gift)']) -
                (parseInt(row['Refunded Packages']) || 0);

// Scout name
const scout = `${row['Girl First Name'] || ''} ${row['Girl Last Name'] || ''}`.trim();
```

### `importSmartCookieTransfer(scData)`

Parses Smart Cookie Transfer Excel:

1. **Strip order prefix**: Remove 'D' from Digital Cookie orders
2. **Take absolute values**: All OUT quantities are negative
3. **Map cookie abbreviations**: Convert ADV→Adventurefuls, TM→Thin Mints, etc.
4. **Parse TO/FROM fields**: Extract scout names or troop numbers
5. **Store as transfers**: Don't merge with orders

**Key transformations**:
```javascript
// Remove D prefix
const orderNum = String(row['ORDER #']).replace(/^D/, '');

// Absolute values
const packages = Math.abs(parseInt(row.TOTAL) || 0);

// Cookie mapping
const varieties = {};
if (row.ADV) varieties['Adventurefuls'] = Math.abs(parseInt(row.ADV));
if (row.TM) varieties['Thin Mints'] = Math.abs(parseInt(row.TM));
// ... etc
```

### `importSmartCookieReport(scData)`

Parses Smart Cookie Report Export:

1. **Parse cases/packages format**: "2/5" → 29 packages
2. **Map cookie columns**: C1→Cookie Share, C2→Adventurefuls, etc.
3. **Handle string booleans**: "TRUE"/"FALSE", "Y"/"N"
4. **Extract organizational data**: TroopID, ServiceUnit, Council
5. **Merge with existing orders**: Add SC-Report to sources

**Key transformations**:
```javascript
// Cases/packages parsing
function parseCasesPackages(str) {
  if (!str) return 0;
  const [cases, pkgs] = String(str).split('/').map(n => parseInt(n) || 0);
  return (cases * 12) + pkgs;
}

// Cookie column mapping
const varieties = {};
if (row.C2) varieties['Adventurefuls'] = parseCasesPackages(row.C2);
if (row.C6) varieties['Thin Mints'] = parseCasesPackages(row.C6);
// ... etc

// Boolean strings
const isVirtual = row['CShareVirtual'] === 'TRUE';
const includedInIO = row['IncludedInIO'] === 'Y';
```

### `importSmartCookieAPI(scApiData)`

Parses Smart Cookie JSON from network interception:

1. **Extract from nested structure**: API returns complex nested JSON
2. **Map field names**: API uses different field names than reports
3. **Merge with existing orders**: Add SC-API to sources

## Deduplication Logic

Orders are deduplicated by order number:

1. **Normalize order numbers**: Strip prefixes, convert to string
2. **Check if order exists**: Look up in `orders` Map
3. **If exists**:
   - Add new source to `sources` array
   - Merge metadata (keep all source data)
   - Update fields if new source has more complete data
4. **If new**: Create new order entry

```javascript
mergeOrder(existingOrder, newOrder, newSource) {
  // Add source if not already present
  if (!existingOrder.sources.includes(newSource)) {
    existingOrder.sources.push(newSource);
  }

  // Merge metadata
  existingOrder.metadata[newSource] = newOrder.metadata[newSource];

  // Update fields with more complete data
  if (!existingOrder.scoutId && newOrder.scoutId) {
    existingOrder.scoutId = newOrder.scoutId;
  }
  // ... etc
}
```

## Unified Dataset Generation

### `buildUnifiedDataset()` - Main Entry Point

The primary method for generating pre-calculated report data. Called once after all imports complete, returns a complete dataset with all totals pre-calculated.

**Purpose:** Eliminates redundant calculations across multiple reports by pre-computing all derived values.

**Returns:** Unified dataset object with scouts Map, troop totals, transfer breakdowns, variety aggregates, and Cookie Share tracking.

**Structure:**
```javascript
{
  scouts: Map,                 // Complete scout dataset (see below)
  siteOrders: Object,          // Site order allocations
  troopTotals: Object,         // Troop-level aggregates
  transferBreakdowns: Object,  // Pre-classified transfer lists
  varieties: Object,           // Variety totals and inventory
  cookieShare: Object,         // Cookie Share tracking
  metadata: Object             // Import metadata
}
```

**Usage:**
```javascript
const reconciler = new DataReconciler();
reconciler.importDigitalCookie(dcData);
reconciler.importSmartCookieAPI(scApiData);

// Generate unified dataset with all $ prefix fields calculated
const unified = reconciler.buildUnifiedDataset();

// Access pre-calculated data in reports
const scouts = unified.scouts;  // Map of complete scout data
const totals = unified.troopTotals;  // Troop-level totals
```

### Unified Dataset Structure

#### Scout Object Structure

Each scout in `unified.scouts` Map contains:

```javascript
{
  // Identity
  name: "Scout Name",
  firstName: "Scout",
  lastName: "Name",
  girlId: 12345,           // Smart Cookie girl ID
  isSiteOrder: false,      // true if lastName === "Site"

  // Orders (classified by type)
  orders: [
    {
      orderNumber: "229584475",
      date: "2026-01-28",
      type: "GIRL_DELIVERY",     // Classified: GIRL_DELIVERY, GIRL_DIRECT_SHIP, etc.
      orderType: "Cookies In Hand", // Original DC order type
      packages: 18,
      physicalPackages: 16,      // Excludes donations
      donations: 2,              // Cookie Share
      varieties: { "Thin Mints": 4, ... },
      amount: 110.00,
      status: "Completed",
      paymentStatus: "CAPTURED",
      needsInventory: true,      // false for shipped/donation-only orders
      source: "DC"
    }
  ],

  // Inventory (from T2G transfers)
  inventory: {
    total: 47,                   // Physical packages only
    varieties: {
      "Thin Mints": 15,
      "Adventurefuls": 3
    }
  },

  // Allocations (booth and direct ship credits)
  credited: {
    booth: {
      packages: 12,              // Virtual booth credit
      varieties: { "Thin Mints": 4, ... }
    },
    directShip: {
      packages: 6,               // Direct ship credit
      varieties: { "Lemonades": 2, ... }
    }
  },

  // Calculated totals ($ = calculated/derived fields)
  totals: {
    orders: 16,                  // Number of orders
    sales: 110,                  // GIRL_DELIVERY physical packages
    shipped: 8,                  // GIRL_DIRECT_SHIP packages
    credited: 18,                // booth + directShip
    donations: 23,               // Cookie Share total
    totalSold: 159,              // sales + shipped + donated + credited
    inventory: -63,              // Net inventory (inventory.total - sales)
    revenue: 663.90,             // Total revenue

    $breakdown: {                // $ = calculated
      direct: 141,               // sales + shipped + donations
      credited: 18               // booth + directShip allocations
    }
  },

  // $ Prefix Calculated Fields
  $varietyBreakdowns: {          // $ = calculated/derived
    fromSales: {},               // GIRL_DELIVERY varieties
    fromShipped: {},             // GIRL_DIRECT_SHIP varieties
    fromBooth: {},               // Booth credit varieties
    fromDirectShip: {}           // Direct ship credit varieties
  },

  $issues: {                     // $ = calculated
    negativeVarieties: ["Thin Mints: -3"],
    hasNegativeInventory: true
  },

  $cookieShare: {                // $ = calculated
    dcTotal: 23,                 // Total Cookie Share from DC orders
    dcAutoSync: 15,              // Auto-syncs (Shipped/Donation + CAPTURED)
    dcManualEntry: 8             // Needs manual entry (CASH or In Person)
  }
}
```

#### Troop Totals Structure

```javascript
troopTotals: {
  orders: 125,                   // Total DC orders
  sold: 769,                     // Packages sold (T2G + D + DIRECT_SHIP + COOKIE_SHARE)
  revenue: 4614.00,              // Total revenue
  inventory: 127,                // Net troop inventory
  donations: 45,                 // Cookie Share total
  ordered: 950,                  // C2T pickups (incoming inventory)
  allocated: 698,                // T2G physical packages
  siteOrdersPhysical: 125,       // Booth sales from troop stock

  scouts: {
    total: 23,
    withBoothCredit: 5,
    withDirectShipCredit: 3,
    withNegativeInventory: 2,
    withCookieShare: 8
  }
}
```

#### Transfer Breakdowns Structure

```javascript
transferBreakdowns: {
  c2t: [...],                    // All C2T transfers
  t2g: [...],                    // All T2G transfers
  sold: [...],                   // All sold transfers (T2G + D + DIRECT_SHIP + COOKIE_SHARE)

  totals: {
    c2t: 950,                    // Total C2T packages
    t2gPhysical: 698,            // T2G physical (excludes virtual booth + Cookie Share)
    sold: 769                    // Total sold packages
  }
}
```

#### Varieties Structure

```javascript
varieties: {
  byCookie: {
    "Thin Mints": 250,
    "Caramel deLites": 180,
    "Cookie Share": 45
  },
  inventory: {                   // Net troop inventory by variety
    "Thin Mints": 35,
    "Caramel deLites": -5        // Negative = oversold
  },
  totalPhysical: 724,            // Excludes Cookie Share
  totalAll: 769                  // Includes Cookie Share
}
```

### Five-Phase Scout Processing Pipeline

The `buildScoutDataset()` method processes scouts in five sequential phases:

#### Phase 1: Initialize Scouts
**Method:** `initializeScouts(scoutDataset, rawDCData)`

Creates scout objects from all data sources (DC and SC) with empty structures.

**Actions:**
- Extract scout names from Digital Cookie orders
- Create scout entries from Smart Cookie data
- Initialize all data structures (orders[], inventory, credited, totals)
- Merge girlId from Smart Cookie if available

#### Phase 2: Add DC Orders
**Method:** `addDCOrders(scoutDataset, rawDCData)`

Classify and add all Digital Cookie orders to scouts.

**Actions:**
- Parse order details (packages, varieties, amount)
- Classify order type (GIRL_DELIVERY, GIRL_DIRECT_SHIP, etc.)
- Calculate physical packages (total - donations)
- Determine if order needs inventory
- Add order to scout's orders array

**See:** [SALES-TYPES.md](SALES-TYPES.md) for order type classification logic

#### Phase 3: Add Inventory
**Method:** `addInventory(scoutDataset)`

Process T2G transfers to track physical inventory received by scouts.

**Actions:**
- Filter for T2G transfers only
- Exclude virtual booth credits (handled separately)
- Exclude Cookie Share (virtual, never physical)
- Add physical packages to scout.inventory.total
- Add variety breakdown to scout.inventory.varieties

#### Phase 4: Add Allocations
**Method:** `addAllocations(scoutDataset)`

Add booth and direct ship allocations (credit without physical transfer).

**Actions:**
- Process virtual booth credits (T2G with virtualBooth: true)
- Process direct ship allocations (from site orders)
- Add to scout.credited.booth or scout.credited.directShip
- Track variety breakdown for each allocation type

#### Phase 5: Calculate Totals
**Method:** `calculateScoutTotals(scoutDataset)`

Calculate all derived totals and $ prefix fields.

**Actions:**
- Sum packages by order type (sales, shipped, donations)
- Build $varietyBreakdowns (fromSales, fromShipped, fromBooth, fromDirectShip)
- Calculate totalSold (sales + shipped + donated + credited)
- Calculate net inventory (inventory.total - sales)
- Detect negative inventory by variety ($issues)
- Calculate Cookie Share breakdown ($cookieShare)
- Calculate breakdown (direct vs credited)

## Virtual Booth Handling

Virtual booth sales are T2G transfers where scouts receive sales credit without physical package transfer.

**See [EDGE-CASES.md - Virtual Booth Tracking Buckets](EDGE-CASES.md#virtual-booth-tracking-buckets) for comprehensive explanation including:**
- What virtual booth sales are and why they exist
- Why they must be excluded from physical inventory
- Complete implementation code examples
- Four separate variety tracking objects
- Display patterns in reports

**Quick Summary:**
- `virtualBooth: true` flag in Smart Cookie API indicates booth credit
- Scout gets credit for sales but never physically received packages
- Must track in `scout.credited.booth` and `scout.$varietyBreakdowns.fromBooth`, not physical inventory
- Prevents negative inventory and incorrect calculations

## Persistence

### Save

Save reconciled data to `/data/reconciled/reconciled-data.json`:

1. **Create backup**: Copy existing file to `backup-{timestamp}.json`
2. **Convert Maps to Objects**: JSON doesn't support Map
3. **Write file**: Save complete state

```javascript
save() {
  // Backup existing
  if (fs.existsSync(this.filePath)) {
    const backup = `backup-${Date.now()}.json`;
    fs.copyFileSync(this.filePath, path.join(this.dir, backup));
  }

  // Convert Maps to objects
  const data = {
    orders: Object.fromEntries(this.orders),
    transfers: this.transfers,
    scouts: Object.fromEntries(this.scouts),
    metadata: this.metadata
  };

  // Write
  fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
}
```

### Load

Load from saved file:

1. **Read file**: Parse JSON
2. **Reconstruct Maps**: Convert objects back to Map
3. **Restore state**: Set orders, transfers, scouts, metadata

```javascript
load() {
  const data = JSON.parse(fs.readFileSync(this.filePath));

  this.orders = new Map(Object.entries(data.orders));
  this.transfers = data.transfers;
  this.scouts = new Map(Object.entries(data.scouts));
  this.metadata = data.metadata;
}
```

## Cookie Mappings

### Digital Cookie → Standard Names
```javascript
const DC_NAMES = {
  'Adventurefuls': 'Adventurefuls',
  'Exploremores': 'Exploremores',
  'Lemonades': 'Lemonades',
  'Trefoils': 'Trefoils',
  'Thin Mints': 'Thin Mints',
  'Peanut Butter Patties': 'Peanut Butter Patties',
  'Caramel deLites': 'Caramel deLites',
  'Peanut Butter Sandwich': 'Peanut Butter Sandwich',
  'Caramel Chocolate Chip': 'Caramel Chocolate Chip'
};
```

### Smart Cookie Abbreviations → Standard Names
```javascript
const SC_ABBR = {
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
```

### Smart Cookie Report Columns → Standard Names
```javascript
const SC_REPORT_COLS = {
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
```

## Error Handling

All import methods should handle:

1. **Missing columns**: Check for required columns before parsing
2. **Invalid data types**: Wrap parseInt/parseFloat in try-catch or || 0
3. **Empty rows**: Skip rows with no order number or scout name
4. **Malformed dates**: Validate date parsing results
5. **Corrupted Excel**: Handle Excel range corruption (SC Transfers)

```javascript
try {
  const packages = parseInt(row['Total Packages']) || 0;
  if (packages < 0) {
    console.warn(`Negative packages for order ${orderNum}`);
    return null;
  }
} catch (err) {
  console.error(`Failed to parse packages for order ${orderNum}:`, err);
  return null;
}
```

## Usage Example

**Current API (Recommended):**

```javascript
const reconciler = new DataReconciler();

// Import from all sources
reconciler.importDigitalCookie(dcExcelData);
reconciler.importSmartCookieReport(scReportData);
reconciler.importSmartCookieTransfer(scTransferData);
reconciler.importSmartCookieAPI(scApiJson);

// Build unified dataset (calculates all $ prefix fields)
const unified = reconciler.buildUnifiedDataset();

// Access pre-calculated data
const scouts = unified.scouts;              // Map of complete scout data
const troopTotals = unified.troopTotals;    // Troop-level aggregates
const varieties = unified.varieties;        // Variety totals
const cookieShare = unified.cookieShare;    // Cookie Share tracking

// Save reconciled data
reconciler.save();
```

**Legacy API (Internal Use Only):**

```javascript
// Direct access to raw data structures (not recommended for reports)
const allOrders = Array.from(reconciler.orders.values());
const rawTransfers = reconciler.transfers;

// Low-level scout data (without $ prefix calculations)
const rawScouts = Array.from(reconciler.scouts.values());
```

**Note:** Reports should use the unified dataset from `buildUnifiedDataset()`, not raw data structures, to ensure all calculated fields are available.
