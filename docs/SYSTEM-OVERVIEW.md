# Girl Scout Cookie Systems - Overview & Edge Cases

**Created from official GSSD documentation**
**Last Updated:** 2026-02-04

---

## System Architecture

### Two Primary Systems

**Digital Cookie** - Customer-facing online sales platform
- Used by girls and families
- Tracks online orders, mobile app sales
- Manages customer data, payments, shipping
- Girl-centric view

**Smart Cookies™** - Troop business management system
- Used by Troop Cookie Managers (TCMs)
- Manages inventory, finances, reporting
- Handles council orders, transfers, booth sales
- Troop-centric view

### Key Insight
> These are **separate systems** that need manual reconciliation!
> They track the same sales from different perspectives and don't auto-sync.

---

## Girl Scout Cookie Tracker Application

### Purpose

This Electron desktop application automates the reconciliation of Digital Cookie and Smart Cookie data, providing comprehensive reporting and Virtual Cookie Share tracking.

### Architecture

**Technology Stack:**
- **Electron** - Desktop application framework
- **Axios + Cheerio** - API-based data scraping with HTTP client and HTML parsing
- **DataReconciler** - Core reconciliation engine
- **Excel/JSON parsers** - Multi-format data import

**Data Flow:**
1. **Data Collection** → Automated web scraping or manual file import
2. **Reconciliation** → Merge data from multiple sources by order number
3. **Analysis** → Generate scout/troop summaries, identify discrepancies
4. **Reporting** → Interactive HTML tables with variety breakdowns

### Automated Data Sync

**Web Scraping Capabilities:**
- **Digital Cookie**: Automated login → role selection → order export download
- **Smart Cookie**: Automated login → network interception → JSON capture
- **Progress Tracking**: Real-time status updates and progress bars
- **Error Handling**: Credential validation, timeout detection, retry logic

**Smart Cookie API Access:**
- Direct API calls to `/webapi/api/orders/search` endpoint using Axios
- Captures complete JSON response with transfer data
- Saves to `SC-YYYY-MM-DD-HH-MM-SS.json` format
- No browser automation needed

### Report Types

**1. Troop Summary**
- Total packages sold, revenue, scouts participating
- Initial inventory (C2T) and remaining inventory
- Virtual Cookie Share reconciliation status

**2. Scout Summary** (Primary Detail View)
- Per-scout package breakdown by variety
- Physical inventory tracking (Picked Up vs Sold)
- Booth credits and direct ship orders (tracked separately)
- Net inventory calculations
- Expandable order details with variety tooltips
- Manual entry requirements for Virtual Cookie Share

**3. Inventory Report**
- Detailed per-scout inventory position
- Identifies scouts with negative balance (oversold)
- Tracks physical vs virtual items separately

**4. Cookie Varieties Report**
- Breakdown by cookie type across all scouts
- Pricing calculations (handles $7 Caramel Chocolate Chip)
- Total packages and revenue by variety

**5. Virtual Cookie Share Report**
- Identifies donation orders requiring manual entry in Smart Cookies
- Filters by Payment Status (CASH vs credit card)
- Explains auto-sync rules vs manual entry requirements
- Lists specific scouts with manual entry needs

### Data Sources Supported

| Source | Import Method | Format |
|--------|---------------|--------|
| Digital Cookie Orders | Automated web scrape | Excel (.xlsx) |
| Smart Cookie Transfers | Manual file import | Excel (.xlsx) |
| Smart Cookie Reports | Manual file import | Excel (.xlsx) |
| Smart Cookie API | Automated network intercept | JSON |

### UI Components

**Data Sync & Status Section:**
- "Sync from Websites" button → Triggers automated scraping
- "Configure Logins" button → Credential management modal
- Smart Cookie status card (PRIMARY source indicator)
- Digital Cookie status card (SUPPLEMENTAL indicator)
- Expandable raw data viewers for each source
- Last sync timestamps and sync status indicators

**Reports Section:**
- Five report buttons (enabled after data sync)
- Dynamic report container with interactive tables
- Expand/collapse indicators for scout details
- Variety breakdowns in tooltips
- Color-coded status indicators

