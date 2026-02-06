# Data Formats Reference

Complete reference for all data sources and formats in the Girl Scout Cookie Tracker system.

---

## File Types

| File | System | What It Contains |
|------|--------|------------------|
| `OrderDataTroop_*.xlsx` | Digital Cookie | All online orders with customer/payment data |
| `CookieOrders.xlsx` | Smart Cookies | Inventory transfers (C2T, T2G, sales) |
| `ReportExport.xlsx` | Smart Cookies | Order data + scout metadata (IDs, grades) |
| `SC-YYYY-MM-DD-HH-MM-SS.json` | Smart Cookies API | JSON from network interception |

---

## Smart Cookie API Format

**File**: `SC-YYYY-MM-DD-HH-MM-SS.json` (from network interception)

**Note:** API field names are available as constants in `constants.js` under `SC_API_COLUMNS`. See that file for the complete list.

### Data Structure

Smart Cookie API returns JSON from `/orders/search` endpoint with nested structure:

```json
{
  "orders": [
    {
      "order_id": 744215,
      "date": "2026/01/28",
      "order_number": "0016491",
      "type": "TRANSFER",
      "transfer_type": "T2G",
      "to": "Millie Yates",
      "from": "1234",
      "council": { "id": 423 },
      "troop": { "id": null },
      "cookies": [
        { "id": 1, "quantity": -5 },
        { "id": 4, "quantity": -15 },
        { "id": 48, "quantity": -3 }
      ],
      "total_cases": -47,
      "total": -284,
      "virtual_booth": false,
      "status": ""
    }
  ]
}
```

### Critical Edge Cases

**⚠️ CRITICAL: `type` vs `transfer_type` Field**:
- Smart Cookie API returns TWO type fields that serve different purposes
- `type`: ALWAYS contains `"TRANSFER"` for all transfers (generic category, not useful for logic!)
- `transfer_type`: Contains ACTUAL transfer type: `"T2G"`, `"C2T(P)"`, `"D"`, etc.
- **MUST use `transfer_type` field**, not `type` field

**Why two fields?**
- `type` indicates the order category (TRANSFER vs SALE vs PLANNED)
- `transfer_type` indicates the specific transfer mechanism
- For all inventory movements, `type` will be "TRANSFER"
- Only `transfer_type` tells you what kind of transfer it is

```javascript
// ⚠️ CRITICAL: Smart Cookie API returns TWO type fields
// - order.type: ALWAYS "TRANSFER" for all transfers (generic, not useful)
// - order.transfer_type: ACTUAL type like "T2G", "C2T(P)", "D", etc.
//
// ALWAYS use transfer_type for accurate transfer classification
const type = order.transfer_type || order.type || order.orderType || '';
```

**C2T Transfer Type Suffix Variants** ⚠️:
- Smart Cookie API returns C2T transfers with suffix variations:
  - `"C2T"` - Council to Troop (generic)
  - `"C2T(P)"` - Council to Troop (Pickup) - most common
  - May have other suffixes in future
- **MUST use `startsWith('C2T')` pattern** for matching, not exact equality:
```javascript
// ✓ CORRECT - handles all C2T variants
if (transfer.type.startsWith('C2T')) {
  // This is incoming inventory, not sold
}

// ✗ WRONG - misses C2T(P) variant
if (transfer.type === 'C2T') {
  // Will miss C2T(P) transfers!
}
```

**Cookie ID Mapping** ⚠️:
- API uses numeric IDs, NOT cookie names
- **CRITICAL**: Must map IDs to names using verified mapping
- Mapping verified against Smart Cookie CSV export
```javascript
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
```

**How to Verify Cookie ID Mapping:**
If cookie IDs change between seasons or totals don't match:
1. Export a CSV report from Smart Cookie showing variety totals
2. Compare variety quantities in CSV to API data
3. Match numeric IDs to cookie names by comparing quantities
4. Update `COOKIE_ID_MAP` in `cookie-constants.js` if needed

**Note:** This mapping is hardcoded in `cookie-constants.js` for simplicity and performance. IDs are stable within a season but may change between years.

**Virtual Booth Flag** ⚠️:
- `virtual_booth`: Boolean `true` or `false`
- When `true`: Scout receives sales credit but NO physical inventory
- When `false`: Normal physical transfer
- **MUST exclude virtual booth from physical inventory calculations**
```javascript
const isVirtualBooth = order.virtual_booth || false;
if (!isVirtualBooth) {
  // Count toward physical inventory
  scout.inventory += packages;
} else {
  // Track separately - sales credit only
  scout.boothCredits += packages;
}
```

