# Data Formats Reference

Complete reference for all data sources and formats in the Girl Scout Cookie Tracker system.

**Note:** The app auto-loads `DC-*.xlsx` and `SC-*.json` from `/data/in`. If present, it also auto-loads `*ReportExport*.xlsx` (Smart Cookie Report) and `*CookieOrders*.xlsx` (Smart Cookie Transfers) when no SC API data is available.

---

## File Types

| File | System | What It Contains |
|------|--------|------------------|
| `OrderDataTroop_*.xlsx` | Digital Cookie | All online orders with customer/payment data |
| `CookieOrders.xlsx` | Smart Cookies | Inventory transfers (C2T, T2G, sales) |
| `ReportExport.xlsx` | Smart Cookies | Order data + scout metadata (IDs, grades) |
| `SC-YYYY-MM-DD-HH-MM-SS.json` | Smart Cookies API | JSON from API fetch |

---

## Smart Cookie API Format

**File**: `SC-YYYY-MM-DD-HH-MM-SS.json` (from API fetch)

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

**CRITICAL: `type` vs `transfer_type` Field**:
- Smart Cookie API returns TWO type fields that serve different purposes
- `type`: ALWAYS contains `"TRANSFER"` for all transfers (generic category, not useful for logic!)
- `transfer_type`: Contains ACTUAL transfer type: `"T2G"`, `"C2T(P)"`, `"D"`, etc.
- **MUST use `transfer_type` field**, not `type` field

**Why two fields?**
- `type` indicates the order category (TRANSFER vs SALE vs PLANNED)
- `transfer_type` indicates the specific transfer mechanism
- For all inventory movements, `type` will be "TRANSFER"
- Only `transfer_type` tells you what kind of transfer it is

When reading the transfer type from an order, prefer `transfer_type` first, then fall back to `type` or `orderType` if missing, defaulting to an empty string.

**C2T Transfer Type Suffix Variants**:
- Smart Cookie API returns C2T transfers with suffix variations:
  - `"C2T"` - Council to Troop (generic)
  - `"C2T(P)"` - Council to Troop (Pickup) - most common
  - May have other suffixes in future
- **MUST use a "starts with C2T" check** when matching, not exact string equality. An exact match on `"C2T"` will miss `"C2T(P)"` transfers entirely.

**Cookie ID Mapping**:
- API uses numeric IDs, NOT cookie names
- **CRITICAL**: Must map IDs to names using verified mapping
- Mapping verified against Smart Cookie CSV export

The cookie ID-to-name mapping is:

| ID | Cookie Name |
|----|-------------|
| 1 | Caramel deLites |
| 2 | Peanut Butter Patties |
| 3 | Trefoils |
| 4 | Thin Mints |
| 5 | Peanut Butter Sandwich |
| 34 | Lemonades |
| 37 | Cookie Share |
| 48 | Adventurefuls |
| 52 | Caramel Chocolate Chip |
| 56 | Exploremores |

**How to Verify Cookie ID Mapping:**
If cookie IDs change between seasons or totals don't match:
1. Export a CSV report from Smart Cookie showing variety totals
2. Compare variety quantities in CSV to API data
3. Match numeric IDs to cookie names by comparing quantities
4. Update the cookie ID map in `cookie-constants.js` if needed

**Note:** This mapping is hardcoded in `cookie-constants.js` for simplicity and performance. IDs are stable within a season but may change between years.

**Virtual Booth Flag**:
- `virtual_booth`: Boolean `true` or `false`
- When `true`: Scout receives sales credit but NO physical inventory
- When `false`: Normal physical transfer
- **MUST exclude virtual booth from physical inventory calculations**

Virtual booth transfers should be tracked separately (e.g., as booth credits) rather than added to a scout's physical inventory count.

**Negative Quantities**:
- All OUT transfers have negative quantities
- Cookie quantities: negative = OUT, positive = IN
- **MUST use absolute values** for display and calculations

**Order Number Format**:
- Internal transfers: `"0016491"` (5-7 digits with leading zeros)
- Digital Cookie orders: `"D229584475"` (D prefix + 9 digits)
- To match a Smart Cookie order number to a Digital Cookie order, strip the leading `D` prefix from the SC order number.