**Login Configuration Modal:**
- Digital Cookie credentials with optional role selection
- Smart Cookie credentials
- Auto-select first troop role if not specified
- Plain text local storage warning

### Key Features

**Automatic Reconciliation:**
- Deduplicates orders by order number across sources
- Handles order number prefix variations (D prefix in SC Transfers)
- Merges metadata from all sources into unified order object
- Tracks which sources contain each order

**Virtual Item Tracking:**
- Cookie Share (virtual donations) - excluded from physical inventory
- Virtual Booth Sales - credits without physical transfer
- Direct Ship Orders - shipped from supplier, no scout inventory
- Each tracked in separate buckets for accurate inventory

**Smart Cookie as Primary:**
- Reports emphasize SC as source of truth for billing/inventory
- Digital Cookie provides supplemental customer details
- "Total Sold" from Smart Cookie used for financial tracking
- DC totals shown as additional context

### Data Storage

**Production (packaged app):**
- macOS: `~/Library/Application Support/Cookie Tracker/data/` (uses `productName`)
- Windows: `%APPDATA%/Cookie Tracker/data/`

**Development (`npm start`):**
- macOS: `~/Library/Application Support/cookie-tracker/data/` (uses `name`)
- Windows: `%APPDATA%/cookie-tracker/data/`

**Note:** Electron uses `productName` field from package.json for packaged apps, and `name` field for development.

**Files:**

**`credentials.enc`** - Encrypted credentials (OS keychain storage)
- Encrypted using Electron safeStorage API
- Stored in OS-native keychain (macOS Keychain, Windows Credential Manager)
- Configured via UI "Configure Logins" dialog
- Never stored in plaintext in production
- Development fallback: Uses plaintext `credentials.json` if encryption unavailable

**Data Structure:**
```json
{
  "digitalCookie": {
    "username": "email@example.com",
    "password": "...",
    "role": "Troop 1234 of Service Unit 567",
    "councilId": "623"
  },
  "smartCookie": {
    "username": "username",
    "password": "..."
  }
}
```

**Downloaded Files:**
- `DC-YYYY-MM-DD-HH-MM-SS.xlsx` - Digital Cookie API export
- `SC-YYYY-MM-DD-HH-MM-SS.json` - Smart Cookie API data
- Auto-downloaded Excel/JSON files
- Timestamped filenames

**`cookie-constants.js`** - Shared constants
- Cookie variety display order
- Cookie ID mappings (Smart Cookie API)
- Cookie pricing (including $7 Caramel Chocolate Chip)
- Report column mappings

---

## Glossary - Critical Terms

### Order Types

