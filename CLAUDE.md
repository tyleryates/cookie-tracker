# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Girl Scout Cookie Tracker - An Electron desktop app that syncs and reconciles cookie sales data from two independent systems:
- **Digital Cookie**: Customer-facing online sales platform (API-based sync)
- **Smart Cookie**: Troop management system (API-based sync)

These systems don't auto-sync and track sales from different perspectives, requiring manual reconciliation.

### ⚠️ CRITICAL: Data Source Hierarchy

**Smart Cookie is the SOURCE OF TRUTH** for all cookie program operations:
- ✅ **All billing and financial tracking** - Smart Cookie handles all money/payments
- ✅ **All inventory management** - C2T pickups, T2G allocations, actual inventory levels
- ✅ **Official sales reporting** - "Total Sold" that matters for council/troop
- ✅ **Troop and scout financial records** - What determines proceeds and rewards

**Digital Cookie is SUPPLEMENTAL information:**
- 📱 One electronic sales channel (online orders, Girl Links, etc.)
- 📝 Can have orders manually entered (not just automatic)
- 🔄 Data eventually syncs TO Smart Cookie (DC → SC, not the other way)
- 📊 Provides customer details, order breakdown, and additional context

**Application Design Principle:**
- Primary focus: Smart Cookie data (inventory, T2G allocations, total sold)
- Secondary focus: Digital Cookie data (order details, customer info, variety breakdown)
- Reports should use Smart Cookie as the baseline with DC providing supplemental detail
- When numbers differ, Smart Cookie is correct for billing/financial purposes

## Development Commands

```bash
# View all available commands
make

# Development
make install            # Install dependencies
make dev                # Start the application

# Building
make build              # macOS DMG
make build-win          # Windows NSIS
make build-all          # Both platforms

# Versioning & Release
make bump-patch         # Bump patch version (1.0.0 → 1.0.1)
make release-patch      # Bump, commit, build, and publish

# Or use npm directly
npm start               # Start app
npm run build           # Build for current platform
```

## Architecture

### Tech Stack
- **Electron** - Desktop app (main.js = main process, renderer.js = renderer process)
- **Axios** - HTTP client for both Digital Cookie and Smart Cookie APIs
- **axios-cookiejar-support** + **tough-cookie** - Cookie management for API requests
- **cheerio** - HTML parsing (Digital Cookie CSRF token extraction)
- **XLSX** - Excel file parsing and export
- **Tippy.js** - Interactive tooltips
- **electron-updater** - Auto-update functionality (optional)

**Note**: Both scrapers use direct API calls (no browser automation needed).

### Core Components

**main.js** - Electron main process, IPC handlers, window management

**renderer.js** - UI logic, report generation, data display

**data-reconciler.js** - Data normalization and deduplication engine
- Creates unified data model from disparate sources
- Deduplicates orders by order number (handles DC "229584475" vs SC "D229584475")
- Aggregates per-scout summaries
- Processes data in-memory for report generation

**scrapers/index.js** - Orchestrator for both scrapers (currently DC disabled for testing)

**scrapers/digital-cookie.js** - API client for Digital Cookie
- CSRF token extraction → form POST login → role selection → report download
- Fast, no browser required

**scrapers/smart-cookie.js** - API client for Smart Cookie
- Login → extract XSRF token → call /me endpoint → initialize orders context → call orders/search API → save JSON
- Fast, no browser required
- **Key detail**: XSRF token has format `part1|part2` where `|` is URL-encoded as `%7C` in cookies

**credentials-manager.js** - Encrypted credential storage using Electron safeStorage API (OS keychain)

### Data Flow

```
┌──────────────────┐                    ┌────────────────┐
│ Digital Cookie   │──── Excel ────────▶│                │
│ (API)            │                     │ Data           │
└──────────────────┘                     │ Reconciler     │──▶ Unified Data Model
                                         │                │
┌──────────────────┐                     │ - Normalize    │    ├─ orders (Map)
│ Smart Cookie     │──── JSON ──────────▶│ - Deduplicate  │    ├─ transfers (Array)
│ (API)            │                     │ - Merge        │    ├─ scouts (Map)
└──────────────────┘                     └────────────────┘    └─ metadata
```

### Data Storage

**Production (packaged app):**
- macOS: `~/Library/Application Support/Cookie Tracker/data/` (uses `productName` from package.json)
- Windows: `%APPDATA%/Cookie Tracker/data/`

**Development (`npm start`):**
- macOS: `~/Library/Application Support/cookie-tracker/data/` (uses `name` from package.json)
- Windows: `%APPDATA%/cookie-tracker/data/`

