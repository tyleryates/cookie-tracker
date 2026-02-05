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

## Scout Aggregation

After all imports, calculate per-scout totals:

```javascript
calculateScoutTotals() {
  this.scouts.clear();

  // Process T2G transfers (picked up inventory)
  this.transfers
    .filter(t => t.type === 'T2G')
    .forEach(t => {
      const scout = this.getOrCreateScout(t.to);
      scout.pickedUp += t.packages;
    });

  // Process DC orders (sold packages)
  this.orders.forEach(order => {
    if (order.sources.includes('DC')) {
      const scout = this.getOrCreateScout(order.scout);
      scout.soldDC += order.packages;
      scout.revenueDC += order.amount;
      scout.ordersDC++;
    }
  });

  // Process SC orders (sold packages)
  this.orders.forEach(order => {
    if (order.sources.includes('SC-Report') || order.sources.includes('SC-API')) {
      const scout = this.getOrCreateScout(order.scout);
      scout.soldSC += order.packages;
    }
  });

  // Calculate remaining inventory
  this.scouts.forEach(scout => {
    scout.remaining = scout.pickedUp - scout.soldDC;
  });
}
```

## Virtual Booth Handling

Virtual booth sales are T2G transfers where scouts receive sales credit without physical package transfer. This is a critical distinction for accurate inventory tracking.

### What Are Virtual Booth Sales?

**Definition**: Troop booth sales are allocated to individual scouts as "credits" for selling at a troop booth. Scouts never physically received these packages - the troop managed the inventory.

**Identification**: In Smart Cookie API data, virtual booth transfers have `virtualBooth: true` flag.

**Data Source**:
- The `virtualBooth: true` flag comes from Smart Cookie API JSON response
- Only available in API data (not available in CSV exports)
- Example: `{"virtual_booth": true, "transfer_type": "T2G", "to": "Scout Name", ...}`
- This is why API-based sync is superior to manual CSV import

**Example**: Troop holds booth sale, sells 100 packages. TCM allocates 1-5 packages to each scout who helped at the booth as recognition/credit.

### Why Exclude from Physical Inventory?

Including virtual booth sales in physical inventory calculations would cause:
- **Inflated inventory counts**: Shows scout received packages they never had
- **Negative balances**: Scout appears to have sold more than they received
- **Incorrect net inventory**: Physical inventory tracking becomes meaningless

### Implementation

```javascript
reconciler.transfers.forEach(transfer => {
  if (transfer.type === 'T2G') {
    const isVirtualBooth = transfer.virtualBooth || false;
    const cookieShareCount = transfer.varieties?.['Cookie Share'] || 0;

    if (!isVirtualBooth) {
      // Physical transfer - count toward inventory
      const physicalPackages = (transfer.packages || 0) - cookieShareCount;
      scout.inventory += physicalPackages;

      // Track physical inventory by variety (exclude Cookie Share)
      Object.entries(transfer.varieties || {}).forEach(([variety, count]) => {
        if (variety !== 'Cookie Share') {
          scout.inventoryVarieties[variety] =
            (scout.inventoryVarieties[variety] || 0) + count;
        }
      });
    } else {
      // Virtual booth credit - track separately
      scout.boothCredits += transfer.packages;

      // Track booth varieties separately (not physical inventory)
      Object.entries(transfer.varieties || {}).forEach(([variety, count]) => {
        scout.boothVarieties[variety] =
          (scout.boothVarieties[variety] || 0) + count;
      });
    }
  }
});
```

### Tracking Buckets

The system maintains **four separate variety tracking objects** per scout:

1. **`varieties`**: Physical sales (regular orders requiring inventory)
2. **`inventoryVarieties`**: Physical inventory received (T2G transfers)
3. **`boothVarieties`**: Virtual booth credits (T2G with `virtualBooth: true`)
4. **`shippedVarieties`**: Direct ship orders (no physical inventory needed)

### Display

- **Picked Up column**: Shows only physical inventory (excludes booth credits)
- **Booth Sales column**: Shows virtual booth credits separately
- **Net Inventory**: Calculated as `pickedUp - sold` (both physical only)

This separation ensures physical inventory tracking remains accurate while still giving scouts credit for booth participation.

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

```javascript
const reconciler = new DataReconciler();

// Import from all sources
reconciler.importDigitalCookie(dcExcelData);
reconciler.importSmartCookieReport(scReportData);
reconciler.importSmartCookieTransfer(scTransferData);
reconciler.importSmartCookieAPI(scApiJson);

// Calculate aggregates
reconciler.calculateScoutTotals();

// Save
reconciler.save();

// Access data
const allOrders = Array.from(reconciler.orders.values());
const scoutTotals = Array.from(reconciler.scouts.values());
```
