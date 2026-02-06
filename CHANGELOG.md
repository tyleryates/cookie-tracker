# Changelog

All notable changes to Cookie Tracker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - TBD

### Initial Release

Electron desktop application for Girl Scout troops to sync and reconcile cookie sales data from Digital Cookie and Smart Cookie platforms.

#### Features

**Data Sync**
- Automated data sync from Digital Cookie and Smart Cookie APIs
- Secure credential storage using OS keychains (macOS Keychain, Windows Credential Manager)
- Data reconciliation engine merging orders from both platforms
- Support for multiple transfer types: C2T (inventory received), T2G (scout pickups), Digital Cookie orders, Direct Ship, Cookie Share

**Reports**
- **Troop Summary** - Orders, revenue, packages sold, and net inventory
- **Scout Summary** - Individual scout performance with expandable order details showing payment method (credit card/cash)
- **Inventory** - Net troop inventory by cookie variety with C2T/T2G transfer history
- **Cookie Varieties** - Sales breakdown by cookie type with percentages
- **Virtual Cookie Share** - Donation tracking and manual entry requirements

**Inventory Management**
- Accurate inventory calculations excluding virtual items (Cookie Share donations, virtual booth credits, direct ship)
- Site order tracking (booth sales from troop stock)
- Cases and packages display with automatic conversion (1 case = 12 packages)
- Interactive tooltips showing variety breakdowns

**Auto-Updates (Optional)**
- GitHub Releases integration for automatic updates
- Users notified when new versions are available
- One-click download and install

**Developer Tools**
- Makefile with 25+ commands for development, building, and releasing
- Comprehensive documentation covering architecture, business rules, and data formats

#### Technical Details

- Built with Electron, Node.js
- Secure credential encryption via Electron safeStorage API
- Data stored locally in OS-specific application data directories
- No external data transmission except to Girl Scouts platforms for sync
- No analytics or tracking

#### Documentation

- Complete setup and usage instructions
- Security policy with vulnerability documentation
- Distribution and update guide
- Architecture and data format references
- Business rules and edge case documentation

---

## Future Releases

Updates will follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **Major (X.0.0)** - Breaking changes, data format migrations
- **Minor (1.X.0)** - New features, new reports, enhancements
- **Patch (1.0.X)** - Bug fixes, small improvements

---

**Legend:**
- `Added` - New features
- `Changed` - Changes to existing functionality
- `Deprecated` - Features that will be removed
- `Removed` - Features that were removed
- `Fixed` - Bug fixes
- `Security` - Security improvements
