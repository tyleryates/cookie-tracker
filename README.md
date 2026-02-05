# Girl Scout Cookie Tracker

Electron desktop application for Girl Scout troops to sync and reconcile cookie sales data from Digital Cookie and Smart Cookie platforms.

## Features

- **Automated Data Sync**: One-click sync from both Digital Cookie and Smart Cookie using API scrapers
- **Data Reconciliation**: Merges data from multiple sources with intelligent deduplication
- **Comprehensive Reporting**: 5 interactive reports with drill-down capability
- **Virtual Cookie Share Tracking**: Identifies orders requiring manual entry in Smart Cookie
- **Inventory Management**: Real-time troop and scout inventory tracking
- **Secure Credentials**: OS-native keychain storage (macOS Keychain, Windows Credential Manager)

## Quick Start

```bash
make install   # or: npm install
make dev       # or: npm start
```

**Tip:** Run `make` to see all available commands!

### First Time Setup

1. Click **"Configure Logins"** and enter credentials:
   - **Digital Cookie**: Username, password, and optional role name
   - **Smart Cookie**: Username and password
2. Click **"Sync from Websites"** to download data
3. Explore the five available reports

**Note:** Credentials are encrypted and stored securely in your OS keychain (macOS Keychain or Windows Credential Manager). In development mode (`npm start`), if encryption is unavailable, plaintext storage is used as a fallback.

### Configuration

#### Council ID

The app defaults to **Council ID 623** (Girl Scouts San Diego). If your troop is in a different council:

1. Find your council ID from the Digital Cookie URL when logged in
2. Update `councilId` in the credentials configuration

#### Troop Number

The app automatically detects your troop number from Smart Cookie data (C2T transfers). No manual configuration needed.

### Building for Distribution

```bash
# macOS (creates portable .zip)
make build        # or: npm run build

# Windows (creates portable .zip)
make build-win    # or: npm run build:win

# Both platforms
make build-all    # or: npm run build:all
```

**Auto-Updates:** To enable automatic updates via GitHub Releases, see [DISTRIBUTION-UPDATES.md](docs/DISTRIBUTION-UPDATES.md) for setup instructions.

## Documentation

### 📘 For Developers

**START HERE when resuming development:**

- **[CRITICAL-BUSINESS-RULES.md](docs/CRITICAL-BUSINESS-RULES.md)** ⭐ - Essential business logic, edge cases, and implementation decisions
- **[SYSTEM-OVERVIEW.md](docs/SYSTEM-OVERVIEW.md)** - Architecture, data flow, and technical overview
- **[DATA-FORMATS.md](docs/DATA-FORMATS.md)** - Smart Cookie API and data structure reference
- **[EDGE-CASES.md](docs/EDGE-CASES.md)** - Known oddities and gotchas
- **[CLAUDE.md](CLAUDE.md)** - Claude Code development guide

### 📗 For Understanding the Domain

- **[PROGRAM-KNOWLEDGE.md](docs/PROGRAM-KNOWLEDGE.md)** - Girl Scout Cookie Program operational knowledge
- **[RECONCILIATION.md](docs/RECONCILIATION.md)** - How to reconcile Digital Cookie vs Smart Cookie

## Architecture

### Technology Stack

- **Electron** - Desktop application framework
- **Axios + Cheerio** - API-based data scraping (Digital Cookie & Smart Cookie)
- **Tippy.js** - Interactive tooltips
- **XLSX/CSV Parsers** - Multi-format data import
- **OS Keychain Integration** - Secure credential storage

### Key Components

```
cookie-tracker/
├── main.js                    # Electron main process
├── renderer.js                # UI and report generation
├── data-reconciler.js         # Core reconciliation engine
├── scrapers/
│   ├── digital-cookie.js      # DC API scraper
│   ├── smart-cookie.js        # SC API scraper
│   └── index.js               # Orchestrator
├── credentials-manager.js     # Encrypted credential storage
├── cookie-constants.js        # Cookie varieties and mappings
└── docs/                      # Comprehensive documentation
```

### Data Flow

1. **Collection** → Automated scrapers fetch data from DC and SC APIs
2. **Storage** → JSON/Excel files saved to OS-specific app data directory (see below)
3. **Reconciliation** → DataReconciler merges orders by order number
4. **Reporting** → Five interactive reports with expandable details

**Data Storage:**
- Production: `~/Library/Application Support/Cookie Tracker/data/` (macOS) or `%APPDATA%/Cookie Tracker/data/` (Windows)
- Development: `~/Library/Application Support/cookie-tracker/data/` (macOS) or `%APPDATA%/cookie-tracker/data/` (Windows)

