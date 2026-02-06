# Development Guide

Developer documentation for contributing to Cookie Tracker.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Key Concepts](#key-concepts)
- [Documentation](#documentation)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Building & Releasing](#building--releasing)
- [Contributing](#contributing)

## Prerequisites

- **Node.js** 18+
- **npm** 9+
- Basic understanding of Electron and Node.js

## Quick Start

```bash
# Clone and install
git clone https://github.com/tyleryates/cookie-tracker.git
cd cookie-tracker
npm install

# Development
npm start              # Launch app in dev mode
make dev              # Same as npm start

# See all commands
make                  # Lists all Makefile targets
```

## Architecture

### Technology Stack

- **Electron** - Desktop application framework
- **Axios + Cheerio** - API-based data scraping (Digital Cookie & Smart Cookie)
- **Tippy.js** - Interactive tooltips
- **XLSX** - Excel file parsing
- **macOS Keychain** - Secure credential storage via Electron safeStorage

### Key Components

```
cookie-tracker/
├── main.js                    # Electron main process
├── renderer.js                # UI and report coordination
├── data-reconciler.js         # Core reconciliation engine
├── scrapers/
│   ├── digital-cookie.js      # DC API scraper
│   ├── smart-cookie.js        # SC API scraper
│   └── index.js               # Orchestrator
├── renderer/
│   ├── ui-controller.js       # UI interactions and events
│   ├── html-builder.js        # HTML generation utilities
│   └── reports/               # Report generators
│       ├── troop-summary.js
│       ├── scout-summary.js
│       ├── inventory.js
│       ├── variety.js
│       └── donation-alert.js
├── credentials-manager.js     # Encrypted credential storage
├── constants.js               # App-wide constants
├── cookie-constants.js        # Cookie varieties and ID mappings
└── docs/                      # Comprehensive documentation
```

### Data Flow

1. **Collection** → Automated scrapers fetch data from DC and SC APIs
2. **Storage** → JSON/Excel files saved to OS-specific app data directory
3. **Reconciliation** → DataReconciler merges orders by order number
4. **Reporting** → Five interactive reports with expandable details

**Data Storage Locations:**
- **Production:** `~/Library/Application Support/Cookie Tracker/data/`
- **Development:** `~/Library/Application Support/cookie-tracker/data/`

## Key Concepts

### Critical Business Rules

**⚠️ READ THIS FIRST:** [docs/CRITICAL-BUSINESS-RULES.md](docs/CRITICAL-BUSINESS-RULES.md)

This document contains essential business logic that drives the entire application:

- **When packages count as "sold"** (T2G = sold, C2T ≠ sold)
- **Transfer types** and what they mean
- **Data source priority** (Smart Cookie = primary, Digital Cookie = supplemental)
- **Inventory calculations** (physical vs virtual)
- **Cookie Share** (virtual donations)
- **Site orders** (booth sales)

### Data Sources

**Smart Cookie = PRIMARY** (authoritative for billing, inventory, financial)
**Digital Cookie = SUPPLEMENTAL** (provides order details, customer info)

When numbers differ, Smart Cookie is correct. See [docs/DATA-SOURCES-PRIORITY.md](docs/DATA-SOURCES-PRIORITY.md).

### Common Gotchas

- **DO count "D" transfers** as sold (Smart Cookie counts these - they're not duplicates of T2G)
- **C2T transfers are NOT sold** (incoming inventory from council, not sales)
- **Cookie Share is virtual** (exclude from physical inventory)
- **Site orders reduce troop inventory** (booth sales from troop stock)
- **1 case = 12 packages** (API returns packages in `total_cases` field)
- **Virtual booth credits** don't count toward scout physical inventory

See [docs/EDGE-CASES.md](docs/EDGE-CASES.md) for more.

## Documentation

### 📑 Documentation Index

**[docs/INDEX.md](docs/INDEX.md)** - Complete guide to all documentation

### 🔴 Must-Read Before Development

1. **[CRITICAL-BUSINESS-RULES.md](docs/CRITICAL-BUSINESS-RULES.md)** ⭐ - Essential business logic
2. **[DATA-SOURCES-PRIORITY.md](docs/DATA-SOURCES-PRIORITY.md)** 🥇 - Smart Cookie vs Digital Cookie hierarchy
3. **[IMPLEMENTATION-NOTES.md](docs/IMPLEMENTATION-NOTES.md)** 🔧 - Code patterns and conventions

### 📚 Additional Documentation

- **[DATA-FORMATS.md](docs/DATA-FORMATS.md)** - API structure and field mappings
- **[EDGE-CASES.md](docs/EDGE-CASES.md)** - Known oddities and gotchas
- **[RECONCILIATION.md](docs/RECONCILIATION.md)** - Data reconciliation implementation
- **[PROGRAM-KNOWLEDGE.md](docs/PROGRAM-KNOWLEDGE.md)** - Girl Scout Cookie Program overview
- **[SALES-TYPES.md](docs/SALES-TYPES.md)** - Order type classification
- **[SYSTEM-OVERVIEW.md](docs/SYSTEM-OVERVIEW.md)** - High-level architecture
- **[DISTRIBUTION-UPDATES.md](docs/DISTRIBUTION-UPDATES.md)** - Building and releasing

## Development Workflow

### Project Structure Conventions

**Key helper functions (html-builder.js):**
```javascript
createHorizontalStats(stats)      // DRY stats display
sortVarietiesByOrder(entries)     // Consistent cookie ordering
formatDate(dateStr)               // MM/DD/YYYY formatting
escapeHtml(str)                   // XSS prevention
DateFormatter.toFriendly(date)    // "29 minutes ago"
DateFormatter.toFullTimestamp(date) // "Feb 5, 2026, 3:45 PM"
```

**Important conventions:**
- `$` prefix = calculated/derived fields (e.g., `$netInventory`)
- Cookie varieties in COOKIE_ORDER sequence
- Transfer types: C2T, T2G, D, DIRECT_SHIP, COOKIE_SHARE, PLANNED
- Cases → packages conversion: multiply by PACKAGES_PER_CASE (12)

See [docs/IMPLEMENTATION-NOTES.md](docs/IMPLEMENTATION-NOTES.md) for detailed patterns.

### Important Files

- **cookie-constants.js** - Cookie ID mappings (verify if API IDs change between seasons)
- **data-reconciler.js** - Order matching and deduplication logic
- **renderer/reports/** - Report generation (isolated, testable)
- **credentials-manager.js** - Electron safeStorage integration

### Code Quality

**Before committing:**
- No `console.log` in production code (use logger.js)
- Run through testing checklist
- Update documentation if business logic changes
- Follow existing patterns and conventions

## Testing

### Manual Testing Checklist

Always verify after changes:

✅ **Packages Sold** matches Smart Cookie dashboard
✅ **Net Troop Inventory** calculation is correct
✅ **Cookie Share** excluded from physical inventory
✅ **Site orders** appear under Booth Sales
✅ **Tooltips** show varieties in correct order (COOKIE_ORDER)
✅ **Scout inventory** calculation excludes virtual items
✅ **"D" transfers** counted as sold (not duplicates)
✅ **C2T transfers** NOT counted as sold

See [docs/CRITICAL-BUSINESS-RULES.md#testing-checklist](docs/CRITICAL-BUSINESS-RULES.md#testing-checklist) for complete list.

### Common Test Scenarios

**Scenario 1: Packages Sold Mismatch**
- Verify T2G, D, DIRECT_SHIP, COOKIE_SHARE counted
- Verify C2T and PLANNED NOT counted
- Check console for any double-counting

**Scenario 2: Inventory Calculation**
- Verify Site orders subtracted from inventory
- Check Cookie Share excluded (virtual)
- Verify virtual booth credits excluded
- Check direct ship excluded (never in inventory)

**Scenario 3: Scout Negative Inventory**
- Scout has more orders than T2G pickups
- Should show warning in Scout Summary report
- Check scout detail view for order breakdown

## Building & Releasing

### Build Commands

```bash
# Development build
npm start

# Production build (macOS)
make build          # or: npm run build
```

### Release Process

```bash
# Patch release (1.2.0 → 1.2.1)
make release-patch

# Minor release (1.2.0 → 1.3.0)
make release-minor

# Major release (1.2.0 → 2.0.0)
make release-major
```

**Release steps:**
1. Update CHANGELOG.md with changes
2. Commit all changes
3. Run appropriate release command
4. Push: `git push && git push --tags`
5. Create GitHub Release with built artifacts

See [docs/DISTRIBUTION-UPDATES.md](docs/DISTRIBUTION-UPDATES.md) for auto-update setup.

### Version Numbering

Following [Semantic Versioning](https://semver.org/):

- **Major (X.0.0)** - Breaking changes, data format migrations
- **Minor (1.X.0)** - New features, new reports, enhancements
- **Patch (1.0.X)** - Bug fixes, small improvements

## Contributing

### Before Making Changes

1. **Read [CRITICAL-BUSINESS-RULES.md](docs/CRITICAL-BUSINESS-RULES.md)** - Understand core logic
2. **Check [EDGE-CASES.md](docs/EDGE-CASES.md)** - Avoid known pitfalls
3. **Review [IMPLEMENTATION-NOTES.md](docs/IMPLEMENTATION-NOTES.md)** - Follow existing patterns

### Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes following existing patterns
3. Test thoroughly using checklist above
4. Update documentation if needed
5. Update CHANGELOG.md
6. Commit with clear message
7. Open pull request

### Code Style

- **Formatting:** Follow existing style (2-space indents, semicolons)
- **Comments:** Explain WHY, not WHAT
- **Functions:** Small, focused, single-responsibility
- **Constants:** Use constants.js and cookie-constants.js
- **HTML Generation:** Use html-builder.js utilities (DRY)

### Documentation Updates

**If you change business logic, update:**
- docs/CRITICAL-BUSINESS-RULES.md
- docs/IMPLEMENTATION-NOTES.md
- CHANGELOG.md

**If you add features, update:**
- README.md (user-facing)
- DEVELOPMENT.md (developer-facing)
- docs/IMPLEMENTATION-NOTES.md

## Troubleshooting Development Issues

### "Packages Sold" doesn't match Smart Cookie
- Check if "D" transfers are being counted (they should be)
- Verify transfer type detection logic in data-reconciler.js
- See: [docs/CRITICAL-BUSINESS-RULES.md#when-packages-are-sold](docs/CRITICAL-BUSINESS-RULES.md#when-packages-are-sold)

### Troop inventory calculation wrong
- Verify Site orders subtracted from inventory
- Check Cookie Share excluded from physical inventory
- Verify virtual booth credits excluded
- See: [docs/CRITICAL-BUSINESS-RULES.md#inventory-calculations](docs/CRITICAL-BUSINESS-RULES.md#inventory-calculations)

### Tooltips not initializing
- Tippy.js uses MutationObserver
- Check reportObserver in ui-controller.js
- Verify `data-tooltip` attribute on elements

### Scrapers failing
- Check credentials in Configure Logins
- Verify API endpoints haven't changed
- Check console for detailed error messages
- APIs may have rate limiting or CAPTCHA

## Additional Resources

- **[Electron Documentation](https://www.electronjs.org/docs/latest/)**
- **[Electron Forge](https://www.electronforge.io/)**
- **[Tippy.js Documentation](https://atomiks.github.io/tippyjs/)**
- **[Girl Scouts Digital Cookie](https://digitalcookie.girlscouts.org/)**
- **[Smart Cookies Platform](https://app.abcsmartcookies.com/)**

## License

MIT License - See [LICENSE](LICENSE) file for details.

---

**Questions?** Open an issue on GitHub or check [docs/INDEX.md](docs/INDEX.md) for more documentation.
