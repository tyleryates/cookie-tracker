# Undocumented Edge Cases & Important Behaviors

This document captures critical edge cases and behaviors discovered in the codebase that aren't explicitly documented elsewhere.

---

## Smart Cookie API Data Issues

### Transfer Type Field Bug (CRITICAL)

**See [DATA-FORMATS.md - Transfer Type Field](DATA-FORMATS.md#critical-type-vs-transfer_type-field) for complete explanation.**

**Quick Summary:**
- Smart Cookie API has TWO type fields: `order.type` (always "TRANSFER") and `order.transfer_type` (actual type)
- **MUST use `transfer_type` field** - using `type` breaks all inventory tracking
- Transfer types have suffixes (e.g., `C2T(P)`) - use `startsWith('C2T')` pattern

### Reconciler Must Be Reset Between Loads

**The Problem:**
The DataReconciler accumulates data in memory. Loading multiple Smart Cookie files without resetting causes duplicate accumulation.

**Rule:** Always create a fresh DataReconciler instance before importing data. When selecting files to load, filter for files starting with "SC-", sort them in descending order by name, and load only the most recent file (the first after sorting).

---

## Scout Name Handling

### Empty Scout Names
**Issue**: Digital Cookie data can have empty first/last names
**Handling**: The name is constructed by concatenating first and last with a space, trimming whitespace. Missing parts default to empty strings.
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

**Quick Reference:** To determine sync behavior, read the payment status field (defaulting to empty string if absent) and check whether it equals "CAPTURED" for credit card payments. An order auto-syncs only if it is a credit card payment AND the order type includes "Shipped" or is exactly "Donation". Any order with donations that does not auto-sync requires manual Virtual Cookie Share entry.

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

### Complete Auto-Sync Determination Logic

**Critical**: Must check BOTH `Order Type` AND `Payment Status` to determine sync behavior.

An order auto-syncs when the payment status is "CAPTURED" (credit card) AND the order type either includes "Shipped" or is exactly "Donation". All other combinations require manual Virtual Cookie Share entry in Smart Cookie. Specifically: any order with cash payment always needs manual entry, and in-person delivery types ("In Person Delivery with Donation", "Cookies in Hand with Donation") never auto-sync regardless of payment method.

**Decision Matrix**:

| Order Type | Payment Status | Auto-Sync? | Action Required |
|------------|----------------|------------|-----------------|
| Donation | CAPTURED | Yes | None - auto-syncs |
| Donation | CASH | No | TCM creates Virtual Cookie Share |
| Shipped with Donation | CAPTURED | Yes | None - auto-syncs |
| Shipped with Donation | CASH | No | TCM creates Virtual Cookie Share |
| In Person Delivery with Donation | CAPTURED | No | TCM creates Virtual Cookie Share |
| In Person Delivery with Donation | CASH | No | TCM creates Virtual Cookie Share |
| Cookies in Hand with Donation | CAPTURED | No | TCM creates Virtual Cookie Share |
| Cookies in Hand with Donation | CASH | No | TCM creates Virtual Cookie Share |

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
- **Source**: Copied from `scout.credited.booth.varieties` during calculation
- **Example**: Troop booth sold 100 packages, scout gets 1 package credit
- **Used For**: "Booth Sales" column in scout reports
- **Inventory Impact**: NONE (no physical transfer, credit only)

**4. `$varietyBreakdowns.fromDirectShip` (Direct Ship Allocations)**
- **Contains**: Site orders (TROOP_DIRECT_SHIP) allocated to scouts
- **Includes**: All varieties in direct ship allocations
- **Source**: Copied from `scout.credited.directShip.varieties` during calculation
- **Example**: Troop site order shipped to customer, scout gets credit
- **Used For**: "Credited" totals in scout reports
- **Inventory Impact**: NONE (scout never handled packages)

### Code Implementation

Each scout object contains three main sections. **Inventory** tracks physical T2G transfers, with a total count and a per-variety breakdown of physical cookies received (e.g., Thin Mints: 15, Adventurefuls: 3). **Credited** tracks booth and direct ship allocations, each with a package count and per-variety breakdown; these are the source data for the calculated fields. **$varietyBreakdowns** (a calculated field using the $ prefix convention) contains four sub-objects: `fromSales` for GIRL_DELIVERY physical sales varieties, `fromShipped` for GIRL_DIRECT_SHIP order varieties, `fromBooth` (copied from `credited.booth.varieties`), and `fromDirectShip` (copied from `credited.directShip.varieties`).

During the `calculateScoutTotals()` Phase 5 processing, each scout's orders are iterated. For GIRL_DELIVERY orders, each non-Cookie-Share variety and its count are accumulated into `$varietyBreakdowns.fromSales`. For GIRL_DIRECT_SHIP orders, each non-Cookie-Share variety and its count are accumulated into `$varietyBreakdowns.fromShipped`. After processing orders, the credited varieties are copied into the corresponding breakdown fields: booth varieties into `fromBooth` and direct ship varieties into `fromDirectShip`.

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
- Net Inventory: 50 - 45 = **+5** (booth credit NOT counted)
- Booth Sales: 1 (shown separately)

**Example 3: Scout with Direct Ship**
- Picked up (T2G): 50 Thin Mints
- Direct ship: 10 Thin Mints
- Sold (physical): 45 Thin Mints
- Net Inventory: 50 - 45 = **+5** (direct ship NOT counted)
- Direct Ship: 10 (shown separately)
- Total Sold: 45 + 10 = 55 (scout gets full credit)

**Example 4: Scout with Cookie Share**
- Picked up (T2G): 50 Thin Mints, 0 Cookie Share
- Sold: 45 Thin Mints, 9 Cookie Share
- Net Inventory: 50 - 45 = **+5**
- Cookie Share Picked Up: **N/A** (virtual)
- Cookie Share Inventory: **N/A** (virtual)

### Why This Matters

**Without Separate Buckets**:
- Virtual booth credits inflate physical inventory - incorrect net inventory
- Direct ship shows as negative inventory - confusing reports
- Cookie Share shows as missing inventory - appears as deficit
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
- Shows "N/A" in "Picked Up" column (not "--" or 0)
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

1. **totalPackages** (Total Sold): Included
2. **packages** (Sales/Need Inventory): Excluded
3. **$varietyBreakdowns.fromSales** (Physical Sales): Excluded
4. **$varietyBreakdowns.fromShipped** (Direct Ship): Tracked separately
5. **revenue**: Included (scout gets credit)

**Example**:
- Scout has order: 10 packages direct ship
- Sales: 0 (no physical inventory needed)
- Picked Up: 0 (no T2G transfer)
- Inventory: 0 (0 - 0 = 0) -- Correct
- Direct Ship: 10 -- Shows scout made sales
- Total Sold: 10 -- Scout gets credit

### Why Separate Tracking Matters
**Problem Without Separation**:
- Direct ship goes into physical sales tracking
- Scout sold 10 but picked up 0
- Net inventory: 0 - 10 = **-10** -- Shows as deficit!

**Solution**:
- Direct ship goes into `scout.$varietyBreakdowns.fromShipped`
- Scout sold 0 physical, picked up 0
- Net inventory: 0 - 0 = **0** -- Correct
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
**Solution**: Strip dollar signs and commas from the string before parsing it as a float. Default to 0 if parsing fails.

---

## Smart Cookie Report (Cases/Packages Format)

### Format: "cases/packages"
**Examples**:
- `"0/8"` = 0 cases + 8 packages = **8 packages**
- `"2/5"` = 2 cases + 5 packages = **29 packages** (2x12 + 5)
- `"1/0"` = 1 case + 0 packages = **12 packages**

**Parsing rule**: Split the string on "/", parse each part as an integer (defaulting to 0), then calculate total packages as (cases x 12) + packages.

### Empty/Invalid Values
**Can Be**: Empty string, null, undefined, or malformed
**Handling**: Default to `"0/0"` if missing
**Parse**: Default to 0 after parsing to handle NaN

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

**Rule**: Compare these fields against their string values (`=== 'TRUE'` and `=== 'Y'`). Comparing against actual boolean `true` will always evaluate to false since the field is a string.

---

## Inventory Calculation Edge Cases

### Three Types of "Inventory"
1. **C2T Inventory** (Troop Level): Total cookies picked up from council
2. **T2G Allocation** (Scout Level): Cookies allocated to individual scouts
3. **Physical Inventory** (Net): What scouts actually received physically

**Critical Exclusions from Physical Inventory**:
- Cookie Share (virtual donations)
- Booth credits (virtual credits)
- Direct ship (shipped from supplier)

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

**Site Order Inventory Impact:**
"Site" orders (troop booth sales from Digital Cookie) are fulfilled from troop stock and must be subtracted from troop inventory.

**Example Calculation:**
```
Troop picks up 1000 packages (C2T)
Scouts pick up 800 packages (T2G)
Site orders deliver 50 packages to customers
Net inventory: 1000 - 800 - 50 = 150
```

**Implementation:**
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
**Check**: Code verifies the scout name exists in the summary before adding T2G data
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
To match a Digital Cookie order to a Smart Cookie transfer, strip the leading "D" prefix from the SC order number and compare it to the DC order number. For example, DC order `"229584475"` matches SC transfer `"D229584475"` after removing the "D".

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
- Counts toward `scout.totals.donations` (shows in donations column)
- Does NOT go into `inventory.varieties` (shows N/A in Picked Up)
- Does NOT go into `$varietyBreakdowns.fromSales` (excluded from physical sales)
- Does NOT go into `$varietyBreakdowns.fromShipped` (excluded from direct ship varieties)

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
- 37: Cookie Share
- 48: Adventurefuls
- 52: Caramel Chocolate Chip
- 56: Exploremores

**Smart Cookie Report** (column IDs):
- C1: Cookie Share
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
**Solution**: Take the absolute value of each cookie's quantity when counting packages for display.

---

## Data Reconciliation Edge Cases

### Orders Map Key Format
**Key**: Order number as string (NO prefix)
**DC Orders**: `"229584475"`
**SC Orders**: Strip D prefix to get `"229584475"` (same key)
**Result**: Both sources merge into same order entry

### Source Array Tracking
**Format**: Array of strings
**Values**: `['DC', 'SC-Report', 'SC-API', 'SC-Transfer']`
**Purpose**: Know which systems have seen this order
**Deduplication**: Check if source already in array before adding

### Metadata Preservation
Each order stores separate metadata objects for each source system: `dc` for the raw Digital Cookie row, `scReport` for the raw Smart Cookie report row, and `scApi` for the raw API response. This preserves original data for debugging and verification.

---

## Report Generation Edge Cases

### Table Colspan Must Match Column Count
**Scout Summary Main Row**: 10 columns
**Detail Row**: Must use `colspan="10"` to span full width
**Impact**: Wrong colspan causes layout to break

### Click Event Delegation
**Setup**: Events attached via MutationObserver (`setupReportObserver`) after HTML rendered
**Reason**: DOM must exist before attaching event listeners
**Pattern**: Observer detects new report content, then queries and attaches handlers

### Empty Scout Names in Reports
**Display**: Empty string shows as blank row
**Sorting**: Empty string sorts first alphabetically
**Fix**: Could filter out or replace with "Unknown"

### HTML Title Attribute Tooltips (CRITICAL)

**The Problem:**
HTML entities like `&#10;` do NOT work for newlines in HTML `title` attributes. Browser tooltips require actual newline characters.

**Wrong approach**: Using `&#10;` between lines in a title attribute results in the literal text "&#10;" appearing in the tooltip, not a line break.

**Correct approach**: Use actual `\n` newline characters in the title attribute string. This produces real multi-line tooltips.

**For variety tooltips**: Build the variety list by joining entries with `\n` (not `&#10;`), then escape any double quotes to `&quot;` before placing the string inside the title attribute. This prevents broken HTML from unescaped quotes while ensuring proper line breaks in the tooltip display.

---

## Summary of Most Critical Edge Cases

1. **Payment Status + Order Type** determines auto-sync (BOTH fields required)
2. **Virtual Booth Flag** must exclude from physical inventory
3. **Direct Ship** must track separately to avoid negative inventory
4. **Cookie Share** always excluded from physical inventory calculations
5. **Refunded Packages** must be subtracted from Total Packages
6. **"With Donation" orders** contain both physical AND virtual packages
7. **Transfer Type Field** is `transfer_type`, NOT `type` in SC API
8. **C2T Type Matching** needs `.startsWith()` not exact match
9. **String Booleans** in SC Report need string comparison ("TRUE", "Y")
10. **Cases/Packages Format** needs parsing and calculation (x12)

---

*This document captures actual behaviors found in the code. If behavior differs from program documentation, the code behavior is what actually happens in the app.*
