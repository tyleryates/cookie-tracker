# Design Principles

**Core rules for maintaining clean, maintainable code in Cookie Tracker.**

These principles guide all development decisions and prevent the code from becoming tangled and fragile.

---

## 🎯 #1: Model What Data IS, Not How Reports USE It

**The Golden Rule:** Data models should represent fundamental properties of the data, not pre-computed aggregations for specific reports.

### ✅ Right: Classify Based on Nature

Ask: **"Is this a fundamental property of this data?"**

```javascript
// ✅ GOOD: Fundamental properties
transfer.category = TRANSFER_CATEGORY.GIRL_PICKUP; // What kind of transfer is this?
order.owner = OWNER.GIRL;             // Whose sale is this?
order.orderType = ORDER_TYPE.DELIVERY; // How was the sale fulfilled?
scout.$issues = { hasNegative: true }; // Are there data quality problems?
```

These describe **what the data IS**, not what a specific report needs.

### ❌ Wrong: Pre-Aggregate for Reports

Ask: **"Is this just for one report?"** → Don't add it to the data model.

```javascript
// ❌ BAD: Report-specific aggregations
scout.$varietyBreakdowns = {          // Only scout-summary.tsx needs this
  fromSales: { ... },
  fromShipped: { ... }
};

scout.$cookieShare = {                // Only donation-alert.tsx needs this
  dcTotal: 50,
  dcAutoSync: 30
};

scout.totals.$breakdown = {           // Not even used!
  direct: 100,
  credited: 50
};
```

These are **how reports USE the data**, not what the data is.

---

## Why This Matters

### Problem: Mixed Concerns

When data models contain report-specific aggregations:
- ❌ Data layer knows about report requirements (wrong layer)
- ❌ Adding a new report tempts you to add more aggregations (bloat)
- ❌ Changing a report requires changing the data model (tight coupling)
- ❌ Understanding data requires reading report code (confusion)

### Solution: Clean Separation

When data models only contain fundamental properties:
- ✅ Data layer is report-agnostic (clean)
- ✅ Reports calculate what they need (simple loops)
- ✅ Changing a report only touches that report file (loose coupling)
- ✅ Understanding data is straightforward (clarity)

---

## Decision Tree

When considering adding a field to the data model:

```
Is this a fundamental property of the data?
├─ YES → Add it
│  └─ Examples: category, owner, orderType
│
└─ NO → Is it a simple calculation used 3+ times?
   ├─ YES → Consider convenience field
   │  └─ Examples: physicalPackages, physicalVarieties
   │
   └─ NO → Don't add it
      └─ Reports calculate inline
```

### Convenience Fields (Acceptable)

Simple calculations used in many places can be pre-computed:

```javascript
// 🟡 ACCEPTABLE: Used 15+ times, eliminates duplicate logic
transfer.physicalPackages = sum(varieties excluding Cookie Share);
transfer.physicalVarieties = { /* varieties without Cookie Share */ };
```