**Negative Quantities** ⚠️:
- All OUT transfers have negative quantities
- Cookie quantities: negative = OUT, positive = IN
- **MUST use `Math.abs()` for display and calculations**
```javascript
const quantity = Math.abs(cookie.quantity);
const total = Math.abs(order.total);
```

**Order Number Format**:
- Internal transfers: `"0016491"` (5-7 digits with leading zeros)
- Digital Cookie orders: `"D229584475"` (D prefix + 9 digits)
- Strip prefix for matching:
```javascript
const orderNum = String(order.order_number || '');
if (orderNum.startsWith('D')) {
  const dcOrderNum = orderNum.substring(1); // Match to Digital Cookie
}
```

**Transfer Type Values**:
- `"T2G"`: Troop to Girl (scout picking up inventory)
- `"C2T(P)"`: Council to Troop, Pickup (troop receiving from council)
- `"D"`: Digital Cookie order synced to Smart Cookie
- Others: Various special cases

**Date Format**:
- Format: `"2026/01/28"` (YYYY/MM/DD string)
- Different from Digital Cookie Excel dates
- Can parse directly with `new Date()`

**Field Name Variations**:
- API has inconsistent field names across endpoints
- `order_number` or `orderNumber`
- `id` or `cookieId` in cookies array
- `total` or `totalPrice`
- **MUST use fallback pattern**:
```javascript
const orderNum = order.order_number || order.orderNumber || '';
const cookieId = cookie.id || cookie.cookieId;
const total = order.total || order.totalPrice || 0;
```

### Expected Fields

**Required**:
- `order_id`: Unique numeric ID
- `order_number`: Transfer/order number
- `transfer_type`: Actual transfer type (NOT `type`)
- `to`: Destination (scout name or troop ID)
- `from`: Source (troop ID or scout name)
- `cookies`: Array of cookie objects
  - `id`: Cookie type ID (numeric)
  - `quantity`: Package count (negative for OUT)
- `total`: Dollar amount (negative for OUT)
- `virtual_booth`: Boolean flag

**Optional**:
- `date`: Transfer date
- `total_cases`: Total cases transferred
- `status`: Order status string
- `council`, `troop`, `cupboard`: Organizational objects

### Parsing Example

```javascript
importSmartCookieAPI(apiData) {
  const orders = apiData.orders || [];

  orders.forEach(order => {
    // Use transfer_type, not type!
    const type = order.transfer_type || order.type || '';
    const orderNum = String(order.order_number || '');

    // Parse cookies using ID mapping
    const varieties = {};
    let totalPackages = 0;

    (order.cookies || []).forEach(cookie => {
      const cookieId = cookie.id || cookie.cookieId;
      const cookieName = COOKIE_ID_MAP[cookieId];

      if (cookieName && cookie.quantity !== 0) {
        varieties[cookieName] = Math.abs(cookie.quantity);
        totalPackages += Math.abs(cookie.quantity);
      }
    });

    // Check virtual booth flag
    const isVirtualBooth = order.virtual_booth || false;

    // Store transfer data
    const transferData = {
      date: order.date,
      type: type,
      orderNumber: orderNum,
      to: order.to,
      from: order.from,
      packages: totalPackages,
      varieties: varieties,
      amount: Math.abs(parseFloat(order.total) || 0),
      virtualBooth: isVirtualBooth,
      source: 'SC-API'
    };
  });
}
```

### Common Mistakes

❌ **Don't:**
- Use `order.type` for transfer type (always "TRANSFER")
- Forget to map cookie IDs to names
- Include virtual booth transfers in physical inventory
- Forget to take absolute value of quantities
- Assume consistent field names across API responses

✅ **Do:**
- Always use `order.transfer_type` for actual type
- Map numeric cookie IDs using COOKIE_ID_MAP
- Track virtual booth separately from physical inventory
- Use Math.abs() for all quantities and totals
- Use fallback pattern for field names

---

## Digital Cookie Format

**File**: `OrderDataTroop_*_YYYY-MM-DD_HH.MM.SS.SSS.xlsx`

### Expected Columns

**Note:** All column names are available as constants in `constants.js` under `DC_COLUMNS`.

**Key Fields:** Girl names, order number, order date/type/status, payment/ship status, cookie varieties, package totals, refunds, donations, and sale amounts.