**Transfer Type Values**:
- `"T2G"`: Troop to Girl (scout picking up inventory)
- `"C2T(P)"`: Council to Troop, Pickup (troop receiving from council)
- `"D"`: Digital Cookie order synced to Smart Cookie
- Others: Various special cases

**Date Format**:
- Format: `"2026/01/28"` (YYYY/MM/DD string)
- Different from Digital Cookie Excel dates
- Can be parsed directly as a standard date string

**Field Name Variations**:
- API has inconsistent field names across endpoints
- `order_number` or `orderNumber`
- `id` or `cookieId` in cookies array
- `total` or `totalPrice`
- **MUST use a fallback pattern**: when reading any of these fields, try the primary name first, then the alternate name, defaulting to an empty string or zero as appropriate.

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

### Parsing Summary

To parse Smart Cookie API data: iterate through the `orders` array and for each order, read the `transfer_type` field (not `type`) for the actual transfer classification, and convert the order number to a string. For each cookie entry in the order's `cookies` array, look up the numeric `id` (falling back to `cookieId`) in the cookie ID map to get the variety name, and take the absolute value of the quantity. Skip cookies with zero quantity. Sum all cookie absolute quantities to get total packages. Check the `virtual_booth` flag to determine whether it counts toward physical inventory. Store the date, transfer type, order number, to/from fields, total packages, variety breakdown, absolute dollar amount, and virtual booth flag for each transfer.

### Common Mistakes

❌ **Don't:**
- Use `order.type` for transfer type (always "TRANSFER")
- Forget to map cookie IDs to names
- Include virtual booth transfers in physical inventory
- Forget to take absolute value of quantities
- Assume consistent field names across API responses

✅ **Do:**
- Always use `order.transfer_type` for actual type
- Map numeric cookie IDs using the cookie ID map
- Track virtual booth separately from physical inventory
- Use absolute values for all quantities and totals
- Use fallback pattern for field names

---

## Digital Cookie Format

**File**: `OrderDataTroop_*_YYYY-MM-DD_HH.MM.SS.SSS.xlsx`

### Expected Columns

**Note:** All column names are available as constants in `constants.js` under `DC_COLUMNS`.

**Key Fields:** Girl names, order number, order date/type/status, payment/ship status, cookie varieties, package totals, refunds, donations, and sale amounts.

Column names are defined in `constants.js` under `DC_COLUMNS`. Use those constants when accessing row fields to avoid hardcoding column name strings.

**See:** `constants.js` -> `DC_COLUMNS` for complete field list.

### Critical Edge Cases

**Date Format**: Digital Cookie uses Excel serial dates (e.g., `46053.55347222222`), which represent the number of days since January 0, 1900 (effectively December 30, 1899). To convert, add the serial number of days (in milliseconds) to the epoch of December 30, 1899.

**Order Status Values**:
- `Completed` = finished
- `Delivered` = ALSO finished (not pending!)
- Both should be treated as completed

**Numeric Fields as Strings**:
- Excel parser returns some numbers as strings
- MUST parse integers and floats explicitly when reading numeric columns like `Total Packages` or `Current Sale Amount`.

**Revenue Calculation**:
- `Current Sale Amount` = total including shipping
- `Current Subtotal` = cookie revenue only (excludes S&H)
- `Current S & H` = shipping and handling
- The sale amount should equal the subtotal plus shipping.

**Cookie Pricing**:
- Most varieties: $6/package
- **Caramel Chocolate Chip: $7/package** (special pricing!)
- Cookie Share (donation): $6/package

**Net Packages**:
- Must subtract `Refunded Packages` from `Total Packages (Includes Donate & Gift)` to get the actual net package count.

**Donation Packages**:
- Counted in `Total Packages` but no variety breakdown
- Separate `Donation` field shows count
- Priced at $6/package

**Status Values**:

*Order Status*:
- `Completed`
- `Delivered` (also means completed!)
- `Pending`
- `Cancelled`

*Payment Status*:
- `CAPTURED`
- `CASH`
- `PENDING`

*Ship Status*:
- `Delivered`
- `Shipped`
- `N/A` (for non-shipped orders)

---

## Smart Cookie Transfer Format

**File**: `CookieOrders.xlsx`

### Expected Columns
- `DATE`, `ORDER #`, `TYPE`, `TO`, `FROM`
- Cookie varieties (abbreviated): `CShare`, `ADV`, `EXP`, `LEM`, `TRE`, `TM`, `PBP`, `CD`, `PBS`, `GFC`
- `TOTAL`, `TOTAL $`, `STATUS`