**Criteria:**
- Used in 3+ different functions/reports
- Non-trivial calculation (not just field access)
- Eliminates meaningful duplication
- Represents a clear business concept (physical vs total)
- Uses positive sums, not subtractions (see Principle #6)

---

## #2: Classify Once, Use Everywhere

**Principle:** Compute complex classifications at creation time, then use the pre-computed value everywhere.

### ✅ Right: Classify at Creation

```typescript
// data-store-operations.ts - classifyTransferCategory()
// Explicit category from raw type + API flags — no remainder logic
function classifyTransferCategory(type, virtualBooth, boothDivider, directShipDivider) {
  if (isC2TTransfer(type)) return TRANSFER_CATEGORY.COUNCIL_TO_TROOP;
  if (type === TRANSFER_TYPE.G2T) return TRANSFER_CATEGORY.GIRL_RETURN;
  if (type === TRANSFER_TYPE.T2G) {
    if (virtualBooth) return TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION;
    if (boothDivider) return TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION;
    if (directShipDivider) return TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION;
    return TRANSFER_CATEGORY.GIRL_PICKUP;
  }
  // ... etc
}

// createTransfer() stores the category; reports use it for dispatch
```

### ❌ Wrong: Re-Compute Everywhere

```javascript
// ❌ BAD: Every function re-computes from raw fields
function calculateInventory(transfer) {
  if (transfer.type === 'T2G' && !transfer.virtualBooth && !transfer.boothDivider) {
    // ... check repeated everywhere
  }
}

function calculateTotals(transfer) {
  if (transfer.type === 'T2G' && !transfer.virtualBooth && !transfer.boothDivider) {
    // ... duplicated logic
  }
}
```

**Problems:**
- Logic duplicated in 5+ places
- Inconsistencies when one place uses different logic
- Hard to change (update 5+ locations)
- Easy to miss a case

---

## #3: Reports Calculate Their Own Needs

**Principle:** Reports do simple calculations on clean data, not complex data transformations.

### ✅ Right: Simple Report Logic

```javascript
// scout-summary.tsx — simple loop over pre-classified data
function buildVarietyBreakdown(scout) {
  const salesVarieties = {};
  for (const order of scout.orders) {
    Object.entries(order.varieties).forEach(([variety, count]) => {
      salesVarieties[variety] = (salesVarieties[variety] || 0) + count;
    });
  }
  return salesVarieties;
}
```

**Characteristics:**
- 10-20 lines of simple loops
- Logic co-located with display code
- Easy to understand: read one file
- No impact on other reports

### ❌ Wrong: Pre-Aggregate Everything

```javascript
// ❌ BAD: calculators/
scout.$varietyBreakdowns = {
  fromSales: {},
  fromShipped: {},
  fromBooth: {}
};

// ... 40 lines building these aggregations for scout-summary report
```

**Problems:**
- Data model knows about report requirements
- Logic split across multiple files
- Changes require updating data model
- Other reports don't need this

---

## #4: Use Descriptive Names for Computed Fields

**Principle:** Computed fields should clearly indicate what they represent.

### ✅ Right: Clear Intent

```javascript
transfer.physicalPackages   // Clear: excludes virtual (Cookie Share)
transfer.packages          // Clear: includes everything

order.orderType            // Clear: DELIVERY, DIRECT_SHIP, BOOTH, etc.
order.physicalPackages     // Clear: excludes virtual donations
```

### ❌ Wrong: Ambiguous Names

```javascript
transfer.count             // Ambiguous: what does this count?
order.amount              // Ambiguous: amount of what?
scout.breakdown           // Ambiguous: breakdown of what?
```

### Naming Convention

- **Regular fields:** `packages`, `varieties`, `amount`
- **Computed fields:** `physicalPackages`, `physicalVarieties`, `category`
- **Derived aggregates ($ prefix):** `$financials`, `$inventoryDisplay`, `$salesByVariety`, `$allocationSummary`, `$allocationsByChannel`, `$orderStatusCounts`, `$issues`

---

## #5: Core Data Stays in Data Layer, Display Stays in Reports

**Principle:** Clear separation between data processing and display logic.

### Boundaries

**Data Layer** (`data-processing/`)
- ✅ Import raw data
- ✅ Classify and normalize
- ✅ Calculate core totals (sales, shipped, donated, credited)
- ✅ Detect data quality issues
- ❌ NOT: Build tooltips, format for display, aggregate for specific reports

**Report Layer** (`renderer/reports/`)
- ✅ Read classified data
- ✅ Calculate report-specific breakdowns
- ✅ Format for display (tooltips, tables, charts)
- ✅ Generate HTML
- ❌ NOT: Modify data model, add computed fields to scouts

---

## #6: Classify Granularly, Report with Simple Sums

**Principle:** Every displayed value should trace to raw data through at most one classification step. No subtracting edge cases, no remainder calculations, no computing displayed values from other computed values.

### The Rule

```
report.value = sum(items.where(category == X).field)
```

Reports display sums of classified data. Never `totalA - totalB`.

### ✅ Right: Positive Sums of Classified Data

```typescript
// ✅ GOOD: Sum non-Cookie-Share varieties directly
const physicalPackages = Object.entries(varieties)
  .filter(([v]) => v !== COOKIE_SHARE)
  .reduce((sum, [, count]) => sum + count, 0);

// ✅ GOOD: Switch on explicit category
switch (transfer.category) {
  case TRANSFER_CATEGORY.GIRL_PICKUP:
    totalAllocated += transfer.physicalPackages;
    break;
  case TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION:
    totalVirtualBooth += transfer.physicalPackages;
    break;
}

// ✅ GOOD: Compute from component totals, not other computed values
packagesSoldFromStock = allocated + virtualBoothT2G + boothDividerT2G - g2t;
```

### ❌ Wrong: Subtraction Patterns and Derived-from-Derived

```typescript
// ❌ BAD: Subtracting edge cases
physicalPackages = packages - cookieShareCount;

// ❌ BAD: Remainder classification ("everything else")
isPhysical = isT2G && !virtualBooth && !boothDivider && !directShipDivider;

// ❌ BAD: Computing displayed value from other computed values
packagesSold = ordered - inventory;

// ❌ BAD: Nested boolean dispatch
if (isPhysical) { ... }
else if (virtualBooth) { ... }
else if (boothDivider) { ... }
```

### Exception: Returns (G2T)

G2T subtraction is acceptable — returns are a fundamentally different flow (inventory coming back), not an edge case being stripped from a total.

### Why This Matters

- **Subtraction hides bugs**: If `packages` includes an unexpected type, `packages - cookieShare` silently miscounts
- **Remainder classification is fragile**: Adding a new T2G sub-type breaks `isPhysical` unless you remember to update the exclusion list
- **Derived-from-derived obscures provenance**: `ordered - inventory` doesn't tell you which transfers contributed
- **Positive sums are auditable**: You can enumerate exactly which items contributed to any total

---

## Central Category Group Sets

When multiple reports need to check "is this transfer a sale?" or "is this a T2G sub-type?", define the category set once in `constants.ts` and import it everywhere. This prevents reports from maintaining their own category lists that drift out of sync.

```typescript
// ✅ GOOD: Central set, imported by all consumers
// constants.ts
export const T2G_CATEGORIES: ReadonlySet<TransferCategory> = new Set([
  TRANSFER_CATEGORY.GIRL_PICKUP,
  TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION,
  // ...
]);

// package-totals.ts, varieties.ts, troop-totals.ts, etc.
if (T2G_CATEGORIES.has(transfer.category)) { ... }
```

```typescript
// ❌ BAD: Each report defines its own list
// package-totals.ts
if (transfer.category === GIRL_PICKUP || transfer.category === VIRTUAL_BOOTH_ALLOCATION || ...) { ... }
// varieties.ts — same list, maybe different, maybe not
if (transfer.category === GIRL_PICKUP || transfer.category === VIRTUAL_BOOTH_ALLOCATION || ...) { ... }
```

When adding a new `TRANSFER_CATEGORY`, update the relevant group sets in `constants.ts` — all consumers pick up the change automatically.

---

## Red Flags: Signs You're Breaking the Rules

🚩 **Adding fields for one specific report**
- If only one file uses it, it shouldn't be in the data model

🚩 **Pre-computing display data**
- Tooltips, formatted strings, UI-specific aggregations → Reports only

🚩 **Data model growing with each new report**
- Data model should be stable; reports come and go

🚩 **Report logic in calculators/**
- If it says "for scout-summary report" → Wrong layer

🚩 **Setting then immediately reading fields**
- If you compute it and use it once → Don't store it

---

## Code Review Checklist

Before adding a new field to scouts/orders/transfers:

- [ ] Is this a fundamental property of the data? (not report-specific)
- [ ] Is this used by 3+ different functions/reports? (not just one)
- [ ] Would removing it cause significant duplication? (not trivial)
- [ ] Does it represent what the data IS? (not how reports USE it)
- [ ] Is the name clear and unambiguous?

If you answered "no" to most of these → **Don't add it. Calculate in reports instead.**

---

## Summary

| Principle | Do | Don't |
|-----------|-----|-------|
| Data Model | Fundamental properties | Report aggregations |
| Classification | Once at creation | Re-compute everywhere |
| Reports | Calculate own needs | Read pre-aggregations |
| Naming | Clear, descriptive | Ambiguous |
| Separation | Data in data layer | Display in data layer |
| Category Groups | Central sets in constants.ts | Per-report category lists |
| Granular Sums | `sum(classified.field)` | `totalA - totalB` |
| Silent Defaults | Return null, let caller handle | Default to "safe" value silently |

**Remember:** Clean data models are stable. They describe what data fundamentally **IS**, independent of how any particular report chooses to **USE** it.

---

## #7: No Silent Defaults for Financial Data

Classification functions return `null` for unknown values. The caller handles null by logging warnings or errors. This ensures unknown cookie varieties, payment methods, or order types are immediately visible rather than silently defaulting to incorrect values.

If a new cookie type appears in the data, the app should warn loudly rather than silently treating it as zero or skipping it.

---

## #8: Extract Shared Helpers Judiciously

**Principle:** When 2+ files duplicate the same logic, extract to a shared helper. When only one file uses it, keep it local. Don't abstract for marginal savings.

### Where Shared Renderer Helpers Live

| Kind | Location | Example |
|------|----------|---------|
| Data formatting, date/number utilities | `renderer/format-utils.ts` | `getActiveScouts()`, `formatShortDate()` |
| Order display (status pills, tooltips) | `renderer/order-helpers.ts` | `getStatusStyle()`, `buildOrderTooltip()` |
| Shared UI fragments | `renderer/components/` | `ScoutCreditChips`, `TooltipCell` |

These are renderer-layer helpers — they must NOT import from `data-processing/`.

### When to Extract

- The same logic appears in **2+ files** (not just similar — actually identical)
- The extraction **reduces total code** (call site + helper < duplicated code)
- The helper has a **clear, descriptive name** that reads naturally at the call site

### When NOT to Extract

- Only one file uses it — keep it local as a file-scoped function
- The "duplication" does **subtly different things** in each context (e.g., different filter criteria, different edge case handling)
- Abstracting requires **so many parameters** that the call site is more complex than the original code
- The abstraction would be **used once** and exist only to "reduce duplication" on paper

Three similar lines of code is better than a premature abstraction. The goal is eliminating genuine duplication, not creating indirection.

---

See also: [DOMAIN.md](DOMAIN.md) for data format reference and domain knowledge.