**Usage:**
```javascript
const { DC_COLUMNS } = require('./constants');
const firstName = row[DC_COLUMNS.GIRL_FIRST_NAME];
const orderNum = row[DC_COLUMNS.ORDER_NUMBER];
```

**See:** `constants.js` → `DC_COLUMNS` for complete field list.

### Critical Edge Cases

**Date Format**: Excel serial dates (46053.55347222222 = days since 1900-01-01)
```javascript
function parseExcelDate(serial) {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}
```

**Order Status Values**:
- `Completed` = finished ✓
- `Delivered` = ALSO finished ✓ (not pending!)
- Both should be treated as completed

**Numeric Fields as Strings**:
- Excel parser returns some numbers as strings
- MUST use `parseInt()` and `parseFloat()` everywhere
```javascript
parseInt(row['Total Packages'])
parseFloat(row['Current Sale Amount'])
```

**Revenue Calculation**:
- `Current Sale Amount` = total including shipping
- `Current Subtotal` = cookie revenue only (excludes S&H)
- `Current S & H` = shipping and handling
```javascript
const cookieRevenue = row['Current Subtotal'];
const shipping = row['Current S & H'];
const totalRevenue = row['Current Sale Amount'];
// Verify: totalRevenue === cookieRevenue + shipping
```

**Cookie Pricing**:
- Most varieties: $6/package
- **Caramel Chocolate Chip: $7/package** ⚠️ (special pricing!)
- Cookie Share (donation): $6/package

**Net Packages**:
- Must subtract `Refunded Packages` from `Total Packages`
```javascript
const netPackages = parseInt(row['Total Packages (Includes Donate & Gift)']) -
                    (parseInt(row['Refunded Packages']) || 0);
```

**Donation Packages**:
- Counted in `Total Packages` but no variety breakdown
- Separate `Donation` field shows count
- Priced at $6/package

**Status Values**:

*Order Status*:
- `Completed` ✅
- `Delivered` ✅ (also means completed!)
- `Pending` ⏳
- `Cancelled` ❌

*Payment Status*:
- `CAPTURED` ✅
- `CASH` ✅
- `PENDING` ⏳

*Ship Status*:
- `Delivered` ✅
- `Shipped` 📦
- `N/A` (for non-shipped orders)

---

## Smart Cookie Transfer Format

**File**: `CookieOrders.xlsx`

### Expected Columns
- `DATE`, `ORDER #`, `TYPE`, `TO`, `FROM`
- Cookie varieties (abbreviated): `CShare`, `ADV`, `EXP`, `LEM`, `TRE`, `TM`, `PBP`, `CD`, `PBS`, `GFC`
- `TOTAL`, `TOTAL $`, `STATUS`

### Critical Edge Cases

**Corrupted Excel Range** ⚠️:
- Sheet `!ref` property often wrong (says `A1:C1` when actually `A1:R100`)
- MUST manually fix range before parsing
- Look for cells beyond reported range

**Order Number Prefixes**:
- `D` prefix = Digital Cookie orders (D229584475)
- `S` prefix = Direct Ship orders (S207787166)
- `TDS`/`TDSD` = Troop Direct Sales
- Numeric only = Internal troop transfers (16491)

**Matching Logic**:
```javascript
// Digital Cookie to SC Transfer matching:
dcOrder.orderNumber === scTransfer['ORDER #'].replace(/^D/, '')
```

**Negative Numbers** ⚠️:
- Negative = inventory OUT (deliveries, sales)
- Positive = inventory IN (pickups, returns)
- Must use `Math.abs()` when displaying to users
```javascript
const displayAmount = Math.abs(row.TOTAL);
```

**Transaction Types**:

| Code | Meaning | Direction |
|------|---------|-----------|
| C2T(P) | Council to Troop (pickup) | IN (+) |
| T2G | Troop to Girl (scout pickup) | OUT (-) |
| COOKIE_SHARE | Cookie donation sold | OUT (-) |
| COOKIE_SHARE(D) | Digital Cookie donation | OUT (-) |
| DIRECT_SHIP | Shipped order | Varies |
| PLANNED | Planned/future order | Varies |

**TO/FROM Values**:
- `1234` = Troop number
- Scout names = Individual scouts
- `Corovan WAREHOUSE` = Council warehouse

**Missing Orders** (NOT AN ERROR):
- Only ~10-15% of Digital Cookie orders appear in Smart Cookie Transfers
- Most DC orders are NOT in SC yet - this is NORMAL
- SC only shows synced/approved orders
- They will sync later in the cookie season

