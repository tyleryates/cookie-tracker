# Data Sources Priority & Conflict Resolution

**When Smart Cookie and Digital Cookie disagree, which is correct?**

---

## The Hierarchy

### 🥇 Smart Cookie = PRIMARY (Source of Truth)

Smart Cookie is the **authoritative data source** for:
- ✅ **Packages Sold** - Official billing number
- ✅ **Inventory** - C2T pickups, T2G allocations
- ✅ **Financial Tracking** - Money owed, payments
- ✅ **Troop Totals** - Overall metrics

**Why:** Smart Cookie is what Girl Scouts uses for billing, financial reconciliation, and official reporting.

### 🥈 Digital Cookie = SUPPLEMENTAL (Additional Context)

Digital Cookie provides:
- 📋 **Customer Details** - Names, addresses, contact info
- 📋 **Order Specifics** - Payment method, shipping preferences
- 📋 **Variety Breakdowns** - What cookies were in each order
- 📋 **Payment Status** - CAPTURED, CASH, PENDING

**Why:** Digital Cookie is one sales channel. Data syncs TO Smart Cookie, not the other way.

---

## Decision Matrix

### When Numbers Differ

| Scenario | Trust | Why |
|----------|-------|-----|
| SC says 500 packages sold, DC says 450 | **Trust SC** | DC may have pending orders not yet synced |
| SC shows $3000 revenue, DC shows $2700 | **Trust SC** | SC includes all sales channels (booth, direct) |
| SC inventory = 100, DC doesn't track inventory | **Trust SC** | DC doesn't manage inventory |
| DC order has customer address, SC doesn't | **Trust DC** | DC is customer-facing, has this data |
| Payment status differs | **Trust DC** | DC handles payments directly |

### What to Do When Sources Conflict

1. **Check if DC orders are fully synced to SC** -- Most DC orders take time to sync; only ~10-15% appear in SC immediately.
2. **Check if SC includes booth sales** -- SC includes troop booth sales that DC may not show yet.
3. **Check transfer types counted** -- SC counts T2G, D, DIRECT_SHIP, and COOKIE_SHARE; DC only shows online/app orders.
4. **When in doubt: Trust Smart Cookie** -- It's the billing system and Girl Scouts council uses SC numbers.

---

## Common Scenarios

### Scenario 1: "Packages Sold" Doesn't Match

**Example:**
- Smart Cookie dashboard: 769 packages sold
- Digital Cookie report: 650 packages

**Diagnosis:**
Smart Cookie counts T2G (651) + D (31) + DIRECT_SHIP (66) + COOKIE_SHARE (21) = 769 packages. Digital Cookie counts only online orders (650) and doesn't include booth sales or some transfers.

**Resolution:** ✅ Trust Smart Cookie (769)

**Why:** SC includes all sales channels. DC is one channel.

---

### Scenario 2: Scout Has Orders in DC But Not SC

**Example:**
- Digital Cookie shows scout has 5 orders
- Smart Cookie shows 0 T2G transfers for that scout

**Diagnosis:**
- Orders are placed but not yet picked up
- Scout hasn't collected inventory from troop yet
- T2G transfer happens when scout picks up cookies

**Resolution:** ✅ Both are correct!
- DC is correct: Orders exist
- SC is correct: Not sold until picked up

**Action:** Scout needs to pick up inventory (T2G transfer)

---

### Scenario 3: Inventory Calculation Conflicts

**Example:**
- You calculate: Scout received 100, sold 80, should have 20
- Smart Cookie shows: Scout has 0 inventory

**Possible Causes:**
1. Virtual booth credits counted as physical (wrong)
2. Cookie Share counted as physical (wrong)
3. Direct ship orders counted as needing inventory (wrong)
4. Site orders not subtracted from troop inventory (wrong)

**Resolution:**
1. Check if booth credits excluded: `virtualBooth: true`
2. Check if Cookie Share excluded from physical
3. Check if shipped orders in separate bucket
4. Recalculate with only physical transfers

**Trust Smart Cookie's final number** if calculation still differs.

---

### Scenario 4: Revenue Doesn't Match

**Example:**
- Digital Cookie: $2850 in online sales
- Smart Cookie: $4614 total revenue

**Diagnosis:**
Digital Cookie shows only online order revenue ($2850). Smart Cookie includes all channels: online ($2850) + booth ($1200) + cash ($564) = $4614.

**Resolution:** ✅ Trust Smart Cookie (includes all channels)

---

## Reconciliation Checklist

When reconciling data:

### ✅ Inventory Reconciliation
- [ ] Use SC for C2T (inventory received)
- [ ] Use SC for T2G (inventory allocated)
- [ ] Exclude virtual booth credits (not physical)
- [ ] Exclude Cookie Share (virtual)
- [ ] Subtract site orders from troop inventory

### ✅ Sales Reconciliation
- [ ] Use SC "Packages Sold" as authoritative
- [ ] Count T2G, D, DIRECT_SHIP, COOKIE_SHARE
- [ ] Exclude C2T (inventory in, not sold)
- [ ] Exclude PLANNED (future orders)

### ✅ Financial Reconciliation
- [ ] Use SC for total revenue
- [ ] Use SC for amounts owed
- [ ] Use DC for payment method details
- [ ] Use DC for customer payment status

### ✅ Customer Data
- [ ] Use DC for customer names/addresses
- [ ] Use DC for contact information
- [ ] Use DC for delivery preferences
- [ ] Use SC for order fulfillment status

---

## Quick Reference

### Use Smart Cookie For:
- 📊 Official "Packages Sold" number
- 💰 Total revenue and financial reporting
- 📦 Inventory tracking (C2T, T2G)
- 🏆 Scout performance metrics
- 📈 Troop totals and summaries

### Use Digital Cookie For:
- 👥 Customer details and addresses
- 💳 Payment method and status
- 📱 Order type (online, mobile app)
- 🎁 Gift recipients and messages
- 📧 Customer communication history

### Cross-Check Both When:
- 🔍 Investigating discrepancies
- 🐛 Debugging data issues
- 📝 Verifying individual orders
- ✅ Validating import accuracy

---

## App Implementation

**How the Cookie Tracker handles this:**

The app uses Smart Cookie totals (from `reconciler.unified.troopTotals`) as the primary numbers and Digital Cookie metadata for supplemental detail. When SC and DC totals differ, SC is trusted and the discrepancy is logged.

**Report Display Pattern:**
- Show SC numbers prominently
- Show DC numbers as "(from Digital Cookie)" for context
- Flag discrepancies with warning icon
- Provide explanation tooltips

---

## When to Update Each System

### Update Smart Cookie When:
- Scout picks up inventory (create T2G transfer)
- Troop receives cupboard order (C2T recorded automatically)
- Manual Cookie Share needs entry
- Booth sales need allocation

### Update Digital Cookie When:
- Customer information changes
- Shipping address corrections
- Payment method updates
- Order modifications (customer-requested)

**Note:** Changes in DC may eventually sync to SC, but don't rely on automatic sync for critical data.

---

## Related Documentation

- [CRITICAL-BUSINESS-RULES.md](CRITICAL-BUSINESS-RULES.md) - Business logic for counting packages
- [DATA-FORMATS.md](DATA-FORMATS.md) - Smart Cookie and Digital Cookie data structures
- [SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md) - Overall architecture
- [RECONCILIATION.md](RECONCILIATION.md) - Data reconciliation implementation

---

*This document establishes the official data source hierarchy for the Cookie Tracker application.*
