# Cookie Tracker Rules

This is critical, fundamental information to the system. Always reference these rules before making code changes.

## Development Guidelines

- Any logic about how to classify orders, transfers, etc, from raw data should be cataloged here rather than kept in Claude memory.
- Always assume a new session with clear context may be started.
- It is worth significant refactors to ensure adherence to these rules.

### Data Classification Tenet

Every displayed value should trace to raw data through at most one classification step: `report.value = sum(items.where(category == X).field)`. No subtracting edge cases, no remainder calculations, no computing displayed values from other computed values. See [Principle #6 in DESIGN-PRINCIPLES.md](docs/DESIGN-PRINCIPLES.md).

### Purpose

The most important feature of this app is data reconciliation.

- Reconciliation is done first ahead of reporting, as reports reference the same data multiple times.
- Avoid calculations at the reporting layer — pre-compute in data-processing.
- If data cannot be classified with pre-existing rules, the app should warn or error so it can be fixed.
- This app tracks monies owed — it is better to be correct than to make assumptions.

---

## App Overview

An Electron desktop app for tracking orders (sales), finances, and inventory for a Girl Scout troop's cookie sales. All information is tracked by GIRL or TROOP.

### Cookies

Cookies are sold by the PACKAGE (box). There are 12 packages in a CASE. The app tracks both GIRL and TROOP inventories. Some sales are DONATION (Cookie Share) which do not affect physical inventory.

### Cookie Pricing

Most varieties are $6/package. **Caramel Chocolate Chip is $7/package** (the only exception). Cookie Share donations are $6/package.

### Systems

**Digital Cookie (DC)** — A website/app where customers place orders on a GIRL's or TROOP's page, accepting CASH, CREDIT_CARD, or VENMO payments.

**Smart Cookie (SC)** — A system for inventory transfers (COUNCIL→TROOP, TROOP→GIRL), allocating TROOP sales to GIRLS, financial tracking, and booth management.

The two systems share some information automatically but not all. The app reconciles data between them.

---

## Data Source Hierarchy

**Smart Cookie is the PRIMARY source of truth for:**
- Packages Sold (official billing number)
- Inventory (C2T pickups, T2G allocations)
- Financial Tracking (money owed, payments)
- Troop Totals (overall metrics)

**Why:** Smart Cookie is what Girl Scouts uses for billing, financial reconciliation, and official reporting.

**Digital Cookie is SUPPLEMENTAL and provides:**
- Customer Details (names, addresses, contact info)
- Order Specifics (payment method, shipping preferences)
- Variety Breakdowns (what cookies were in each order)
- Payment Status (CAPTURED, CASH, PENDING)

**Why:** Digital Cookie is one sales channel. Data flows TO Smart Cookie, not the other way.

### Conflict Resolution

When SC and DC numbers differ:

| Data Type | Trust | Reason |
|-----------|-------|--------|
| Packages Sold | Smart Cookie | Official billing number |
| Inventory Levels | Smart Cookie | Only SC tracks C2T/T2G |
| Revenue/Financials | Smart Cookie | SC handles all billing |
| Scout Total Sold | Smart Cookie | SC "Packages Sold" is authoritative |
| Customer Details | Digital Cookie | DC has richer order metadata |
| Payment Method | Digital Cookie | SC doesn't track payment type |
| Variety Breakdown | Digital Cookie | SC API doesn't always break down by variety |
| Order Date/Time | Digital Cookie | DC records at transaction time |

---

## Financial Tracking

### Scout-Troop Financial Relationship

When a scout receives T2G inventory from the troop, this creates a financial obligation. The scout owes the troop for cookies received.

**Payment Methods:**
- **CASH** — Scout collects cash from customers and pays back to troop
- **CREDIT_CARD** — Digital Cookie collects and sends to council/troop (auto-reduces obligation)
- **VENMO** — Digital Cookie collects and sends to council/troop (auto-reduces obligation)

### Cash Owed Calculation

Cash Owed = Inventory Value − Electronic Payments Collected

- Inventory Value = Packages picked up × Price per package (using each variety's price)
- Electronic Payments = Sum of CREDIT_CARD and VENMO order revenue from DC
- Cash Owed = What the scout still needs to pay the troop in cash

### Troop Proceeds

Troops earn $0.90 per package on all packages they are financially responsible for.

**Formula:** Troop Proceeds = (C2T Received + Cookie Share + Direct Ship) × $0.90

**Components:**
- **C2T Received** — Physical packages picked up from council (includes packages still in troop inventory, not yet allocated to scouts)
- **Cookie Share** — Virtual donations (not physical inventory, but counts for proceeds)
- **Direct Ship** — Orders shipped from supplier (troop never handles, but gets proceeds)

**Why this formula:** The troop is financially responsible for ALL packages received from council, regardless of whether they've been allocated to scouts yet. Packages sitting in troop inventory still count.

**Verification:** Compare against Smart Cookie CSV export fields: `ProceedInitialQty × InitialMultiplier = TroopProceed`

---

## Sales Channels & Fulfillment Methods

There are 6 distinct types of sales classified along two independent dimensions:

| Dimension | Values | Purpose |
|-----------|--------|---------|
| **OWNER** | `GIRL`, `TROOP` | Who does the sale belong to? |
| **ORDER_TYPE** | `DELIVERY`, `DIRECT_SHIP`, `BOOTH`, `IN_HAND`, `DONATION` | How was the sale fulfilled? |

### Girl's Orders (Scout-Initiated)

**1. Girl Delivery** — Order on scout's DC site, scout delivers in person. Requires scout inventory. Shows in "Delivered" column.

**2. Girl Direct Ship** — Order on scout's DC site, supplier ships to customer. Zero inventory impact (scout never touches packages). Shows in "Shipped" column.

**3. Cookies in Hand (Door-to-Door)** — Scout carries inventory and sells in person. Requires scout inventory. Shows in "Delivered" column.

### Troop Orders (Booth/Site Sales)

**4. Troop Virtual Delivery (Online Booth Sales)** — Order on troop DC site for local delivery. Fulfilled from troop stock. Allocated to scouts via Smart Virtual Booth Divider. Credits individual scouts (virtual — no physical transfer to scout). Shows in scout's "Credited" column.

**5. Troop Direct Ship** — Order on troop DC site for shipment. Supplier ships directly. Allocated via Smart Direct Ship Divider. Zero inventory impact. Shows in scout's "Credited" column.

**6. Physical Booth Sales** — In-person booth/walk-up sales from troop inventory. Allocated via Smart Booth Divider (per-reservation, per-girl). Reduces troop stock. Shows in scout's "Credited" column.

### DC Order Type String → Internal Classification

The DC `Order Type` column determines the internal classification. Owner is determined by whether the order is on a "Site" row (last name = "Site").

| DC `Order Type` string | Site? | Owner | ORDER_TYPE | Inventory Impact |
|------------------------|-------|-------|------------|-----------------|
| `"In-Person Delivery"` / `"In Person Delivery"` | Yes | TROOP | DELIVERY | Uses troop inventory |
| `"Shipped ..."` | Yes | TROOP | DIRECT_SHIP | None (supplier ships) |
| `"Cookies In Hand ..."` | Yes | TROOP | BOOTH | Uses troop inventory |
| `"In-Person Delivery"` / `"In Person Delivery"` / `"Pick Up"` | No | GIRL | DELIVERY | Uses girl inventory |
| `"Shipped ..."` | No | GIRL | DIRECT_SHIP | None (supplier ships) |
| `"Cookies In Hand ..."` | No | GIRL | IN_HAND | Uses girl inventory |
| `"Donation"` | Either | Either | DONATION | None |

**Classification logic:** Check for "Donation" first (exact match), then "Shipped" (contains), then "Cookies In Hand" (contains), then "In-Person Delivery" / "In Person Delivery" / "Pick Up" (contains). All checks are case-insensitive. Unknown types should trigger a warning.

### Inventory Effect Rules

An order "needs inventory" (from the girl's perspective) when: `owner === GIRL` AND `orderType` is `DELIVERY` or `IN_HAND`.

### Report Column Meanings

| Column | Description | Inventory Impact |
|--------|-------------|------------------|
| **Delivered** | Physical packages for in-person delivery (girl's own sales) | Reduces scout inventory |
| **Picked Up** | T2G inventory received from troop (physical only) | Increases scout inventory |
| **Inventory** | Net: Picked Up − Delivered (negative = shortage) | — |
| **Booth** | Booth sales credited to scout (from Smart Booth Divider) | None (credit only) |
| **Credited** | Troop virtual booth + direct ship allocations | None (credit only) |
| **Shipped** | Scout's own direct ship orders | None (supplier ships) |
| **Donations** | Virtual Cookie Share packages | None (virtual) |
| **Total Sold** | Delivered + Shipped + Donations + Booth + Credited | — |

---

## Cookie Share (Virtual Donations)

Cookie Share represents donations where scouts collect money but don't handle physical cookies (sent to military/charity via Operation Thin Mint).

**Price:** $6/package
**Inventory Impact:** ZERO (virtual — always exclude from physical inventory)

### Three Independent Sources

A girl's total Cookie Share comes from three sources that must be reconciled:

**Source 1: Digital Cookie Donations (Per-Girl)**

Some auto-sync to SC, others require manual entry:

| Order Type | Payment | Auto-Sync? | TCM Action |
|-----------|---------|------------|------------|
| Donation | CAPTURED (credit card) | Yes | None |
| Donation | CASH | **No** | Create Virtual Cookie Share in SC |
| Shipped with Donation | CAPTURED | Yes | None |
| Shipped with Donation | CASH | **No** | Create Virtual Cookie Share in SC |
| In Person Delivery with Donation | Any | **No** | Create Virtual Cookie Share in SC |
| Cookies in Hand with Donation | Any | **No** | Create Virtual Cookie Share in SC |

**Key rule:** Auto-sync only occurs when payment is "CAPTURED" (credit card) AND order type is "Shipped" or "Donation" (exact). In-person delivery types NEVER auto-sync regardless of payment. CASH payment types NEVER auto-sync regardless of order type.

**Important:** Site orders (last name "Site") are excluded from DC Cookie Share tracking. Booth sale donations are handled by booth dividers (Source 2), not manual Virtual Cookie Share entry.

**Source 2: Booth Divider Cookie Share (Per-Girl, Automatic)**

When a booth sells Cookie Share packages and the TCM distributes in Smart Cookie, the booth divider automatically creates COOKIE_SHARE entries for each girl. These have a `smart_divider_id` on the API response. No manual work required.

**Source 3: Manual Virtual Cookie Share Entries (Per-Girl)**

TCM's manual entries in SC under Orders → Virtual Cookie Share. Identified in SC API by having NO `smart_divider_id` (null). This is what the reconciliation report tracks.

### Reconciliation Logic

For each girl: **Adjustment = DC Manual Needed − SC Manual Entered**

- **Positive (orange):** Add packages to SC Virtual Cookie Share
- **Negative (red):** Remove over-entered packages
- **Zero (green):** Reconciled, no action needed

**Total Cookie Share per girl** = DC donations (all types) + Booth divider CS. This total should match the SC "Packages Sold" report Cookie Share value exactly.

### What Counts as SC Manual Entries

SC Cookie Share transfers are counted as manual when ALL of these are true:
1. Transfer type includes "COOKIE_SHARE"
2. Order number does NOT start with "D" (excludes DC auto-synced)
3. Transfer is NOT a booth divider (excludes automatic booth allocations)

### T2G Transfers Do NOT Contain Cookie Share

When a booth divider distributes cookies, SC creates separate records: T2G transfers per girl for physical cookies only, and COOKIE_SHARE "remainder" entries for donation packages. The booth divider exclusion for manual entry counting is correct.

---

## Smart Cookie Transfer Types

The SC API returns all record types through `/orders/search`. Each transfer is assigned a `TRANSFER_CATEGORY` at creation time (see `classifyTransferCategory()` in `data-reconciler.ts`). Reports dispatch on `category`, not raw `transfer_type`.

| Transfer Type | Category | Direction | Meaning | Counted as "Sold"? |
|--------------|----------|-----------|---------|-------------------|
| **C2T** / **C2T(P)** / **T2T** | `COUNCIL_TO_TROOP` | IN (+) | Troop picks up from council | No (inventory in) |
| **T2G** (physical pickup) | `GIRL_PICKUP` | OUT (−) | Scout picks up from troop | **Yes** |
| **T2G** (virtual booth) | `VIRTUAL_BOOTH_ALLOCATION` | OUT (−) | Troop delivery credited to scout | **Yes** |
| **T2G** (booth divider) | `BOOTH_SALES_ALLOCATION` | OUT (−) | Booth sale credited to scout | **Yes** |
| **T2G** (direct ship divider) | `DIRECT_SHIP_ALLOCATION` | OUT (−) | Troop direct ship credited to scout | **Yes** |
| **G2T** | `GIRL_RETURN` | IN (+) | Scout returns to troop | No (inventory return) |
| **D** | `DC_ORDER_RECORD` | — | DC order synced to SC | No (sync record only) |
| **COOKIE_SHARE** / **COOKIE_SHARE_D** | `COOKIE_SHARE_RECORD` | OUT (−) | Manual or DC-synced donation | No (sync record only) |
| **COOKIE_SHARE** (from booth divider) | `BOOTH_COOKIE_SHARE` | OUT (−) | Booth divider Cookie Share | No (automatic, not manual) |
| **DIRECT_SHIP** | `DIRECT_SHIP` | — | Shipped from supplier | **Yes** |
| **PLANNED** | `PLANNED` | — | Future/uncommitted order | No (not yet approved) |

### What Counts as "Sold"

Sold counting is done by individual calculators per-category rather than a central set. Categories that count as "sold": `GIRL_PICKUP`, `VIRTUAL_BOOTH_ALLOCATION`, `BOOTH_SALES_ALLOCATION`, `DIRECT_SHIP_ALLOCATION`, `DIRECT_SHIP`.

Excludes: `COUNCIL_TO_TROOP` (inventory in), `GIRL_RETURN` (returns), `DC_ORDER_RECORD` (sync record — counting it would double-count with the T2G allocation), `COOKIE_SHARE_RECORD` / `BOOTH_COOKIE_SHARE` (sync/allocation records), `PLANNED` (future).

### BOOTH_COOKIE_SHARE vs COOKIE_SHARE_RECORD

When a booth sells Cookie Share packages and the TCM distributes via Smart Booth Divider, SC creates COOKIE_SHARE entries with a `smart_divider_id`. These are categorized as `BOOTH_COOKIE_SHARE` — they are automatic and should NOT be counted as manual entries needing reconciliation. Manual Virtual Cookie Share entries (no `smart_divider_id`) are categorized as `COOKIE_SHARE_RECORD`. The Virtual Cookie Share reconciliation report uses this distinction to determine what the TCM needs to manually adjust.

### Important: Negative Quantities

All SC transfer OUT quantities are negative (e.g., T2G shows −47 for 47 packages). Always use `Math.abs()` for display and positive counting.

### Transfer Type vs Order Type (API Gotcha)

The SC API returns TWO type fields: `order.type` (always "TRANSFER" for all transfers — useless for classification) and `order.transfer_type` (the actual type: "T2G", "C2T(P)", "D", etc.). Always use `transfer_type`.

### C2T Suffix Variants

C2T transfers have suffixes: `"C2T"`, `"C2T(P)"`, potentially others. Always match using startsWith("C2T"), never exact equality.

---

## Physical vs Virtual Inventory Tracking

### Physical Items (Affect Scout Net Inventory)

- T2G transfers with category `GIRL_PICKUP` (physical pickup from troop)
- GIRL DELIVERY orders (in-person delivery)
- GIRL IN_HAND orders (cookies in hand / door-to-door)

### Virtual Items (NO Physical Inventory Impact)

- **Cookie Share** — Virtual donations (scout never handles)
- **Virtual Booth Credits** — T2G with category `VIRTUAL_BOOTH_ALLOCATION` (credit only, no physical transfer)
- **Direct Ship** — Shipped from supplier (scout never handles)
- **Booth Sales Allocations** — Credit for booth participation (from Smart Booth Divider)

### Troop Inventory Calculation

Net Troop Inventory = C2T Total − T2G Physical Total − Site Orders Physical

- **C2T Total** — All packages picked up from council
- **T2G Physical Total** — `GIRL_PICKUP` category only (excludes virtual booth, booth divider, Cookie Share)
- **Site Orders Physical** — Troop site delivery orders fulfilled from stock (excludes shipped, donation-only)

### Scout Inventory Calculation

Scout Net Inventory = T2G Physical Received − Packages Needing Delivery

Both sides exclude virtual items (Cookie Share, booth credits, direct ship).

### Negative Inventory

When a scout's net inventory is negative (sold more than received), display with a warning. This may indicate missing T2G transfers, pending refunds, or data timing issues.

---

## Orders & Sales

- Order information at the TROOP level must be assigned to individual GIRLs for credit purposes.
- TROOP sales can be assigned to multiple GIRLs.
- Assigned sales show as CREDITS tracked separately from the girl's own ORDERS.
- If there is unallocated TROOP order information, show warnings that manual action is needed.
- When order data is assigned to a GIRL, hide it from the TROOP data and show it under the GIRL.

### Direct Ship Details

**Girl Direct Ship:** Orders where a customer buys from a girl's DC site and the supplier ships directly. These count as the girl's own sales in `scout.totals.shipped`.

**Troop Direct Ship:** Site orders (last name "Site") with "Shipped" order type. These are allocated to individual scouts via the Smart Direct Ship Divider. The divider data shows per-girl credit attribution, but the packages are already counted in the Site scout's `scout.totals.shipped`.

**Important — No Double Counting:** Troop direct ship packages appear in two places: (1) Site scout's orders from DC → counted in `scout.totals.shipped`, and (2) Direct Ship Divider allocations from SC → stored in `scout.credited.directShip`. Only count from `scout.totals.shipped` for display/totals. The credited allocations are for attribution only.

---

## Site Orders & Booth Sales

### What Are Site Orders?

Orders where DC shows First Name = `Troop####` and Last Name = `Site`. These represent online troop website sales, QR code booth sales, and "virtual booth" orders.

### Critical Inventory Rule

Site orders fulfilled from troop stock MUST reduce troop inventory:

`Net Troop Inventory = C2T − T2G − Site Orders Physical`

### Site Order Types

| Type | Inventory Impact |
|------|-----------------|
| "Shipped" site orders | None (supplier ships) |
| "Delivery" site orders | Subtract from troop inventory |
| "With Donation" site orders | Subtract only physical packages (not donations) |

### Reporting Rules

- Site orders show at troop level until allocated to individual scouts
- Individual scout allocations show in "Credited" column
- Site row shows ONLY unallocated packages (with warning if > 0)
- When fully allocated, site row has 0 remaining

---

## Booth Operations & Dividers

### Smart Cookie Dividers

TCMs use three divider types to allocate troop orders to individual scouts:

**1. Smart Virtual Booth Divider** — Allocates online troop site delivery sales. Creates T2G transfers with category `VIRTUAL_BOOTH_ALLOCATION`. Credits scouts without physical transfer.

**2. Smart Direct Ship Divider** — Allocates troop direct ship orders. Stores separate allocation records. Credits scouts (supplier handles fulfillment).

**3. Smart Booth Divider** — Allocates physical booth sales per-reservation. Creates T2G transfers with category `BOOTH_SALES_ALLOCATION` plus booth details. Credits scouts per-booth-session.

### Allocation Traceability

Different dividers provide different levels of detail:

| Allocation Type | Order Numbers? | Dates? | Per-Order Breakdown? |
|----------------|---------------|--------|---------------------|
| Virtual Booth (TROOP DELIVERY) | Yes | Yes | Yes — full transfer metadata |
| Direct Ship Divider (TROOP DIRECT_SHIP) | No | No | No — only per-girl totals |
| Booth Sales (TROOP BOOTH) | No | Yes | Yes — per-reservation with store, date, time |

### Booth Reservations

**Physical Booth Reservations** require manual distribution in Smart Cookie. Show "Not Distributed" status if past date and undistributed.

**Virtual Delivery Reservations** are handled automatically by the Smart Virtual Booth Divider. They do NOT appear in the physical booth reservations table and do NOT require manual distribution.

---

## Edge Cases & Data Format Quirks

### "With Donation" Orders

Orders like "Cookies in Hand with Donation" contain BOTH physical and virtual packages:
- Total Packages field includes BOTH types
- Physical packages = Total Packages − Donation field
- Virtual packages (Cookie Share) = Donation field

### Refunded Packages

The "Total Packages (Includes Donate & Gift)" field INCLUDES refunded packages. Always subtract "Refunded Packages" to get net packages. Failing to subtract inflates totals.

### String Booleans (SC Report)

SC Report fields use STRING values, not actual booleans:
- `CShareVirtual`: `"TRUE"` or `"FALSE"` — compare as strings
- `IncludedInIO`: `"Y"` or `"N"` — compare as strings

Comparing against actual boolean `true` will always fail.

### Cases/Packages Format (SC Report)

SC Reports use `"cases/packages"` format: `"2/5"` = 2 cases + 5 packages = (2 × 12) + 5 = 29 total packages. Parse by splitting on `/`.

### Date Format Variations

- **DC:** Excel serial dates (e.g., `46053.55347`) — days since 1900-01-01
- **SC Report:** String dates (e.g., `"01/25/2026 11:20:42 AM"`)
- **SC API:** Date strings (e.g., `"2026/01/28"`)

### Cookie ID Mapping (SC API)

SC API uses numeric cookie IDs, not names:

| ID | Cookie |
|----|--------|
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

These IDs are stable within a season but may change between years. Verify by comparing SC CSV export to API data.

### Order Number Formats and Matching

- **DC:** 9-digit numeric (`229584475`)
- **SC Transfer:** D prefix + 9-digit (`D229584475`)
- **SC Report:** Same as DC, no prefix (`229584475`)
- **Internal SC:** 5-6 digits (`16491`)

**Matching:** Strip the `D` prefix from SC transfer order numbers to match DC orders. SC Report matches DC directly.

### Revenue Fields

- `Current Sale Amount` = total including shipping and handling
- `Current Subtotal` = cookie revenue only
- `Current S & H` = shipping and handling
- Revenue values may include currency symbols and commas — strip before parsing

### Expected Data Discrepancies (Not Errors)

- Only 10-15% of DC orders appear in SC transfers — this is normal and expected
- SC shows only synced/approved orders; the rest are pending
- Scout names may differ between systems ("Charlie Yates" vs "Yates, Charlie")
- Package counts may differ slightly due to refunds or Cookie Share allocation timing

### Payment Method Classification

- `CAPTURED` or `AUTHORIZED` → CREDIT_CARD
- `CASH` → CASH
- Contains "venmo" (case-insensitive) → VENMO
- Unknown → return null and warn (never silently default)

### Tooltip Newlines

HTML title attributes require actual `\n` characters for line breaks, NOT HTML entities like `&#10;` (which render literally in browser tooltips).

### Cookie Variety Display Order

All reports must use consistent ordering: Thin Mints, Caramel deLites, Peanut Butter Patties, Peanut Butter Sandwich, Trefoils, Adventurefuls, Lemonades, Exploremores, Caramel Chocolate Chip, Cookie Share.

---

## Reports

The app provides seven reports (button labels in parentheses):

1. **Troop Summary** (Troop) — Total packages sold, revenue, troop proceeds, inventory, booth stats
2. **Scout Summary** (Scouts) — Per-scout sales, inventory, credited allocations, cash owed, variety breakdowns
3. **Cookie Share Reconciliation** (Donations) — DC vs SC Cookie Share comparison, adjustments needed per scout
4. **Booth Reservations & Sales** (Booths) — Booth reservations, distribution status, per-scout allocations
5. **Available Booths** (Available Booths) — Upcoming booth locations with available time slots
6. **Inventory Report** (Inventory) — C2T pickups, T2G allocations, per-variety troop and scout inventory
7. **Cookie Popularity Report** (Cookies) — Sales breakdown by cookie variety with percentages
