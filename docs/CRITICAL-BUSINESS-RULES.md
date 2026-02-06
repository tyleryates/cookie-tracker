# Critical Business Rules & Implementation Details

**Last Updated:** 2026-02-04
**Purpose:** Document critical business logic, edge cases, and implementation decisions that must be preserved when resuming development

---

## Table of Contents

1. [When Packages Are "Sold"](#when-packages-are-sold)
2. [Transfer Types & What They Mean](#transfer-types--what-they-mean)
3. [Cookie Share (Virtual Donations)](#cookie-share-virtual-donations)
4. [Site Orders & Booth Sales](#site-orders--booth-sales)
5. [Inventory Calculations](#inventory-calculations)
6. [Cases vs Packages](#cases-vs-packages)
7. [Cookie ID Mapping](#cookie-id-mapping)
8. [Data Sources: Primary vs Supplemental](#data-sources-primary-vs-supplemental)
9. [Revenue Calculations](#revenue-calculations)
10. [UI/UX Patterns](#uiux-patterns)
11. [Common Pitfalls & Gotchas](#common-pitfalls--gotchas)

---

## When Packages Are "Sold"

### ⚠️ CRITICAL BUSINESS RULE

**Smart Cookie counts multiple transfer types as "SOLD", not just T2G.**

**What Smart Cookie Counts:**
- **T2G** - Scout picks up inventory from troop stock (primary sales mechanism)
- **D** - Digital Cookie orders that synced to Smart Cookie
- **DIRECT_SHIP** - Orders shipped directly from supplier to customer
- **COOKIE_SHARE** - Virtual Cookie Share donation orders

**What Smart Cookie EXCLUDES:**
- **C2T** - Incoming inventory from council (not sold, just received)
- **PLANNED** - Future orders that haven't been completed yet (status: SAVED)

### Initial Misunderstanding (CORRECTED)

**Initial assumption:** D transfers were just sync records and shouldn't be counted (would double-count with T2G).

**Reality discovered through investigation:** Smart Cookie DOES count D transfers separately. These are not duplicates of T2G transfers - they represent different sales mechanisms that both count toward total.

**Verification:**
- Smart Cookie dashboard: 769 packages sold
- Breakdown: T2G (651) + D (31) + DIRECT_SHIP (66) + COOKIE_SHARE (21) = 769 ✓

**Solution:**
```javascript
// ✓ CORRECT - Count T2G
if (transfer.type === 'T2G') {
  totalSold += transfer.packages || 0;
}

// ✓ CORRECT - Also count D, DIRECT_SHIP, COOKIE_SHARE
// But exclude C2T (incoming) and PLANNED (future)
else if (transfer.type && transfer.packages > 0) {
  const isCtoT = transfer.type === 'C2T' || transfer.type === 'C2T(P)' || transfer.type.startsWith('C2T');
  const isPlanned = transfer.type === 'PLANNED';
  if (!isCtoT && !isPlanned) {
    totalSold += transfer.packages || 0;
  }
}
```

### Smart Cookie Dashboard Verification

Smart Cookie's "Packages Sold" metric counts T2G + D + DIRECT_SHIP + COOKIE_SHARE transfers. Our app must match this exactly.

**Test:** Sum all varieties shown in Smart Cookie dashboard → Should equal our "Packages Sold" number

**See also:**
- [DATA-FORMATS.md - Transfer Type Field](DATA-FORMATS.md#critical-type-vs-transfer_type-field) - API structure details
- [IMPLEMENTATION-NOTES.md - Transfer Type Filtering](IMPLEMENTATION-NOTES.md#transfer-type-filtering) - Code implementation
- [DATA-SOURCES-PRIORITY.md](DATA-SOURCES-PRIORITY.md) - Why Smart Cookie totals are authoritative

---

## Transfer Types & What They Mean

### C2T (Council to Troop)

**Full Name:** Council to Troop
**API Format:** `C2T(P)` or `C2T`
**Direction:** Incoming to troop (+)
**Meaning:** Troop picks up inventory from Cookie Cupboard

**When This Happens:**
- Initial Order on Delivery Day
- Cupboard Orders during the season

**Data Characteristics:**
- Positive package quantities in API
- Has `total_cases` field (divide by 12 to get cases from packages)
- Always includes variety breakdown

### T2G (Troop to Girl)

**Full Name:** Troop to Girl
**API Format:** `T2G`
**Direction:** Outgoing from troop (-)
**Meaning:** Scout picks up inventory from troop stock

**⚠️ THIS IS THE "SOLD" MOMENT**

**When This Happens:**
- Scout picks up cookies to fulfill orders
- Scout receives booth sales credits
- Virtual booth sales allocated via Smart Booth Divider

**Data Characteristics:**
- Negative package quantities in API (use Math.abs())
- May include `virtualBooth: true` flag (booth credits, no physical transfer)
- May include Cookie Share (virtual, exclude from physical inventory)
- Includes variety breakdown

### D (Digital Cookie Sync)

**Full Name:** Digital Cookie Sync
**API Format:** `D`
**Direction:** Varies
**Meaning:** Digital Cookie order synced to Smart Cookie

**⚠️ COUNTED AS "SOLD"**

**When This Happens:**
- Digital Cookie orders sync to Smart Cookie
- Smart Cookie counts these toward "Packages Sold"
- NOT duplicates of T2G transfers - these are separate sales that both count

**Data Characteristics:**
- Order numbers prefixed with "D" in transfer lists
- Represents completed Digital Cookie orders
- **MUST BE INCLUDED** in "Packages Sold" calculations

**Important:** Initial assumption that D transfers were just sync records (not counted) was incorrect. Investigation confirmed Smart Cookie dashboard includes D transfers in the "Packages Sold" total.

---

## Cookie Share (Virtual Donations)

### What It Is

Cookie Share = Virtual donation where customer pays for cookies that are donated to military/charity.

**Key Point:** Scout collects money but never physically handles these cookies.

### Data Representation

**In Digital Cookie:**
- Separate `Donation` field (package count)
- Included in `Total Packages (Includes Donate & Gift)`
- Order types: "Donation", "In Person with Donation", "Cookies in Hand with Donation"

**In Smart Cookie:**
- Cookie ID: 37
- May appear in T2G transfers (virtual allocation)
- Price: $6/package (same as most cookies)

### Inventory Impact

**CRITICAL:** Cookie Share is VIRTUAL - exclude from physical inventory calculations

```javascript
// Exclude Cookie Share from physical inventory
const physicalPackages = totalPackages - cookieShareCount;

// But DO count in "Packages Sold" total
totalSold += transfer.packages || 0; // Includes Cookie Share
```

### Manual Entry Requirements

Not all Cookie Share orders auto-sync to Smart Cookie. Requires manual entry if:
- Order has `Payment Status: "CASH"` (not credit card)
- Order type is "In Person Delivery with Donation" (credit card)
- Order type is "Cookies in Hand with Donation" (credit card)

**Auto-Sync (no action needed):**
- "Shipped with Donation" + credit card (`CAPTURED`)
- "Donation" only + credit card (`CAPTURED`)

**See also:**
- [EDGE-CASES.md - Cookie Share Edge Cases](EDGE-CASES.md#cookie-share-donations-edge-cases) - Display patterns and pricing
- [PROGRAM-KNOWLEDGE.md - Virtual Cookie Share](PROGRAM-KNOWLEDGE.md) - Domain context and workflow

---

## Site Orders & Booth Sales

### What Are Site Orders?

**Digital Cookie Identifier:**
- First Name: `Troop1234` (or other troop number)
- Last Name: `Site`

**Meaning:** Online booth sales not yet attributed to individual scouts

**Where They Come From:**
- Troop website sales
- QR code sales
- Virtual booth sales

### Critical Business Rule

**Site orders are booth sales fulfilled from troop stock and MUST reduce troop inventory.**

```javascript
// Track physical packages from Site orders
if (isSiteOrder) {
  const physicalPackages = packages - donations;
  if (!isShipped && !isDonationOnly) {
    siteOrdersPhysical += physicalPackages;
  }
}

// Subtract from troop inventory
totalInventory -= siteOrdersPhysical;
```

### Why This Matters

**Example:**
- Troop has 359 packages after C2T pickups and T2G allocations
- 2 packages were site orders delivered directly to customers from troop stock
- These 2 packages are gone but weren't recorded as T2G transfers
- Actual troop inventory: 359 - 2 = **357 packages**

### Reporting Site Orders

**In Scout Summary:** Site orders are classified as TROOP_GIRL_DELIVERY or TROOP_DIRECT_SHIP.

**Current Implementation:** Site orders are handled during `buildSiteOrdersDataset()` and allocations are tracked in `scout.credited` fields.

**See:**
- [SALES-TYPES.md - Type 3 & 4](SALES-TYPES.md) for complete site order classification
- [RECONCILIATION.md - buildSiteOrdersDataset](RECONCILIATION.md#build-site-orders-dataset-with-allocations) for implementation details

---

## Inventory Calculations

### Physical vs Virtual Items

**Physical items** (require inventory):
- Regular cookie packages
- Shipped orders (from supplier, not troop stock)

**Virtual items** (NO inventory needed):
- Cookie Share donations
- Virtual booth credits (`virtualBooth: true`)
- Direct ship orders (fulfilled by supplier)

### Net Troop Inventory Formula

```
Net Troop Inventory =
  C2T (picked up from council)
  - T2G (allocated to scouts, physical only)
  - Site Orders (booth sales from troop stock)
```

### Scout Net Inventory Formula

```
Scout Net Inventory =
  T2G Received (physical packages only)
  - Orders Needing Delivery (physical packages only)
```

**Exclusions from both calculations:**
- Cookie Share (virtual)
- Virtual booth credits
- Shipped orders (direct from supplier)

### "With Donation" Orders

Orders like "Cookies in Hand with Donation" contain BOTH physical cookies AND virtual Cookie Share.

**The Critical Issue:**
The `Total Packages (Includes Donate & Gift)` field includes BOTH physical cookies and virtual Cookie Share donations. Only the physical cookies need inventory.

**Example:**
```
Order: "Cookies in Hand with Donation"
Total Packages: 10
Donation: 2 (Cookie Share)
Physical Packages Needing Inventory: 10 - 2 = 8
```

**Why This Matters:**
If an order has 10 total packages but includes 2 Cookie Share donations, the scout only needs to deliver 8 physical packages. The 2 Cookie Share packages are virtual (donated to military/charity) and never physically handled.

**Implementation:**
```javascript
// Total includes both physical and virtual
const totalPackages = parseInt(row['Total Packages (Includes Donate & Gift)']) || 0;
const donations = parseInt(row['Donation']) || 0;

// Only physical packages need inventory
const physicalPackages = totalPackages - donations;

// Use physicalPackages for inventory tracking
if (!isShipped && !isDonationOnly) {
  scoutSummary[name].packages += physicalPackages;  // NOT totalPackages!
}
```

**Bug If Wrong:**
Using `totalPackages` instead of `physicalPackages` will inflate inventory needs and cause negative inventory calculations.

---

## Cases vs Packages

### Conversion

**1 Case = 12 Packages**

### Smart Cookie Data

**In API (`total_cases` field):**
- Contains total PACKAGES (not cases)
- Divide by 12 to get cases: `Math.round(total_cases / 12)`

**In Reports:**
- Display both cases and packages
- Cases column shows: `Math.round(packages / 12)`
- Tooltips show variety breakdown in cases

### Cookie Cupboard Orders

Troops order from council in CASES, but inventory is tracked in PACKAGES internally.

**UI Display:**
- Show cases for C2T pickups (that's how orders are placed)
- Show packages for T2G allocations (that's how scouts think)
- Always show both for troop inventory

---

## Cookie ID Mapping

### Smart Cookie API Format

Smart Cookie API uses numeric IDs instead of names. **This mapping is hardcoded and verified.**

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

**Verification Method:** Export CSV from Smart Cookie, compare quantities to API data by ID.

**If IDs change:** Only likely between seasons. Re-verify mapping if totals don't match.

### Display Order

Cookies always displayed in this order across ALL reports:

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

**Implementation:** Use `sortVarietiesByOrder()` helper function

---

## Data Sources: Primary vs Supplemental

### Smart Cookie = PRIMARY

**Source of truth for:**
- Packages Sold (official billing number)
- Inventory (C2T pickups, T2G allocations)
- Financial tracking
- Troop/Scout totals

**Rule:** When numbers differ, Smart Cookie is correct.

### Digital Cookie = SUPPLEMENTAL

**Provides:**
- Customer details
- Order specifics
- Variety breakdowns for orders
- Payment status

**Limitation:** Digital Cookie numbers may differ from Smart Cookie due to sync timing.

### Reconciliation Priority

1. Use Smart Cookie T2G transfers for "Packages Sold"
2. Use Digital Cookie for order details and customer info
3. Use Digital Cookie for Cookie Share manual entry detection
4. Cross-reference order numbers between systems

---

## Revenue Calculations

### Pricing

**Standard cookies:** $6/package
- Thin Mints, Caramel deLites, Peanut Butter Patties, etc.
- Cookie Share donations

**Special pricing:** $7/package
- Caramel Chocolate Chip (Gluten-Free)

### Revenue Sources

**Total Revenue comes from Smart Cookie:**
```javascript
// Sum all T2G transfer amounts
totalRevenue += transfer.amount || 0;
```

**Do NOT calculate revenue from pricing × packages.** Use actual transaction amounts from Smart Cookie.

**Why:** Discounts, refunds, adjustments are already reflected in Smart Cookie amounts.

---

## UI/UX Patterns

### Horizontal Stats Layout

All summary stats use consistent horizontal grid layout:

```javascript
// Helper function for DRY stats display
createHorizontalStats([
  { label: 'Metric Name', value: 123, description: 'Context', color: '#2196F3' },
  // ... more stats
]);
```

**Colors:**
- Blue (#2196F3) - Totals, orders
- Green (#4CAF50) - Sales, positive metrics
- Orange (#ff9800) - Warnings, manual actions needed
- Purple (#9C27B0) - Inventory, current state

### Tooltips (Tippy.js)

**Configuration:**
- 100ms delay before showing
- No arrow (simple box)
- Interactive (text selectable)
- `white-space: pre` (no word wrapping)
- Variety lists sorted by cookie order

**Implementation:**
```javascript
// In HTML, add data-tooltip attribute
<td class="tooltip-cell" data-tooltip="Thin Mints: 10\nCaramel deLites: 5">

// JavaScript auto-initializes via MutationObserver
```

### Date Formatting

**Display format:** MM/DD/YYYY
**Storage format:** YYYY-MM-DD or YYYY/MM/DD

```javascript
formatDate('2026/01/28') → '01/28/2026'
```

### Report Naming

- **Troop Summary** - High-level troop metrics
- **Scout Summary** - Individual scout details with expandable orders
- **Inventory** - Net troop inventory by variety, C2T/T2G history
- **Cookie Varieties** - Sales breakdown by cookie type (excludes Cookie Share from %)
- **Virtual Cookie Share** - Reconciliation and manual entry requirements

---

## Common Pitfalls & Gotchas

### 1. Excluding Transfer Types That Smart Cookie Counts

**Problem:** Not counting D, DIRECT_SHIP, or COOKIE_SHARE transfers because they seem like duplicates or non-sales
**Solution:** Smart Cookie counts ALL of these types. Only exclude C2T (incoming inventory) and PLANNED (future orders)
**Note:** Initial assumption that D transfers shouldn't be counted was incorrect - verified they ARE included in Smart Cookie's "Packages Sold"

### 2. Cookie Share in Inventory

**Problem:** Counting Cookie Share as physical inventory
**Solution:** Subtract Cookie Share from package counts before inventory calculations

### 3. Site Orders Forgotten

**Problem:** Troop inventory doesn't account for site orders fulfilled from stock
**Solution:** Track `siteOrdersPhysical` and subtract from `totalInventory`

### 4. Virtual Booth Credits

**Problem:** Counting booth credits as physical inventory
**Solution:** Check `virtualBooth: true` flag and exclude from inventory

### 5. "With Donation" Orders

**Problem:** Counting full package total when some are Cookie Share
**Solution:** Subtract `donations` field from `totalPackages` to get `physicalPackages`

### 6. Variety Order Inconsistency

**Problem:** Tooltips showing cookies in different order than reports
**Solution:** Always use `sortVarietiesByOrder()` for variety lists

### 7. Cases Calculation

**Problem:** Using `total_cases` as-is when it contains packages
**Solution:** Divide by 12: `Math.round(total_cases / 12)`

### 8. Smart Cookie Status

**Problem:** Empty `status` field in API doesn't mean pending
**Solution:** Check `actions` object for pending state indicators

### 9. Credential Storage

**Problem:** Plain text credentials in early versions
**Solution:** Use Electron `safeStorage` API (OS keychain)

### 10. Tooltip Clipping

**Problem:** CSS tooltips clipped by overflow containers
**Solution:** Use Tippy.js with `position: fixed` and dynamic positioning

---

## Quick Decision Reference

**When should I count this toward "Packages Sold"?**
- T2G transfer → YES ✓
- D transfer → YES ✓ (initially thought NO, but Smart Cookie counts these)
- DIRECT_SHIP transfer → YES ✓
- COOKIE_SHARE transfer → YES ✓
- C2T transfer → NO ✗ (that's inventory IN, not sold)
- PLANNED transfer → NO ✗ (future orders, not completed)

**Does this reduce troop inventory?**
- T2G transfer (physical) → YES ✓
- Site order (not shipped) → YES ✓
- Cookie Share → NO ✗
- Virtual booth credit → NO ✗
- Shipped order → NO ✗ (fulfilled by supplier)

**Does this require physical inventory?**
- "In Person Delivery" → YES ✓
- "Cookies in Hand" → YES ✓
- "Shipped" → NO ✗
- "Donation" only → NO ✗
- Cookie Share in "with Donation" → NO ✗

**Should this appear in which report section?**
- Site orders → Booth Sales column
- Regular scout orders → Sales column
- Virtual booth credits → Booth Sales column
- Shipped orders → Direct Ship column

---

## Testing Checklist

When making changes, verify:

- [ ] "Packages Sold" matches Smart Cookie dashboard exactly
- [ ] Net Troop Inventory = (C2T total) - (T2G physical) - (Site orders physical)
- [ ] Cookie Share excluded from inventory calculations
- [ ] Site orders showing under Booth Sales, not Sales
- [ ] Tooltips show varieties in correct order
- [ ] No double-counting of D transfers
- [ ] Cases = Packages ÷ 12 (rounded)
- [ ] Virtual booth credits excluded from physical inventory
- [ ] Revenue matches Smart Cookie (not calculated from pricing)
- [ ] All horizontal stats use createHorizontalStats() helper

---

## Document History

- **2026-02-04** - Initial creation capturing all critical business rules and recent fixes
- Consolidates knowledge from MEMORY.md and code review
- Intended as permanent reference for development continuation
