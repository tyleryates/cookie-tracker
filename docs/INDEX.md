# Documentation Index

Complete guide to Cookie Tracker documentation.

---

## 🚀 Quick Start (Read These First)

New to the project? Start here:

1. **[README.md](../README.md)** - Project overview, features, quick start
2. **[CRITICAL-BUSINESS-RULES.md](CRITICAL-BUSINESS-RULES.md)** ⭐ - Essential business logic you MUST understand
3. **[IMPLEMENTATION-NOTES.md](IMPLEMENTATION-NOTES.md)** - Code patterns, constants, utilities

---

## 📚 Core Documentation (For Development)

### Business Logic & Rules
- **[CRITICAL-BUSINESS-RULES.md](CRITICAL-BUSINESS-RULES.md)** ⭐ **MOST IMPORTANT**
  - When packages count as "sold"
  - Transfer types and what they mean
  - Cookie Share (virtual donations)
  - Inventory calculations
  - Site orders & booth sales
  - Quick decision reference

- **[DATA-SOURCES-PRIORITY.md](DATA-SOURCES-PRIORITY.md)** 🥇
  - Smart Cookie vs Digital Cookie hierarchy
  - Conflict resolution flowcharts
  - When to trust which system
  - Common scenarios and solutions

### Technical Implementation
- **[IMPLEMENTATION-NOTES.md](IMPLEMENTATION-NOTES.md)** 🔧
  - Constants and configuration
  - HTML generation patterns
  - Calculated fields convention ($ prefix)
  - Performance optimizations
  - Common code patterns
  - Future improvements

- **[DATA-FORMATS.md](DATA-FORMATS.md)** 📊
  - Smart Cookie API structure
  - Digital Cookie data format
  - Cookie ID mappings
  - Transfer type fields
  - Data validation rules

### Known Issues & Gotchas
- **[EDGE-CASES.md](EDGE-CASES.md)** ⚠️
  - Surprising behaviors
  - API quirks and oddities
  - Important implementation details
  - Virtual booth tracking
  - String boolean gotchas

### Data Reconciliation
- **[RECONCILIATION.md](RECONCILIATION.md)** 🔄
  - DataReconciler class implementation
  - Order deduplication logic
  - Scout aggregation
  - Cookie mappings
  - Data structures

---

## 📖 Domain Knowledge (Understanding Girl Scout Cookies)

Background on how the Girl Scout Cookie Program works:

- **[PROGRAM-KNOWLEDGE.md](PROGRAM-KNOWLEDGE.md)** 🍪
  - Cookie program overview
  - Timelines and phases
  - Roles (TCM, SUCC, IRM)
  - Products and pricing
  - Financial procedures
  - Booth operations
  - Virtual Cookie Share workflow
  - Common questions (FAQ)

- **[SALES-TYPES.md](SALES-TYPES.md)** 🛒
  - Order type classification
  - GIRL_DELIVERY vs DIRECT_SHIP
  - Donation orders
  - Site orders (troop booth)
  - Physical vs virtual items

---

## 🏗️ Architecture & System Design

- **[SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md)** 📐
  - Two primary systems (DC & SC)
  - Application architecture
  - Technology stack
  - Data flow
  - Report types
  - Automated sync capabilities

---

## 🚢 Operational Documentation

- **[DISTRIBUTION-UPDATES.md](DISTRIBUTION-UPDATES.md)** 📦
  - Building for distribution
  - Auto-update setup
  - GitHub Releases integration
  - Platform-specific builds (macOS, Windows)
  - Code signing (optional)

- **[CHANGELOG.md](../CHANGELOG.md)** 📝
  - Version history
  - Bug fixes and improvements
  - Breaking changes

---

## 📋 Documentation by Task

### "I need to understand the business logic"
→ Start with [CRITICAL-BUSINESS-RULES.md](CRITICAL-BUSINESS-RULES.md)

### "I need to know when to trust Smart Cookie vs Digital Cookie"
→ Read [DATA-SOURCES-PRIORITY.md](DATA-SOURCES-PRIORITY.md)

### "I need to add a new feature"
→ Read [IMPLEMENTATION-NOTES.md](IMPLEMENTATION-NOTES.md) then [CRITICAL-BUSINESS-RULES.md](CRITICAL-BUSINESS-RULES.md)

### "I need to understand the data structures"
→ Check [DATA-FORMATS.md](DATA-FORMATS.md) and [RECONCILIATION.md](RECONCILIATION.md)

### "Something is behaving strangely"
→ Look in [EDGE-CASES.md](EDGE-CASES.md) for known quirks

### "I need to understand how Girl Scout Cookies work"
→ Read [PROGRAM-KNOWLEDGE.md](PROGRAM-KNOWLEDGE.md)

### "I need to build and distribute the app"
→ See [DISTRIBUTION-UPDATES.md](DISTRIBUTION-UPDATES.md)

### "I need to debug a discrepancy"
→ Use [DATA-SOURCES-PRIORITY.md](DATA-SOURCES-PRIORITY.md) decision matrix

---

## 🎯 Common Questions

### Q: Which transfer types count as "sold"?
**A:** See [CRITICAL-BUSINESS-RULES.md - When Packages Are Sold](CRITICAL-BUSINESS-RULES.md#when-packages-are-sold)

**Quick Answer:** T2G, D, DIRECT_SHIP, COOKIE_SHARE count. C2T and PLANNED don't.

---

### Q: Why does Smart Cookie show different numbers than Digital Cookie?
**A:** See [DATA-SOURCES-PRIORITY.md - Common Scenarios](DATA-SOURCES-PRIORITY.md#common-scenarios)

**Quick Answer:** Smart Cookie includes all sales channels. Digital Cookie is one channel.

---

### Q: What's the $ prefix convention?
**A:** See [IMPLEMENTATION-NOTES.md - Calculated Fields Pattern](IMPLEMENTATION-NOTES.md#calculated-fields-pattern)

**Quick Answer:** `$` prefix marks calculated/derived fields to distinguish from source data.

---

### Q: How do I handle virtual booth sales?
**A:** See [EDGE-CASES.md - Virtual Booth Tracking](EDGE-CASES.md#virtual-booth-tracking-buckets)

**Quick Answer:** Use `virtualBooth: true` flag, track separately from physical inventory.

---

### Q: What's Cookie Share and why is it special?
**A:** See [CRITICAL-BUSINESS-RULES.md - Cookie Share](CRITICAL-BUSINESS-RULES.md#cookie-share-virtual-donations)

**Quick Answer:** Virtual donations. Never physical inventory. Priced at $6.

---

## 📊 Documentation Stats

- **Total Files:** 11 documentation files
- **Core Docs:** 6 files (business rules, implementation, data formats, edge cases, reconciliation, data priority)
- **Domain Docs:** 2 files (program knowledge, sales types)
- **Operational:** 2 files (distribution, changelog)
- **Architecture:** 1 file (system overview)

---

## 🔗 External Resources

- [Girl Scouts Cookie Program](https://www.girlscouts.org/cookies) - Official GSUSA site
- [Smart Cookies Platform](https://app.abcsmartcookies.com/) - Login to Smart Cookie
- [Digital Cookie Platform](https://digitalcookie.girlscouts.org/) - Login to Digital Cookie

---

---

*Documentation for Cookie Tracker v1.2.0*