### Critical Edge Cases

**Corrupted Excel Range**:
- Sheet `!ref` property often wrong (says `A1:C1` when actually `A1:R100`)
- MUST manually fix range before parsing
- Look for cells beyond reported range

**Order Number Prefixes**:
- `D` prefix = Digital Cookie orders (D229584475)
- `S` prefix = Direct Ship orders (S207787166)
- `TDS`/`TDSD` = Troop Direct Sales
- Numeric only = Internal troop transfers (16491)

**Matching Logic**: To match a Digital Cookie order to a Smart Cookie Transfer, strip the leading `D` prefix from the SC Transfer's `ORDER #` field and compare to the DC order number.

**Negative Numbers**:
- Negative = inventory OUT (deliveries, sales)
- Positive = inventory IN (pickups, returns)
- Must use absolute values when displaying to users

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

Column names are defined in `constants.js` under `SC_REPORT_COLUMNS`. Use those constants when accessing row fields.

**See:** `constants.js` -> `SC_REPORT_COLUMNS` for complete field list.

### Critical Edge Cases

**Cases/Packages Format**:
- All cookie columns use `"cases/packages"` format
- Example: `"0/8"` = 0 cases, 8 packages = 8 total
- Example: `"2/5"` = 2 cases, 5 packages = 29 total
- Split the string on `/`, parse both parts as numbers, then compute total as (cases times 12) plus packages.

**Boolean Fields**:
- `CShareVirtual`: String `"TRUE"` or `"FALSE"` (NOT an actual boolean!)
- `IncludedInIO`: String `"Y"` or `"N"` (NOT an actual boolean!)
- Must compare these as strings. Comparing against actual `true` or `false` boolean values will never match.

**Date Format**:
- String format: `"01/25/2026 11:20:42 AM"`
- Different from Digital Cookie Excel dates
- Can be parsed directly as a standard date string

**Order ID Matching**:
- `OrderID` and `RefNumber` both contain order number
- These match directly to the Digital Cookie `Order Number` field with no prefix stripping needed.

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
| Caramel Chocolate Chip | GFC | C11 | $7 |
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

1. **Digital Cookie to Smart Cookie Report**: Direct 1:1 match -- the DC order number equals the SC Report OrderID with no transformation needed.

2. **Digital Cookie to Smart Cookie Transfers**: Strip the leading `D` prefix from the SC Transfer order number, then compare to the DC order number.

3. **Order Number Classification**:
   - 9-digit numeric = Digital Cookie order
   - D + 9-digit = Same order in Smart Cookie
   - S + 9-digit = Direct ship (not in DC)
   - 5-6 digit numeric = Internal troop transfer (not in DC)

---

## Common Filters

### Get Only Girl Orders (Exclude Troop Site)
Filter out any orders where the girl's last name is `"Site"`. These are troop booth sales, not individual girl orders.

### Get Only Troop Site Orders
Keep only orders where the girl's last name is `"Site"`. These represent booth or site sales attributed to the troop rather than an individual scout.

### Get Completed Orders
Include orders where the order status is either `"Completed"` or `"Delivered"`. Both statuses indicate the order is finished.

### Get Digital Cookie Orders from SC Transfers
Filter SC transfers to those whose type includes `"COOKIE_SHARE"` and whose order number starts with `"D"`. These represent Digital Cookie donation orders that have synced to Smart Cookie.

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
   - Use absolute values for display

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
- Always round to 2 decimal places for display
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
- [ ] DC order count ~ SC Report order count?
- [ ] SC Transfer orders < 20% of DC orders?
- [ ] All order numbers are 5-9 digits?
- [ ] No negative packages (after refunds)?
- [ ] Revenue matches package counts x pricing?
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
- Use exact string equality for DC/SC Transfer order matching (need to strip prefix)
- Expect all DC orders in SC Transfers (only ~10% will be there)
- Use boolean comparison for `CShareVirtual` or `IncludedInIO`
- Forget Caramel Chocolate Chip is $7 (not $6)

✅ **Do:**
- Always parse numeric strings to integers or floats
- Check both "Completed" AND "Delivered" for done orders
- Remember Caramel Chocolate Chip is $7 (not $6)
- Use absolute values for SC Transfer display
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