**Cookie Abbreviations**:
```
CShare = Cookie Share (donation)
ADV = Adventurefuls
EXP = Exploremores
LEM = Lemonades
TRE = Trefoils
TM = Thin Mints
PBP = Peanut Butter Patties
CD = Caramel deLites
PBS = Peanut Butter Sandwich
GFC = Caramel Chocolate Chip (Girl Scout Fudge Covered)
```

---

## Smart Cookie Report Format

**File**: `ReportExport.xlsx`

### Expected Columns

**Note:** All column names are available as constants in `constants.js` under `SC_REPORT_COLUMNS`.

**Key Fields:** Girl/order IDs, GSUSA ID, grade level, troop/service unit/council info, order date/type, Cookie Share flag, cookie variety columns (C1-C11), totals, and parameters.

**Usage:**
```javascript
const { SC_REPORT_COLUMNS } = require('./constants');
const girlName = row[SC_REPORT_COLUMNS.GIRL_NAME];
const orderId = row[SC_REPORT_COLUMNS.ORDER_ID];
```

**See:** `constants.js` → `SC_REPORT_COLUMNS` for complete field list.

### Critical Edge Cases

**Cases/Packages Format** ⚠️:
- All cookie columns use `"cases/packages"` format
- Example: `"0/8"` = 0 cases, 8 packages = 8 total
- Example: `"2/5"` = 2 cases, 5 packages = 29 total
- Must split on `/` and parse both parts
```javascript
const [cases, pkgs] = "2/5".split('/').map(Number);
const total = (cases * 12) + pkgs; // 29
```

**Boolean Fields** ⚠️:
- `CShareVirtual`: String `"TRUE"` or `"FALSE"` (NOT boolean!)
- `IncludedInIO`: String `"Y"` or `"N"` (NOT boolean!)
- Must compare as strings
```javascript
// WRONG: row['CShareVirtual'] === true
// RIGHT: row['CShareVirtual'] === 'TRUE'

// WRONG: row['IncludedInIO'] === true
// RIGHT: row['IncludedInIO'] === 'Y'
```

**Date Format**:
- String format: `"01/25/2026 11:20:42 AM"`
- Different from Digital Cookie Excel dates
- Can parse directly with `new Date()`

**Order ID Matching**:
- `OrderID` and `RefNumber` both contain order number
- Match to Digital Cookie `Order Number` (no prefix)
```javascript
dcOrder.orderNumber === scReport.OrderID // Direct match
```

**Scout Identifiers**:
- `GirlID`: Internal ID (82712)
- `GSUSAID`: Official Girl Scouts USA ID (125877601)
- Both are unique per scout, persist across seasons

**Organizational Hierarchy**:
- `ParamTitle` contains full path in text format
- Example: `" District = Chaparral Shores; Service Unit = Scripps Ranch; Troop = 3990;"`

**Missing Cookie Types**:
- Some columns like `C13` exist but rarely used
- Not all 13 columns are standard cookie types
- Map only known columns (C1-C11)

---

## Cookie Name Mapping

| Digital Cookie | Smart Cookie Abbr | Smart Cookie Report | Price |
|----------------|-------------------|---------------------|-------|
| Adventurefuls | ADV | C2 | $6 |
| Exploremores | EXP | C3 | $6 |
| Lemonades | LEM | C4 | $6 |
| Trefoils | TRE | C5 | $6 |
| Thin Mints | TM | C6 | $6 |
| Peanut Butter Patties | PBP | C7 | $6 |
| Caramel deLites | CD | C8 | $6 |
| Peanut Butter Sandwich | PBS | C9 | $6 |
| Caramel Chocolate Chip | GFC | C11 | $7 ⚠️ |
| Cookie Share | CShare | C1 | $6 |

---

## Order Number Matching

**Format by Source**:
```
Digital Cookie:  229584475      (9-digit numeric)
SC Transfers:    D229584475     (D prefix)
SC Report:       229584475      (matches DC)
```

**Matching Logic**:

1. **Digital Cookie ↔ Smart Cookie Report**:
   - Direct 1:1 match
   ```javascript
   dcOrder.orderNumber === scReport.OrderID
   ```

2. **Digital Cookie ↔ Smart Cookie Transfers**:
   - Strip D prefix from SC
   ```javascript
   dcOrder.orderNumber === scTransfer['ORDER #'].replace(/^D/, '')
   ```

