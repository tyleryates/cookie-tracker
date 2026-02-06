# Undocumented Edge Cases & Important Behaviors

This document captures critical edge cases and behaviors discovered in the codebase that aren't explicitly documented elsewhere.

---

## Smart Cookie API Data Issues

### Transfer Type Field Bug (CRITICAL)

⚠️ **See [DATA-FORMATS.md - Transfer Type Field](DATA-FORMATS.md#critical-type-vs-transfer_type-field) for complete explanation and code examples.**

**Quick Summary:**
- Smart Cookie API has TWO type fields: `order.type` (always "TRANSFER") and `order.transfer_type` (actual type)
- **MUST use `transfer_type` field** - using `type` breaks all inventory tracking
- Transfer types have suffixes (e.g., `C2T(P)`) - use `startsWith('C2T')` pattern

### Reconciler Duplicate Accumulation Bug

**The Problem:**
The DataReconciler accumulates data in memory. If you load multiple Smart Cookie files without resetting, duplicates multiply.

**Historical Bug:**
1. Reconciler never reset between data loads
2. Multiple dated files (SC-2026-02-03.json, SC-2026-02-04.json) all imported
3. Each import added to existing data
4. Result: Duplicate orders, inflated totals

**Solution:**
```javascript
// CRITICAL: Reset reconciler before loading new data
reconciler = new DataReconciler();

// Only load most recent file, not all dated files
const scFiles = result.files
  .filter(f => f.name.startsWith('SC-'))
  .sort((a, b) => b.name.localeCompare(a.name));

// Load only scFiles[0] (most recent)
```

**Rule:** Always reset reconciler before importing data, and only load the most recent file of each type.

---

## Scout Name Handling

### Empty Scout Names
**Issue**: Digital Cookie data can have empty first/last names
**Handling**: Code constructs name as `${first || ''} ${last || ''}`.trim()
**Result**: Empty string for missing scouts
**Impact**: Creates scout summary entry with empty key, but still processable

### "Troop Site" Orders
**Issue**: Troop-level booth/site sales appear as individual orders
**Format**: `Girl First Name="Troop3990"`, `Girl Last Name="Site"`
**Scout Name**: Concatenates to `"Troop1234 Site"`
**Purpose**: These are troop booth sales not yet allocated to individual scouts
**Important**: Valid orders that should be included in troop totals, not filtered out

---

## Package Calculation Edge Cases

### Physical vs Total Packages
**Critical Distinction**:
- `totalPackages` = ALL packages (physical + shipped + donations)
- `packages` = ONLY packages requiring physical inventory
- `physicalPackages` = total - donations (excludes virtual Cookie Share)

**Calculation:**
Net packages are calculated by subtracting refunded packages from the total. Physical packages are then calculated by subtracting donations (virtual Cookie Share) from net packages. This ensures accurate tracking of packages requiring physical inventory.

### Refunded Packages
**Important**: The `Total Packages (Includes Donate & Gift)` field INCLUDES refunded packages
**Must Do**: Always subtract `Refunded Packages` to get net packages
**Example**: Order shows 20 total, 2 refunded = 18 net packages
**Impact**: Failing to subtract creates inflated totals

---

## Order Type Edge Cases

### Case-Insensitive Matching Required
**Issue**: Order types can vary in capitalization
**Examples**: `"Shipped"`, `"shipped"`, `"Shipped with Donation"`
**Solution**: Check for both capitalization variants using `.includes()` method to handle inconsistent API data.

### Donation-Only Orders
**Type**: `Order Type === "Donation"` (exact match)
**Contains**: ONLY Cookie Share donations, NO physical cookies
**Inventory**: Requires ZERO physical inventory from scout
**Auto-Sync**: Auto-syncs to Smart Cookie IF payment is credit card (CAPTURED)
**Manual Entry**: Needs manual Virtual Cookie Share entry IF payment is CASH

### "With Donation" Orders
**Types**:
- `"In Person Delivery with Donation"`
- `"Cookies in Hand with Donation"`
- `"Shipped with Donation"`

**Critical**: These orders contain BOTH physical cookies AND virtual Cookie Share donations
**Problem**: The `Total Packages` field includes both types
**Solution**: Subtract `Donation` field to get physical packages only
**Example**: Order with 10 total packages, 2 donations = 8 physical + 2 virtual

---

## Payment Status & Auto-Sync Logic

**Quick Reference Code Pattern:**
```javascript
const paymentStatus = row['Payment Status'] || '';
const isCreditCard = paymentStatus === 'CAPTURED';
const isAutoSync = (orderType.includes('Shipped') || orderType === 'Donation') && isCreditCard;
const needsManualEntry = !isAutoSync && donations > 0;
```

**Payment Status Values:**
- `CAPTURED` = Credit card (can auto-sync for Shipped/Donation orders)
- `CASH` = Cash/check (ALWAYS needs manual entry, even "Donation")

### Payment Status Determines Sync Behavior
**CAPTURED** (credit card):
- Can auto-sync to Smart Cookie for certain order types
- "Shipped" orders auto-sync
- "Donation" orders auto-sync

**CASH** (cash/check payment):
- NEVER auto-syncs, even for "Donation" orders
- Always requires manual Virtual Cookie Share entry
- TCM must create Virtual Cookie Share order in Smart Cookie

### Critical Bug That Was Fixed
**Previous Logic**: Only checked `Order Type` field
**Problem**: "Donation" orders with CASH payment were incorrectly marked as auto-sync
**Correct Logic**: Must check BOTH `Order Type` AND `Payment Status`
```javascript
const isCreditCard = paymentStatus === 'CAPTURED';
const isAutoSync = (orderType.includes('Shipped') || orderType === 'Donation') && isCreditCard;
```

### Complete Auto-Sync Determination Logic

**Full Implementation** showing all order type and payment status combinations:

```javascript
function determineManualEntryNeeds(order) {
  const orderType = order['Order Type'] || '';
  const paymentStatus = order['Payment Status'] || '';
  const donations = parseInt(order['Donation']) || 0;

  // No donations = no manual entry needed
  if (donations === 0) {
    return {
      needsManualEntry: false,
      reason: 'No Cookie Share donations'
    };
  }

  // Check if credit card payment
  const isCreditCard = paymentStatus === 'CAPTURED';

  // Auto-sync rules (no manual entry needed):
  // 1. "Shipped with Donation" + credit card → Auto-syncs
  // 2. "Donation" (only) + credit card → Auto-syncs
  const isAutoSyncType = orderType.includes('Shipped') || orderType === 'Donation';
  const isAutoSync = isAutoSyncType && isCreditCard;

  if (isAutoSync) {
    return {
      needsManualEntry: false,
      reason: `${orderType} with credit card payment auto-syncs to Smart Cookie`
    };
  }

  // Manual entry needed for:
  // 1. ANY order with CASH payment (including "Donation")
  // 2. "In Person Delivery with Donation" (even with credit card)
  // 3. "Cookies in Hand with Donation" (even with credit card)
  return {
    needsManualEntry: true,
    reason: isCreditCard
      ? `${orderType} requires manual Virtual Cookie Share entry in Smart Cookie`
      : `CASH payment requires manual Virtual Cookie Share entry in Smart Cookie`,
    scout: order.scout,
    orderNumber: order.orderNumber,
    donations: donations,
    orderType: orderType,
    paymentStatus: paymentStatus
  };
}
```

**Decision Matrix**:

| Order Type | Payment Status | Auto-Sync? | Action Required |
|------------|----------------|------------|-----------------|
| Donation | CAPTURED | ✅ Yes | None - auto-syncs |
| Donation | CASH | ❌ No | TCM creates Virtual Cookie Share |
| Shipped with Donation | CAPTURED | ✅ Yes | None - auto-syncs |
| Shipped with Donation | CASH | ❌ No | TCM creates Virtual Cookie Share |
| In Person Delivery with Donation | CAPTURED | ❌ No | TCM creates Virtual Cookie Share |
| In Person Delivery with Donation | CASH | ❌ No | TCM creates Virtual Cookie Share |
| Cookies in Hand with Donation | CAPTURED | ❌ No | TCM creates Virtual Cookie Share |
| Cookies in Hand with Donation | CASH | ❌ No | TCM creates Virtual Cookie Share |

**Key Takeaway**: Payment status determines whether SOME order types can auto-sync, but in-person delivery types NEVER auto-sync regardless of payment method.

---

## Virtual Booth Tracking

### What Are Virtual Booth Credits?

**Virtual booth credits** are T2G transfers where scouts receive sales credit without physically receiving packages.

**Example Scenario:**
- Troop booth sells 100 packages
- Scout helps at booth for 1 hour
- TCM credits scout with 1 package sale (virtual T2G transfer)
- Scout never physically receives the package (sold directly from troop stock)

### Why Separate Tracking Is Required

The system maintains **four distinct variety tracking objects** per scout (stored in `scout.$varietyBreakdowns`) to accurately separate physical inventory from virtual credits:

1. **`$varietyBreakdowns.fromSales`** - Physical sales requiring inventory
2. **`inventory.varieties`** - Physical inventory received (T2G)
3. **`$varietyBreakdowns.fromBooth`** - Virtual booth credits (no physical transfer)
4. **`$varietyBreakdowns.fromDirectShip`** - Direct ship allocations (no scout inventory)

**See:** [IMPLEMENTATION-NOTES.md - $ Prefix Convention](IMPLEMENTATION-NOTES.md#-prefix-convention) for complete field documentation

### Purpose of Each Bucket

**1. `$varietyBreakdowns.fromSales` (Physical Sales)**
- **Contains**: GIRL_DELIVERY orders requiring physical delivery
- **Includes**: "Cookies in Hand", "In Person Delivery", "Pick Up"
- **Excludes**: Shipped orders, virtual booth credits, Cookie Share
- **Used For**: "Sold" column in scout reports
- **Inventory Impact**: REDUCES net inventory (scout gave away packages)

**2. `inventory.varieties` (Physical Inventory Received)**
- **Contains**: T2G transfers where scout physically received cookies
- **Includes**: Only physical cookie types
- **Excludes**: Cookie Share (virtual, shows as N/A)
- **Excludes**: Entire transfer if `virtualBooth === true`
- **Used For**: "Picked Up" column in scout reports
- **Inventory Impact**: INCREASES net inventory (scout received packages)

**3. `$varietyBreakdowns.fromBooth` (Virtual Booth Credits)**
- **Contains**: T2G transfers with `virtualBooth === true` flag
- **Includes**: All varieties (even Cookie Share if present)
- **Source**: `scout.credited.booth.varieties` (copied during calculation)
- **Example**: Troop booth sold 100 packages, scout gets 1 package credit
- **Used For**: "Booth Sales" column in scout reports
- **Inventory Impact**: NONE (no physical transfer, credit only)

**4. `$varietyBreakdowns.fromDirectShip` (Direct Ship Allocations)**
- **Contains**: Site orders (TROOP_DIRECT_SHIP) allocated to scouts
- **Includes**: All varieties in direct ship allocations
- **Source**: `scout.credited.directShip.varieties` (copied during calculation)
- **Example**: Troop site order shipped to customer, scout gets credit
- **Used For**: "Credited" totals in scout reports
- **Inventory Impact**: NONE (scout never handled packages)

### Code Implementation

**Current Implementation** (uses $ prefix pattern):

```javascript
// Structure created in data-reconciler.js buildUnifiedDataset()
const scout = {
  name: scoutName,

  // Inventory (from T2G transfers, physical only)
  inventory: {
    total: 47,
    varieties: {              // Physical inventory received
      "Thin Mints": 15,
      "Adventurefuls": 3
    }
  },

  // Allocations (booth and direct ship credits)
  credited: {
    booth: {
      packages: 12,
      varieties: {            // Source for $varietyBreakdowns.fromBooth
        "Thin Mints": 4,
        "Caramel deLites": 3
      }
    },
    directShip: {
      packages: 6,
      varieties: {            // Source for $varietyBreakdowns.fromDirectShip
        "Lemonades": 2
      }
    }
  },

  // $ Prefix calculated fields (computed in calculateScoutTotals)
  $varietyBreakdowns: {
    fromSales: {              // GIRL_DELIVERY orders, physical only
      "Thin Mints": 10,
      "Caramel deLites": 5
    },
    fromShipped: {            // GIRL_DIRECT_SHIP orders
      "Adventurefuls": 3
    },
    fromBooth: {},            // Copy of credited.booth.varieties
    fromDirectShip: {}        // Copy of credited.directShip.varieties
  }
};

// Processing in calculateScoutTotals() - Phase 5
scout.orders.forEach(order => {
  if (order.type === 'GIRL_DELIVERY') {
    // Track varieties from physical sales
    Object.entries(order.varieties).forEach(([variety, count]) => {
      if (variety !== 'Cookie Share') {
        scout.$varietyBreakdowns.fromSales[variety] =
          (scout.$varietyBreakdowns.fromSales[variety] || 0) + count;
      }
    });
  } else if (order.type === 'GIRL_DIRECT_SHIP') {
    // Track varieties from shipped orders
    Object.entries(order.varieties).forEach(([variety, count]) => {
      if (variety !== 'Cookie Share') {
        scout.$varietyBreakdowns.fromShipped[variety] =
          (scout.$varietyBreakdowns.fromShipped[variety] || 0) + count;
      }
    });
  }
});

// Copy credited varieties to $ prefix breakdown fields
scout.$varietyBreakdowns.fromBooth = { ...scout.credited.booth.varieties };
scout.$varietyBreakdowns.fromDirectShip = { ...scout.credited.directShip.varieties };
```

### Display in Reports

**Scout Summary Table**:
```
Scout Name    | Sold | Picked Up | Booth Sales | Direct Ship | Inventory
------------- | ---- | --------- | ----------- | ----------- | ---------
Charlie Yates |  94  |    95     |      1      |      0      |    +1
```

**Breakdown Table** (per variety):
```
Cookie Type          | Sold | Picked Up | Booth | Direct | Inventory
-------------------- | ---- | --------- | ----- | ------ | ---------
Thin Mints           |  15  |    15     |   0   |   0    |     0
Cookie Share         |   9  |    N/A    |   0   |   0    |    N/A
```

### Calculation Examples

**Example 1: Scout with Physical Sales Only**
- Picked up (T2G): 50 Thin Mints
- Sold: 45 Thin Mints
- Net Inventory: 50 - 45 = **+5** (5 remaining)

**Example 2: Scout with Virtual Booth Credit**
- Picked up (T2G): 50 Thin Mints
- Booth credit (virtual): 1 Thin Mint
- Sold: 45 Thin Mints
- Net Inventory: 50 - 45 = **+5** ✅ (booth credit NOT counted)
- Booth Sales: 1 (shown separately)

**Example 3: Scout with Direct Ship**
- Picked up (T2G): 50 Thin Mints
- Direct ship: 10 Thin Mints
- Sold (physical): 45 Thin Mints
- Net Inventory: 50 - 45 = **+5** ✅ (direct ship NOT counted)
- Direct Ship: 10 (shown separately)
- Total Sold: 45 + 10 = 55 (scout gets full credit)

**Example 4: Scout with Cookie Share**
- Picked up (T2G): 50 Thin Mints, 0 Cookie Share
- Sold: 45 Thin Mints, 9 Cookie Share
- Net Inventory: 50 - 45 = **+5** ✅
- Cookie Share Picked Up: **N/A** (virtual)
- Cookie Share Inventory: **N/A** (virtual)

### Why This Matters

**Without Separate Buckets**:
- Virtual booth credits inflate physical inventory → incorrect net inventory
- Direct ship shows as negative inventory → confusing reports
- Cookie Share shows as missing inventory → appears as deficit
- Impossible to distinguish virtual from physical sales

**With Separate Buckets**:
- Physical inventory tracking is accurate
- Virtual credits shown separately (scouts still get recognition)
- Reports clearly show what scouts physically handled
- Net inventory calculations are correct
- TCM can validate physical cookie transfers

---

## Smart Cookie Transfer Edge Cases

### Transfer Type vs Order Type
**API Returns TWO Type Fields**:
- `order.type` = always `"TRANSFER"` (generic)
- `order.transfer_type` = actual type like `"C2T(P)"`, `"T2G"`, `"D"`

**Critical**: Must use `transfer_type` field for accurate transfer classification
**Impact**: Using wrong field causes C2T transfers to not appear in reports

### Transfer Type Suffixes
**C2T Types**:
- `"C2T"` - Council to Troop
- `"C2T(P)"` - Council to Troop (Pickup)
- `"C2T(D)"` - Council to Troop (Delivery) - less common

**Solution**: Match with `.startsWith('C2T')` instead of exact equality

### Virtual Booth Flag
**Field**: `virtual_booth: true` in Smart Cookie API
**Meaning**: Scout gets credit for booth sale but didn't physically receive packages
**Example**: Troop booth sold 24 packages, scout gets 1 package credit
**Tracking**: Must go into `scout.credited.booth` and `scout.$varietyBreakdowns.fromBooth`, NOT physical inventory
**Impact**: If added to physical inventory, creates incorrect net inventory (+1 inflation)

---

## Cookie Share (Donations) Edge Cases

**See also:** [CRITICAL-BUSINESS-RULES.md - Cookie Share](CRITICAL-BUSINESS-RULES.md#cookie-share-virtual-donations) for complete business logic and manual entry requirements.

### Cookie Share is ALWAYS Virtual
**Never Physical Inventory**:
- Shows "N/A" in "Picked Up" column (not "—" or 0)
- Shows "N/A" in "Inventory" column
- NOT included in physical inventory calculations
- NOT included in T2G physical packages
- IS included in Total Sold

### Cookie Share in Multiple Places
**Digital Cookie**:
- `Donation` field contains Cookie Share package count
- Included in `Total Packages (Includes Donate & Gift)` field
- Separate from regular cookie varieties

**Smart Cookie API**:
- Cookie ID 37 = Cookie Share
- Appears in `transfer.varieties['Cookie Share']`
- Can appear in T2G transfers (virtual allocation)

### Cookie Share Pricing
**Price**: $6/package (same as most cookies, NOT $7)
**Note**: Caramel Chocolate Chip is the exception at $7/package

---

## Direct Ship Orders Edge Cases

### Multiple Tracking Buckets
**Order with Direct Ship** affects totals differently:

1. **totalPackages** (Total Sold): ✅ Included
2. **packages** (Sales/Need Inventory): ❌ Excluded
3. **$varietyBreakdowns.fromSales** (Physical Sales): ❌ Excluded
4. **$varietyBreakdowns.fromShipped** (Direct Ship): ✅ Tracked separately
5. **revenue**: ✅ Included (scout gets credit)

**Example**:
- Scout has order: 10 packages direct ship
- Sales: 0 (no physical inventory needed)
- Picked Up: 0 (no T2G transfer)
- Inventory: 0 (0 - 0 = 0) ✅ Correct!
- Direct Ship: 10 ✅ Shows scout made sales
- Total Sold: 10 ✅ Scout gets credit

### Why Separate Tracking Matters
**Problem Without Separation**:
- Direct ship goes into physical sales tracking
- Scout sold 10 but picked up 0
- Net inventory: 0 - 10 = **-10** ❌ Shows as deficit!

**Solution**:
- Direct ship goes into `scout.$varietyBreakdowns.fromShipped`
- Scout sold 0 physical, picked up 0
- Net inventory: 0 - 0 = **0** ✅ Correct!
- Direct ship column shows 10 separately

---

## Revenue Calculation Edge Cases

### Field Name Is Misleading
**Actual Field**: `Current Sale Amount` (not "Revenue")
**Contains**: Total transaction amount INCLUDING shipping & handling
**Breakdown**:
- `Current Subtotal` = cookie revenue only
- `Current S & H` = shipping and handling fees
- `Current Sale Amount` = subtotal + S&H

**For Reports**: Use `Current Sale Amount` to get total revenue
**For Cookie Revenue Only**: Use `Current Subtotal`

### Currency String Parsing
**Issue**: Values may include currency symbols and commas
**Example**: `"$110.50"` or `"1,234.56"`
**Solution**: Must strip before parsing
```javascript
const amount = parseFloat(String(amountStr).replace(/[$,]/g, '')) || 0;
```

---

## Smart Cookie Report (Cases/Packages Format)

### Format: "cases/packages"
**Examples**:
- `"0/8"` = 0 cases + 8 packages = **8 packages**
- `"2/5"` = 2 cases + 5 packages = **29 packages** (2×12 + 5)
- `"1/0"` = 1 case + 0 packages = **12 packages**

**Critical**: Must parse BOTH parts and calculate
```javascript
const [cases, pkgs] = String(value).split('/').map(n => parseInt(n) || 0);
const totalPackages = (cases * 12) + pkgs;
```

### Empty/Invalid Values
**Can Be**: Empty string, null, undefined, or malformed
**Handling**: Default to `"0/0"` if missing
**Parse**: Use `|| 0` after parseInt to handle NaN

---

## Boolean Field Edge Cases

### String Booleans in Smart Cookie Report
**CShareVirtual Field**:
- Type: String (NOT boolean!)
- Values: `"TRUE"` or `"FALSE"` (not true/false)
- Comparison: Must use string comparison

**IncludedInIO Field**:
- Type: String (NOT boolean!)
- Values: `"Y"` or `"N"` (not yes/no or true/false)
- Comparison: Must use string comparison

**Correct Code**:
```javascript
const isVirtual = row['CShareVirtual'] === 'TRUE';  // ✅
const includedInIO = row['IncludedInIO'] === 'Y';   // ✅
```

**Incorrect Code**:
```javascript
const isVirtual = row['CShareVirtual'] === true;     // ❌ Always false
const includedInIO = row['IncludedInIO'] === true;   // ❌ Always false
```

---

## Inventory Calculation Edge Cases

### Three Types of "Inventory"
1. **C2T Inventory** (Troop Level): Total cookies picked up from council
2. **T2G Allocation** (Scout Level): Cookies allocated to individual scouts
3. **Physical Inventory** (Net): What scouts actually received physically

**Critical Exclusions from Physical Inventory**:
- ❌ Cookie Share (virtual donations)
- ❌ Booth credits (virtual credits)
- ❌ Direct ship (shipped from supplier)

### T2G Transfer Physical Calculation
**Raw Transfer Package Count** may include virtual items
**Must Exclude:**
When calculating physical inventory from T2G transfers, exclude virtual booth transfers entirely (check `virtualBooth` flag) and subtract any Cookie Share packages from the total. Only the remaining physical packages should be added to scout inventory.

### Per-Variety Exclusions
**When Tracking Physical Inventory** (`scout.inventory.varieties`):
- Exclude `Cookie Share` variety (virtual)
- Exclude entire transfer if `virtualBooth === true`

**When Tracking Booth Credits** (`scout.credited.booth.varieties`):
- Only process if `virtualBooth === true`
- Include ALL varieties (even Cookie Share if present)

### Site Orders Reduce Troop Inventory (CRITICAL)

**The Problem:**
"Site" orders (troop booth sales from Digital Cookie) are fulfilled from troop stock but weren't being subtracted from troop inventory.

**Historical Bug:**
```
Troop picks up 1000 packages (C2T)
Scouts pick up 800 packages (T2G)
Site orders deliver 50 packages to customers
Expected inventory: 1000 - 800 - 50 = 150
Actual (buggy): 1000 - 800 = 200  ❌ Wrong!
```

**Root Cause:**
- Site orders come from Digital Cookie (online booth sales)
- When fulfilled from troop stock, they reduce physical inventory
- But troop inventory calculation only subtracted T2G transfers
- Site orders delivered directly weren't being subtracted

**Solution:**
Track site orders separately by identifying orders where the girl's last name equals "Site". For these orders, calculate physical packages (excluding donations) and filter for non-shipped, non-donation-only orders that use troop stock. These physical site order packages must be subtracted from net troop inventory along with T2G allocations: `netInventory = totalOrdered - totalAllocated - siteOrdersPhysical`.

**Rule:** Site orders are booth sales from troop stock and MUST be subtracted from net troop inventory.

**Classification:** Site orders should appear under "Booth Sales" column in reports, not regular "Sales" column.

---

## Scout Summary Initialization Edge Cases

### Scout Entry Created on First Order
**Behavior**: First order for a scout creates the summary object
**Contains**: All tracking fields initialized to 0 and empty objects
**Impact**: Scout appears in report even with 0 values

### Scout Name from T2G Without DC Orders
**Scenario**: Scout received T2G transfer but has no Digital Cookie orders
**Problem**: Scout won't exist in scoutSummary (built from DC data only)
**Check**: Code checks `if (scoutSummary[name])` before adding T2G data
**Result**: T2G transfer silently ignored if scout not in DC data

**Potential Fix**: Create scout entry when processing T2G if doesn't exist
**Current Behavior**: Only scouts with DC orders appear in reports

---

## Order Number Matching Edge Cases

### Digital Cookie Order Numbers
**Format**: 9-digit numeric string
**Example**: `"229584475"`
**Type**: String (NOT number!)

### Smart Cookie Transfer Order Numbers
**Format**: Prefix + 9-digit number
**D Prefix**: `"D229584475"` = Digital Cookie order synced to SC
**S Prefix**: `"S207787166"` = Direct ship order (SC only)
**No Prefix**: `"16491"` = Internal troop transfer (5-6 digits)

### Matching Logic
**DC to SC Transfer**:
```javascript
// Must strip 'D' prefix from SC order number
const dcOrderNum = row['Order Number'];           // "229584475"
const scOrderNum = transfer['ORDER #'];           // "D229584475"
const match = dcOrderNum === scOrderNum.replace(/^D/, '');
```

---

## Variety Tracking Edge Cases

### Multiple Variety Tracking Objects
**Per Scout, Code Tracks** (using $ prefix for calculated fields):
- `scout.$varietyBreakdowns.fromSales`: Physical sales (GIRL_DELIVERY orders)
- `scout.inventory.varieties`: Physical inventory received (T2G transfers)
- `scout.$varietyBreakdowns.fromBooth`: Virtual booth credits (T2G with virtualBooth=true)
- `scout.$varietyBreakdowns.fromShipped`: Direct ship orders (GIRL_DIRECT_SHIP orders)

**See:** [IMPLEMENTATION-NOTES.md - $ Prefix Convention](IMPLEMENTATION-NOTES.md#-prefix-convention) for complete field documentation

**Cookie Share Placement**:
- ✅ Counts toward `scout.totals.donations` (shows in donations column)
- ❌ Does NOT go into `inventory.varieties` (shows N/A in Picked Up)
- ❌ Does NOT go into `$varietyBreakdowns.fromSales` (excluded from physical sales)
- ❌ Does NOT go into `$varietyBreakdowns.fromShipped` (excluded from direct ship varieties)

### Variety Display Order
**MUST Use Consistent Order** across all reports:
1. Thin Mints
2. Caramel deLites
3. Peanut Butter Patties
4. Peanut Butter Sandwich
5. Trefoils
6. Adventurefuls
7. Lemonades
8. Exploremores
9. Caramel Chocolate Chip
10. Cookie Share

**Implementation**: `sortVarietiesByOrder()` and `getCompleteVarieties()` helpers

---

## Cookie ID Mapping Edge Cases

### Different IDs in Different Systems

**Smart Cookie API** (numeric IDs):
- 1: Caramel deLites
- 2: Peanut Butter Patties
- 3: Trefoils
- 4: Thin Mints
- 5: Peanut Butter Sandwich
- 34: Lemonades
- 37: Cookie Share ⚠️
- 48: Adventurefuls
- 52: Caramel Chocolate Chip
- 56: Exploremores

**Smart Cookie Report** (column IDs):
- C1: Cookie Share ⚠️
- C2: Adventurefuls
- C6: Thin Mints
- C11: Caramel Chocolate Chip
- etc.

**Critical**: Cookie Share is ID 37 in API but C1 in reports!
**Why It Matters**: Must have separate mappings for each data source
**Verified**: Mapping confirmed by comparing CSV export to API data

---

## Negative Number Handling

### Smart Cookie Transfer Quantities
**Negative Values** indicate OUT transfers (deliveries, sales)
**Positive Values** indicate IN transfers (pickups, returns)

**Examples**:
- T2G transfer: packages = -47 (47 packages OUT to scout)
- C2T transfer: packages = +200 (200 packages IN to troop)

**Display**: Use `Math.abs()` when showing to users
**Calculation**: Keep negative for accounting (IN - OUT = net)

### Cookie Quantities in API
**API Field**: `cookies[].quantity`
**Can Be Negative**: Yes, for OUT transfers
**Solution**: Take absolute value when counting packages
```javascript
varieties[cookieName] = Math.abs(cookie.quantity);
```

---

## Data Reconciliation Edge Cases

### Orders Map Key Format
**Key**: Order number as string (NO prefix)
**DC Orders**: `"229584475"`
**SC Orders**: Strip D prefix → `"229584475"` (same key)
**Result**: Both sources merge into same order entry

### Source Array Tracking
**Format**: Array of strings
**Values**: `['DC', 'SC-Report', 'SC-API', 'SC-Transfer']`
**Purpose**: Know which systems have seen this order
**Deduplication**: Check if source already in array before adding

### Metadata Preservation
**Structure**: Separate object for each source
```javascript
metadata: {
  dc: { /* raw DC row */ },
  scReport: { /* raw SC report row */ },
  scApi: { /* raw API response */ }
}
```
**Purpose**: Keep original data for debugging/verification

---

## Report Generation Edge Cases

### Table Colspan Must Match Column Count
**Scout Summary Main Row**: 10 columns
**Detail Row**: Must use `colspan="10"` to span full width
**Impact**: Wrong colspan causes layout to break

### Click Event Delegation
**Setup**: Events attached in `setTimeout` after HTML rendered
**Reason**: DOM must exist before attaching event listeners
**Pattern**: Query all matching elements, attach to each

### Empty Scout Names in Reports
**Display**: Empty string shows as blank row
**Sorting**: Empty string sorts first alphabetically
**Fix**: Could filter out or replace with "Unknown"

### HTML Title Attribute Tooltips (CRITICAL)

**The Problem:**
HTML entities like `&#10;` do NOT work for newlines in HTML `title` attributes. Browser tooltips require actual newline characters.

**WRONG (doesn't work):**
```javascript
const tooltip = `title="Line 1&#10;Line 2&#10;Line 3"`;
// Result: Shows literal "&#10;" text in tooltip
```

**CORRECT (works):**
```javascript
const tooltip = `title="Line 1\nLine 2\nLine 3"`;
// Result: Shows multi-line tooltip with actual line breaks
```

**Implementation for Variety Tooltips:**
```javascript
// Build variety list with actual newline characters
const varietyList = Object.entries(varieties)
  .map(([variety, count]) => `${variety}: ${count}`)
  .join('\n');  // Use \n, not &#10;

// Escape quotes to prevent attribute injection
const escapedList = varietyList.replace(/"/g, '&quot;');

// Add to title attribute
const tooltipText = ` title="${escapedList}"`;
```

**Why This Matters:**
- Variety breakdowns show as tooltips on hover
- Using `&#10;` shows literal text instead of line breaks
- Always use `\n` for newlines in title attributes
- Always escape quotes with `&quot;` to prevent broken HTML

**Historical Bug:** Early versions used `&#10;` which didn't work, causing tooltips to be unreadable single lines with literal entity codes shown.

---

## Summary of Most Critical Edge Cases

1. ✅ **Payment Status + Order Type** determines auto-sync (BOTH fields required)
2. ✅ **Virtual Booth Flag** must exclude from physical inventory
3. ✅ **Direct Ship** must track separately to avoid negative inventory
4. ✅ **Cookie Share** always excluded from physical inventory calculations
5. ✅ **Refunded Packages** must be subtracted from Total Packages
6. ✅ **"With Donation" orders** contain both physical AND virtual packages
7. ✅ **Transfer Type Field** is `transfer_type`, NOT `type` in SC API
8. ✅ **C2T Type Matching** needs `.startsWith()` not exact match
9. ✅ **String Booleans** in SC Report need string comparison ("TRUE", "Y")
10. ✅ **Cases/Packages Format** needs parsing and calculation (×12)

---

*This document captures actual behaviors found in the code. If behavior differs from program documentation, the code behavior is what actually happens in the app.*