| Term | Definition | Where It Appears |
|------|------------|------------------|
| **Girl Delivery** | Scout delivers cookies to customer in-person | DC & SC |
| **Direct Ship** | Cookies shipped directly to customer | SC (S prefix orders) |
| **Cookie Share** | Donation packages sent to military (girl collects $, doesn't handle cookies) | Both systems |
| **Troop Site Sales** | Booth/walk-up sales attributed to troop (last name "Site") | DC |
| **Planned Order** | Future/uncommitted order | SC |
| **Initial Order** | First bulk order from council to baker | SC |

### Organization

| Term | Definition |
|------|------------|
| **TCM** | Troop Cookie Manager - volunteer managing troop cookies |
| **SUCC** | Service Unit Cookie Coordinator - supports multiple troops |
| **IRM** | Individually Registered Member - scouts not in a troop |
| **Service Unit** | Geographic grouping (e.g., "Scripps Ranch") |
| **Council** | Regional GSUSA organization (e.g., "Girl Scouts San Diego") |

### Inventory Terms

| Term | Definition |
|------|------------|
| **Package** | Single box of cookies |
| **Case** | Container of 12 packages |
| **C2T** | Council to Troop (warehouse pickup) |
| **T2G** | Troop to Girl (scout pickup from troop inventory) |
| **PGA** | Per Girl Average (total packages sold ÷ girls selling) |

---

## Digital Cookie System

### Purpose
- Girls sell cookies online
- Customers order via unique girl links or troop site
- Tracks all digital/mobile sales

### Key Features
- Personal selling page for each girl
- Mobile app for in-person sales
- Goal tracking & badges
- Customer management
- Order status tracking

### Order Types in Digital Cookie
1. **Shipped / Shipped with Donation** - Direct ship to customer
2. **In Person Delivery / In Person Delivery with Donation** - Girl delivers
3. **Cookies in Hand / Cookies in Hand with Donation** - Immediate sale
4. **Pick Up** - Customer picks up at location
5. **Donation** - Cookie Share only

### Special Identifier: "Troop Site"
- Orders where last name = "Site"
- First name = "Troop XXXX" (troop number)
- Represents booth/walk-up sales
- NOT attributed to individual girl
- **Critical:** Must filter these OUT for girl-level reporting

### Reports Available
- **All Orders Report** - Comprehensive export (this is what we import!)
- Filters: order type, date range, girl names
- Contains: packages, varieties, payment, shipping status

---

## Smart Cookies™ System

### Purpose
- Troop inventory management
- Financial tracking
- Order procurement from council
- Reporting & reconciliation

### Main Sections (Tabs)

**DASHBOARD**
- Key metrics: sales, finances, inventory, PGA
- Important dates

**ORDERS**
- Troop Initial Order - bulk order from council
- Transfer Orders - move cookies between scouts/troops
- Planned Orders - future orders
- Damage Orders - report damaged cookies
- Virtual Cookie Share - donation package orders
- Troop Direct Ship Orders

**BOOTH**
- Schedule booth locations
- Virtual booth for online sales tracking
- Credit card payment tracking
- Smart Booth Divider - allocate sales to girls

**REPORTS** ⭐
- Current & Archived reports
- Girl Cookie Order Detail Report
- Direct Ship Orders Report
- Financial reports

**FINANCES**
- Financial Transactions
- Money tracking

### Transaction Types (Critical!)

| Code | Full Name | Direction | Meaning |
|------|-----------|-----------|---------|
| **C2T(P)** | Council to Troop (Pickup) | IN (+) | Troop picks up from warehouse |
| **T2G** | Troop to Girl | OUT (-) | Scout picks up from troop |
| **COOKIE_SHARE** | Cookie Share Sale | OUT (-) | Donation package sold |
| **COOKIE_SHARE(D)** | Cookie Share (Digital) | OUT (-) | Digital Cookie donation order |
| **DIRECT_SHIP** | Direct Ship | Varies | Shipped order |
| **PLANNED** | Planned Order | Varies | Future/uncommitted |

---

## Reconciliation Requirements

### Official GSSD Guidance

From "Reconciling Digital Cookie and Smart Cookies Reporting Troop":

#### Ship Only Sales
- **DC:** All Orders Report → Filter "Shipped" and "Shipped with Donation"
- **SC:** Direct Ship Orders Report
- Should match between systems

#### Girl Delivery Sales
- **DC:** All Orders Report → Filter girl names only (DELETE "Site" orders) → Exclude shipped
- **SC:** Girl Cookie Order Detail Report → Filter "Girl Delivery"
- SC subtotals by variety and girl

#### Cookie Share Sales
- **DC:** All Orders Report → Filter girl names only (DELETE "Site") → Filter donation types
- **SC:** Girl Cookie Order Detail Report → Filter "Girl Delivery"
- **Important:** "In Person with Donation" and "Cookies In Hand with Donation" need Cookie Share packages created in SC

#### Troop Site Sales - Delivery
- **DC:** All Orders Report → Filter "Troop XXX" (first name) and "Site" (last name) → Filter delivery types
- **SC:** Navigate to Booths > My Reservation > Virtual Booth
- Use Smart Booth Divider to allocate to girls

#### Troop Site Sales - Pick Up
- **DC:** All Orders Report → Filter "Troop XXX" and "Site" → Filter "Pick Up"
- **SC:** Booth Credit Card Payment Export Report
- Add to walk-up booth totals, allocate via Smart Booth Divider

#### Troop Site Sales - Shipped
- **DC:** All Orders Report → Filter "Troop XXX" and "Site" → Filter shipped types
- **SC:** Orders > Troop Ship Orders
- Distribute packages to girls before end of sale

---

## Critical Edge Cases & Oddities

### 1. Order Number Matching

**Digital Cookie Format:**
- 9-digit numeric: `229584475`
- No prefix
- Unique per order

**Smart Cookie Transfer Format:**
- Same order with prefix: `D229584475`
- `D` = Digital Cookie order
- `S` = Direct Ship (may not be in DC)
- Numeric only (5-6 digits) = Internal troop transfers

**Smart Cookie Report Format:**
- Same as DC: `229584475`
- No prefix
- Use `OrderID` or `RefNumber` column

**Matching Logic:**
```
DC Order 229584475
  = SC Transfer D229584475 (remove D prefix)
  = SC Report 229584475 (direct match)
```

### 2. "Site" Order Handling

**Problem:** Troop booth sales appear as separate "scout" in DC
- First Name: `Troop3990`
- Last Name: `Site`

**Solution:**
- For girl-level reports: Filter OUT "Site" orders
- For troop totals: Include "Site" orders
- In SC: Allocate to individual girls via Smart Booth Divider

### 3. Cookie Share Complexity

**What it is:**
- Customer buys cookies
- Cookies go to military (not customer)
- Girl collects money but never handles cookies
- Shows in both systems differently

**DC Order Types:**
- "In Person Delivery with Donation"
- "Cookies in Hand with Donation"
- "Donation"

**SC Handling:**
- May need manual "Virtual Cookie Share" order created
- Not automatic sync!

### 4. Data Sync Gaps

**Known Issue:** Not all DC orders appear in SC Transfers
- Only ~10% of DC orders appear in SC as COOKIE_SHARE(D)
- This is NORMAL and EXPECTED
- SC only shows orders that have been:
  - Approved by council
  - Synced for inventory allocation
  - Processed for financial tracking

**What this means:**
- 69 out of 77 DC orders NOT in SC = Normal
- They're pending, not missing
- Will sync later in cookie season

### 5. Virtual Booth Reservation

**Oddity:** All online Troop Site sales go to "Virtual Booth"
- Not a physical location
- Catch-all for digital booth sales
- Must manually divide to girls
- Found at: Booth > My Reservations > Virtual Booth

### 6. Cases vs Packages

**Smart Cookie Report Format:**
- Uses "cases/packages" format: `"0/8"`
- First number = cases (12 packages each)
- Second number = loose packages
- Total packages = (cases × 12) + packages
- Example: `"2/5"` = 24 + 5 = 29 packages

**Most DC/SC data:**
- Shows packages only
- No case breakdown

### 7. Boolean Field Gotchas

**Smart Cookie Report:**
- `CShareVirtual`: String `"TRUE"` or `"FALSE"` (NOT boolean!)
- `IncludedInIO`: String `"Y"` or `"N"`
- Must string-compare, not boolean-compare

### 8. Date Format Variations

**Digital Cookie:**
- Excel serial date: `46053.55347222222`
- Days since 1900-01-01
- Needs conversion

**Smart Cookie Report:**
- String date: `"01/25/2026 11:20:42 AM"`
- Can parse directly

**Smart Cookie Transfers:**
- Short date: `"01/28/2026"` or just date value

### 9. Negative Numbers in SC

**All SC Transfer quantities are negative for OUT:**
- T2G (Troop to Girl): `-47` means 47 packages given to scout
- COOKIE_SHARE: `-5` means 5 packages sold
- Positive = inventory IN (C2T, returns)
- Negative = inventory OUT (deliveries, sales)

**Display rule:** Always use `Math.abs()` for user-facing numbers

### 10. Status Field Confusion

**Digital Cookie Status:**
- `Completed` = Done ✓
- `Delivered` = Also done ✓ (not pending!)
- Both mean finished

**Smart Cookie Status:**
- Often blank
- Uses separate field for order state
- Not standardized

---

## Data Quality Checks

### Required Pre-Import Validation

**Digital Cookie Files:**
- [ ] Has columns: `Girl First Name`, `Girl Last Name`, `Order Number`
- [ ] Has cookie variety columns
- [ ] Has `Total Packages (Includes Donate & Gift)`
- [ ] Has `Current Sale Amount`
- [ ] At least 1 data row

**Smart Cookie Transfer Files:**
- [ ] Has columns: `ORDER #`, `TYPE`, `TO`, `FROM`
- [ ] Has `TOTAL` and `TOTAL $`
- [ ] Check for corrupted Excel range (common!)
- [ ] Has cookie abbreviation columns (ADV, TM, etc.)

**Smart Cookie Report Files:**
- [ ] Has columns: `GirlID`, `OrderID`, `GirlName`
- [ ] Has cookie columns (C1-C11)
- [ ] Has `Total` field
- [ ] Has organizational data (ServiceUnit, etc.)

### Post-Import Validation

**Data Consistency:**
- [ ] Order numbers are 5-9 digits
- [ ] No negative packages (after refund subtraction)
- [ ] Scout names are not blank
- [ ] Amounts are positive
- [ ] Dates are valid

**Reconciliation Checks:**
- [ ] DC order count ≈ SC Report order count (should match)
- [ ] SC Transfer orders << DC orders (normal, only 10-15% match)
- [ ] No duplicate order numbers within same source
- [ ] "Site" orders identified and handled
- [ ] Total revenue matches expected pricing

### Expected Discrepancies (Not Errors!)

1. **Most DC orders NOT in SC Transfers** - Normal (pending sync)
2. **Package counts slightly different** - Refunds, Cookie Share allocation
3. **Scout names formatted differently** - "Charlie Yates" vs "Yates, Charlie"
4. **"Site" orders only in DC** - Booth sales not yet allocated in SC

---

## Best Practices for Reconciliation

### 1. Import Order Matters
```
Recommended sequence:
1. Digital Cookie (OrderData export) - Master order list
2. Smart Cookie Report (ReportExport) - Enriches with metadata
3. Smart Cookie Transfers (CookieOrders) - Adds inventory context
```

### 2. Scout Name Normalization
- Trim whitespace
- Standardize case
- Handle "Unknown" gracefully
- Match fuzzy when needed

### 3. "Site" Order Handling
```javascript
// For girl-level reports
const girlOrders = orders.filter(o =>
  !o.scout.includes('Site') &&
  o.scout !== 'Unknown'
);

// For troop totals
const allOrders = orders; // Include everything
```

### 4. Order Matching Strategy
```javascript
// DC ↔ SC Report: Direct match
dcOrder.orderNumber === scReport.OrderID

// DC ↔ SC Transfer: Remove prefix
dcOrder.orderNumber === scTransfer.ORDER_NUM.replace(/^D/, '')

// Only COOKIE_SHARE(D) types have D prefix in SC
```

### 5. Revenue Calculation
```javascript
// Cookie revenue only
const cookieRevenue = order.Current_Subtotal;

// Total including shipping
const totalRevenue = order.Current_Sale_Amount;

// Shipping & handling
const shipping = totalRevenue - cookieRevenue;
```

---

## Report Mapping

### Digital Cookie → Smart Cookies Equivalents

| DC Report | SC Report | Notes |
|-----------|-----------|-------|
| All Orders Report | Girl Cookie Order Detail | Filter for Girl Delivery |
| All Orders (Shipped) | Direct Ship Orders Report | Should match |
| All Orders (Site) | Virtual Booth Reservation | Needs manual allocation |
| N/A | Financial Transactions | SC only |
| N/A | Transfer Orders | SC only - inventory moves |

---

## Future Considerations

### Potential Data Sources
1. **Initial Order Report** - Bulk order from council
2. **Financial Transactions** - Money movement
3. **Booth Reservation Data** - Physical booth schedules
4. **Damage Reports** - Inventory adjustments
5. **Recognition/Rewards** - Based on sales levels

### API/Automation (IMPLEMENTED)

**Digital Cookie API Automation:**
- Direct API calls using Axios + Cheerio (no browser automation)
- CSRF token extraction from login page HTML
- API-based login and role selection
- Programmatic export download via API endpoint
- Role auto-selection (first Troop role if not specified)
- Downloads Excel file to data directory

**Smart Cookie API Access:**
- Direct POST to `/webapi/api/orders/search` endpoint using Axios
- Captures JSON response with complete transfer data
- API uses numeric cookie IDs (mapped to names via COOKIE_ID_MAP)
- Critical fields: `transfer_type` (actual type), `virtual_booth` (flag)
- Saves to `SC-YYYY-MM-DD-HH-MM-SS.json` format

**Benefits Over Manual Export:**
- Faster data collection (seconds vs minutes)
- Real-time data without navigating SC menus
- Access to API-only fields (`virtual_booth` flag)
- Consistent JSON structure for parsing
- Automated on-demand refresh
- No browser overhead

**Implementation Details:**
- `scrapers/digital-cookie.js` - Digital Cookie API client
- `scrapers/smart-cookie.js` - Smart Cookie API client
- `scrapers/index.js` - Orchestrator for both scrapers
- Credential storage via Electron safeStorage (encrypted)
- Progress tracking and error handling
- See `docs/DATA-FORMATS.md` for API response structure

### Multi-Season Tracking
- Scout IDs (`GirlID`, `GSUSAID`) persist across years
- Could track scout performance over multiple seasons
- Grade level changes indicate progression
- Service Unit changes indicate troop transfers

---

## Quick Reference

### Order Prefixes
- No prefix = Digital Cookie order OR SC Report
- `D` prefix = Digital Cookie order in SC Transfers
- `S` prefix = Direct Ship (SC only)
- `TDS`/`TDSD` = Troop Direct Sales
- 5-6 digits no prefix = Internal SC transfer

### Key Columns by Source

**Digital Cookie (OrderData.xlsx):**
- `Order Number`, `Girl First Name`, `Girl Last Name`
- `Order Date (Central Time)`, `Order Status`
- `[Cookie Variety]` columns (Adventurefuls, Thin Mints, etc.)
- `Total Packages (Includes Donate & Gift)`, `Refunded Packages`
- `Current Sale Amount`, `Current Subtotal`, `Current S & H`

**Smart Cookie Transfers (CookieOrders.xlsx):**
- `ORDER #`, `TYPE`, `TO`, `FROM`, `DATE`
- `[Cookie Abbr]` columns (ADV, TM, CD, etc.)
- `TOTAL`, `TOTAL $`, `STATUS`

**Smart Cookie Report (ReportExport.xlsx):**
- `OrderID`, `GirlID`, `GSUSAID`, `GirlName`, `GradeLevel`
- `ServiceUnitDesc`, `CouncilDesc`, `TroopID`
- `C1`-`C13` (cookie varieties in "cases/packages" format)
- `Total`, `CShareVirtual`, `IncludedInIO`

### Filter Recipes

**Girl-Only Orders (exclude Site):**
```
lastName !== "Site" && lastName !== ""
```

**Troop Site Orders Only:**
```
lastName === "Site" && firstName.startsWith("Troop")
```

**Digital Cookie Orders in SC Transfers:**
```
TYPE.includes("COOKIE_SHARE") && ORDER_NUM.startsWith("D")
```

**Completed Orders:**
```
status === "Completed" || status === "Delivered"
```

---

## Contacts & Resources

### Official Resources
- **Smart Cookies Training Library** (URL in sharepoint)
- **gsLearn** - Online training platform
- **National Cookie Finder** - www.girlscoutcookies.org
- **GSSD Council** - Girl Scouts San Diego

### Documentation Location
`/Volumes/secure/Downloads/_cookies/TCM Share Point/`
- Digital Cookie folder - Tips for volunteers
- Smart Cookies folder - Quick Bites tip sheets
- TCM Manuals & Guides - Reference materials

---

## Document History

- **2026-02-04** - Added application architecture, UI documentation, and implemented automation details
- **2026-02-01** - Initial creation from GSSD SharePoint docs
- Based on 2026 cookie season documentation
- Documents dated 8/25/2025 to 9/9/2025