3. **Order Number Classification**:
   - 9-digit numeric = Digital Cookie order
   - D + 9-digit = Same order in Smart Cookie
   - S + 9-digit = Direct ship (not in DC)
   - 5-6 digit numeric = Internal troop transfer (not in DC)

---

## Common Filters

### Get Only Girl Orders (Exclude Troop Site)
```javascript
orders.filter(o => o['Girl Last Name'] !== 'Site')
```

### Get Only Troop Site Orders
```javascript
orders.filter(o => o['Girl Last Name'] === 'Site')
```

### Get Completed Orders
```javascript
orders.filter(o =>
  o['Order Status'] === 'Completed' ||
  o['Order Status'] === 'Delivered'
)
```

### Get Digital Cookie Orders from SC Transfers
```javascript
transfers.filter(t =>
  t.TYPE.includes('COOKIE_SHARE') &&
  t['ORDER #'].startsWith('D')
)
```

---

## Expected Discrepancies (NOT ERRORS!)

1. **~90% of DC orders NOT in SC Transfers**
   - Normal! Only synced orders appear
   - They'll sync later in the season
   - Don't treat as missing data

2. **All DC orders SHOULD be in SC Report**
   - These should match 1:1
   - Same order counts expected

3. **Negative numbers in SC Transfers**
   - Normal! Negative = OUT
   - Use `Math.abs()` for display

4. **"Site" orders only in Digital Cookie**
   - Booth sales not yet allocated
   - Use SC Smart Booth Divider to allocate to individual girls

---

## Data Quality Issues

**Empty Scout Names**: Some rows have `""` for names
- Fall back to "Unknown"
- Check both first and last name

**Zero Packages**: Some orders have 0 packages
- Could be fully refunded
- Could be pending/cancelled
- Don't skip these - they're valid data

**Decimal Amounts**: Money values may have precision issues
- Always use `.toFixed(2)` for display
- Store as floats, round on display

**Missing Dates**: Some fields may be null/empty
- Check before formatting
- Return null or placeholder

**Troop Site Orders**:
- Scout name format: `"Troop3990 Site"` or first="Troop3990", last="Site"
- These are booth/site sales, not individual scout
- Valid orders, should be included in troop totals

---

## Validation Checklist

### Pre-Import
- [ ] File has required columns
- [ ] At least 1 row of data
- [ ] Column names match expected format

### Post-Import
- [ ] All numeric fields parsed correctly
- [ ] Dates converted from Excel format
- [ ] Order numbers are unique within source
- [ ] No negative packages after refund subtraction
- [ ] Revenue calculations match expected pricing

### Reconciliation
- [ ] DC order count ≈ SC Report order count?
- [ ] SC Transfer orders < 20% of DC orders?
- [ ] All order numbers are 5-9 digits?
- [ ] No negative packages (after refunds)?
- [ ] Revenue matches package counts × pricing?
- [ ] Scout names not blank?
- [ ] Dates are valid?
- [ ] "Site" orders identified?
- [ ] No duplicate order numbers within same source
- [ ] Matched orders have consistent package counts

---

## Common Mistakes

❌ **Don't:**
- Filter SC Transfers by "Site" (it's in TO/FROM fields, different format)
- Compare boolean fields without string conversion
- Forget to subtract Refunded Packages
- Use `===` for DC/SC Transfer order matching (need to strip prefix)
- Expect all DC orders in SC Transfers (only ~10% will be there)
- Use boolean comparison for `CShareVirtual` or `IncludedInIO`
- Forget Caramel Chocolate Chip is $7 (not $6)

✅ **Do:**
- Always use parseInt/parseFloat for numbers
- Check both "Completed" AND "Delivered" for done orders
- Remember Caramel Chocolate Chip is $7 (not $6)
- Use Math.abs() for SC Transfer display
- Filter "Site" orders for girl-level reports
- String-compare boolean-like fields
- Handle cases/packages format in SC Reports

---

## Required Fields by Source

### Digital Cookie Must Have:
- `Order Number`
- `Girl First Name`, `Girl Last Name`
- `Total Packages (Includes Donate & Gift)`
- `Current Sale Amount`
- At least one cookie variety column

### Smart Cookie Transfers Must Have:
- `ORDER #`, `TYPE`, `TO`, `FROM`
- `TOTAL`, `TOTAL $`
- At least one cookie abbreviation (ADV, TM, etc.)

### Smart Cookie Report Must Have:
- `OrderID`, `GirlID`, `GirlName`
- `C1` through `C11` (cookie columns)
- `Total` field