**Files:**
```
data/
  credentials.enc         # Encrypted credentials (OS keychain)
  DC-YYYY-MM-DD-HH-MM-SS.xlsx      # Digital Cookie API downloads
  SC-YYYY-MM-DD-HH-MM-SS.json      # Smart Cookie API data
```

## Key Domain Concepts

### Order Number Formats
- **Digital Cookie**: `229584475` (9-digit numeric, no prefix)
- **Smart Cookie Transfer**: `D229584475` (same order with D prefix)
- **Smart Cookie Report**: `229584475` (matches DC exactly)

When matching orders, strip the `D` prefix from SC transfer order numbers.

### Special Order Types

**"Site" Orders** - Troop booth sales (NOT individual girl sales)
- Last Name = "Site"
- First Name = "Troop XXXX" (troop number)
- Must be filtered OUT for per-girl reports
- Must be included for troop totals

**Cookie Share** - Donation orders where cookies go to military
- Girl collects money but doesn't handle cookies
- Appears in both systems with different formats
- Type includes "with Donation" or just "Donation"

### Transfer Types (Smart Cookie)
- `C2T(P)` - Council to Troop (warehouse pickup) - inventory IN
- `T2G` - Troop to Girl (scout pickup) - inventory OUT
- `COOKIE_SHARE` - Donation package sale
- `COOKIE_SHARE(D)` - Digital Cookie donation order (has D prefix)
- `DIRECT_SHIP` - Shipped order (may have S prefix)

All OUT transactions have negative quantities in SC data - use `Math.abs()` for display.

### Data Quality Issues

**Expected behavior:**
- Only 10-15% of DC orders appear in SC transfers (this is normal, not a bug)
- Orders are "pending" in SC until council approves and syncs them
- Scout names may differ in format: "Charlie Yates" vs "Yates, Charlie"

**Boolean gotchas:**
- SC Report fields like `CShareVirtual` are strings: `"TRUE"`/`"FALSE"`, not booleans
- `IncludedInIO` is `"Y"` or `"N"`, not boolean

**Date formats:**
- DC uses Excel serial dates: `46053.55347222222` (days since 1900-01-01)
- SC Report uses strings: `"01/25/2026 11:20:42 AM"`
- SC Transfers use short dates: `"01/28/2026"`

**Cases/Packages format:**
- SC Reports use `"cases/packages"`: `"0/8"` or `"2/5"`
- Calculate total: `(cases × 12) + packages`
- Most other data uses total packages only

## Reconciliation Logic

The `DataReconciler` class (`data-reconciler.js`) implements the core reconciliation:

1. **Normalization**: Convert DC/SC data to standardized format
2. **Order Deduplication**: Merge orders with matching order numbers
   - DC order `229584475` matches SC transfer `D229584475` (strip prefix)
   - SC report `229584475` matches DC order `229584475` (exact match)
3. **Scout Aggregation**: Sum per-scout totals
   - `pickedUp` from T2G transfers
   - `soldDC` from DC orders
   - `soldSC` from SC transfers
   - `remaining` = picked up - sold

## Important Patterns

### CSRF Token Extraction (Digital Cookie)
Digital Cookie requires a CSRF token from the login page before submitting credentials. Extract from HTML: `<input name="_requestConfirmationToken" value="..." />`

### Smart Cookie API Flow
Smart Cookie uses direct API calls (no browser needed):
1. **Login**: POST to `/webapi/api/account/login` with credentials
2. **Extract XSRF Token**: Get from `XSRF-TOKEN` cookie, URL-decode if contains `%7C`
   - Token format: `part1|part2` (pipe may be URL-encoded as `%7C`)
   - CRITICAL: Must decode `%7C` to `|` for authentication to work
3. **Establish Session**: GET `/webapi/api/me` to initialize session
4. **Initialize Orders Context**: GET `/webapi/api/orders/dashboard`
5. **Fetch Orders**: POST to `/webapi/api/orders/search` with XSRF token in `x-xsrf-token` header

### Role Selection (Digital Cookie)
- **Auto-selection**: If no role is specified in credentials, automatically selects the first role that starts with "Troop"
- **Manual selection**: If a role is specified, matches exactly as before
- After selection, the role name contains embedded IDs: "Troop **1234** of Service Unit **567**" (example)
  - Extract `troopId` with regex: `/Troop (\d+)/`
  - Extract `serviceUnitId` with regex: `/Service Unit (\d+)/`
  - These IDs are required for the report download API