## Reports

### 1. Troop Summary
High-level metrics: orders, packages sold, revenue, and troop inventory

### 2. Scout Summary
Individual scout performance with expandable order details and inventory tracking

### 3. Inventory
Net troop inventory by variety, C2T pickups (in cases), and T2G allocations

### 4. Cookie Varieties
Sales breakdown by cookie type with percentages (physical cookies only)

### 5. Virtual Cookie Share
Cookie Share reconciliation and manual entry requirements

## Critical Business Rules

### When Packages Are "Sold"

**Packages are considered "SOLD" when scouts PICK UP inventory (T2G transfer), NOT when orders are placed.**

This is critical for matching Smart Cookie's "Packages Sold" metric. See [CRITICAL-BUSINESS-RULES.md](docs/CRITICAL-BUSINESS-RULES.md#when-packages-are-sold) for full explanation.

### Data Source Priority

**Smart Cookie = PRIMARY** (billing, inventory, financial)
**Digital Cookie = SUPPLEMENTAL** (order details, customer info)

When numbers differ, Smart Cookie is correct.

### Common Gotchas

- **Don't count "D" transfers** as sold (they're just sync records)
- **Cookie Share is virtual** (exclude from physical inventory)
- **Site orders reduce troop inventory** (booth sales from troop stock)
- **1 case = 12 packages** (API returns packages in `total_cases` field)

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Project Structure

```javascript
// Key helper functions
createHorizontalStats(stats)      // DRY stats display
sortVarietiesByOrder(entries)     // Consistent cookie ordering
formatDate(dateStr)               // MM/DD/YYYY formatting
escapeHtml(str)                   // XSS prevention
```

### Important Files

- **cookie-constants.js** - Cookie ID mappings (verify if API IDs change)
- **data-reconciler.js** - Order matching and deduplication logic
- **renderer.js** - All UI and report generation (~1700 lines)
- **credentials-manager.js** - Electron safeStorage integration

### Testing Your Changes

Always verify:
- "Packages Sold" matches Smart Cookie dashboard
- Net Troop Inventory calculation is correct
- Cookie Share excluded from physical inventory
- Site orders under Booth Sales column
- Tooltips show varieties in correct order

See [Testing Checklist](docs/CRITICAL-BUSINESS-RULES.md#testing-checklist) for complete list.

## Troubleshooting

### "Packages Sold" doesn't match Smart Cookie
- Check if "D" transfers are being counted (they shouldn't be)
- Verify only T2G transfers counted as "sold"
- See: [When Packages Are "Sold"](docs/CRITICAL-BUSINESS-RULES.md#when-packages-are-sold)

### Troop inventory is incorrect
- Verify Site orders are subtracted from inventory
- Check Cookie Share excluded from physical inventory
- Verify virtual booth credits excluded
- See: [Inventory Calculations](docs/CRITICAL-BUSINESS-RULES.md#inventory-calculations)

### Tooltips not showing
- Tippy.js initializes via MutationObserver
- Check browser console for errors
- Verify `data-tooltip` attribute exists

### Data not syncing
- Check credentials in Configure Logins
- Verify network connectivity
- Check console for scraper errors
- Credentials stored in OS keychain (encrypted)

## Contributing

When making changes:

1. Read **[CRITICAL-BUSINESS-RULES.md](docs/CRITICAL-BUSINESS-RULES.md)** first
2. Update documentation if business logic changes
3. Run through testing checklist
4. Update this README if architecture changes

## Additional Documentation

- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes
- **[LICENSE](LICENSE)** - MIT License
- **[SECURITY.md](SECURITY.md)** - Security policy and known vulnerabilities

## License

MIT License - See [LICENSE](LICENSE) file for details.

This is an unofficial volunteer tool not affiliated with Girl Scouts of the USA.

## Support

This is a volunteer-developed tool. For:
- **App issues:** Open a GitHub issue
- **Cookie Program questions:** Contact your Service Unit Cookie Coordinator (SUCC) or council
- **Security issues:** See [SECURITY.md](SECURITY.md) for responsible disclosure

## Disclaimer

"Girl Scouts" and "Girl Scout Cookies" are registered trademarks of Girl Scouts of the USA. This software is not affiliated with, endorsed by, or sponsored by Girl Scouts of the USA.

---

**Version:** 1.0.0
**Last Updated:** 2026-02-04