### Troop Number Detection (Smart Cookie)
- Troop number automatically detected from C2T (Council to Troop) transfers
- No manual configuration needed
- Used for distinguishing troop transfers from scout transfers

### Progress Callbacks
Both scrapers accept a progress callback that reports status updates (0-100%) to the UI. Always send progress updates at key milestones.

### Report Enhancement Pattern

When adding new data tracking to reports, follow this consistent pattern:

1. **Add tracking variable** to summary objects (e.g., `donations: 0`)
2. **Update data processing loops** to populate the field when processing orders
3. **Add column to table headers** (update `colspan` if needed to match column count)
4. **Display field in table rows** using appropriate formatting
5. **Include in variety breakdowns** with correct pricing if applicable

**Example: Adding Donation Tracking**
```javascript
// Step 1: Initialize tracking variable
scoutSummary[name] = {
  donations: 0,  // New field
  varieties: {}
};

// Step 2: Populate during order processing
const donations = parseInt(row['Donation']) || 0;
if (donations > 0) {
  scoutSummary[name].donations += donations;
  scoutSummary[name].varieties['Cookie Share'] =
    (scoutSummary[name].varieties['Cookie Share'] || 0) + donations;
}

// Step 3: Add header column (update colspan from 9 to 10)
<th colspan="10">Details</th>

// Step 4: Display in table
<td>${scout.donations}</td>

// Step 5: Include in pricing calculations
if (variety === 'Cookie Share') {
  revenue += count * 6;  // $6 per donation package
}
```

**Why This Matters:** Following this pattern ensures new features are tracked consistently across all reports and don't break table layouts or calculations.

## Common Pitfalls

1. **Don't panic about missing SC orders** - Only 10-15% of DC orders appear in SC transfers initially. This is expected.

2. **Filter "Site" orders for girl reports** - Troop booth sales (last name "Site") should not be included in per-girl summaries.

3. **Handle D prefix in SC transfers** - Order numbers in SC transfers have a D prefix; strip it before matching with DC orders.

4. **Negative quantities in SC** - All SC transfer OUT quantities are negative. Use `Math.abs()` for display.

5. **String booleans in SC Reports** - Fields like `CShareVirtual` are `"TRUE"`/`"FALSE"` strings, not actual booleans.

6. **Excel date conversion** - DC dates are Excel serial numbers, not ISO strings. Convert using: `new Date((excelDate - 25569) * 86400000)`.

## Documentation

### Essential Reading (Start Here)

**For Developers Resuming Work:**
1. **`docs/CRITICAL-BUSINESS-RULES.md`** ⭐ - Essential business logic, when packages are "sold", transfer types, inventory calculations, and common pitfalls
2. **`docs/SYSTEM-OVERVIEW.md`** - Architecture, data flow, and technical overview
3. **`docs/DATA-FORMATS.md`** - Smart Cookie API and data structure reference

### Technical Documentation

Key technical docs in `/docs/`:
- **`CRITICAL-BUSINESS-RULES.md`** - Essential business logic, edge cases, and implementation decisions (START HERE)
- **`SYSTEM-OVERVIEW.md`** - Comprehensive domain knowledge about Girl Scout cookie systems
- **`DATA-FORMATS.md`** - Complete data format reference for all sources
- **`DIGITAL-COOKIE-COMPLETE.md`** - Complete Digital Cookie API implementation
- **`RECONCILIATION.md`** - Technical implementation details of the DataReconciler class
- **`EDGE-CASES.md`** - Known oddities and gotchas

### Program & Operational Knowledge

- **`PROGRAM-KNOWLEDGE.md`** - Comprehensive reference for the Girl Scout Cookie Program (2026 season):
  - Program timeline, dates, and deadlines
  - Cookie products, pricing, and rewards
  - Roles and responsibilities (TCM, IRM, SUCC)
  - Digital Cookie platform features and usage
  - Smart Cookies system operations
  - Financial procedures, ACH payments, banking
  - Selling methods, booth operations, safety guidelines
  - Training resources and common Q&A

### Release & Distribution

- **`DISTRIBUTION-UPDATES.md`** - How to distribute updates to users (manual, GitHub auto-update)
- **`SECURITY.md`** - Security policy, known vulnerabilities, privacy policy
- **`CHANGELOG.md`** - Version history and release notes
- **`LICENSE`** - MIT License with trademark disclaimers
- **`PRE-RELEASE-REVIEW.md`** - Comprehensive pre-release security audit results

### Development

- **`Makefile`** - 25+ helper commands (run `make` to see all)
- **`README.md`** - Project overview, quick start, features
