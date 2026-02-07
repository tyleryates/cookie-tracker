# Cookie Sales Types & Attribution Logic

**Last Updated:** 2026-02-05
**Critical Reference:** This document defines how all cookie sales are classified and attributed to scouts.

---

## Overview

All cookie sales fall into 6 distinct types based on:
1. **Sales Channel** (Girl's site vs Troop site)
2. **Fulfillment Method** (Direct ship vs Girl delivery)
3. **Allocation Mechanism** (Direct attribution vs Divider allocation)

---

## Sales Type Reference

### 1. Girl's Digital Cookie Site → Direct Ship

**Identification:**
- `Girl Last Name` ≠ "Site" (scout's own order)
- `Order Type` contains "Shipped" OR "shipped"

**Attribution:**
- Direct to scout (from order data)

**Display:**
- Column: **Shipped**
- Tooltip: N/A (self-explanatory)

**Classification Logic:**
Orders are classified as GIRL_DIRECT_SHIP when the girl's last name is not "Site" AND the order type contains "Shipped" (case-insensitive). These orders are tracked in `scout.$varietyBreakdowns.fromShipped` and do not require physical inventory from the scout since packages are shipped directly from the supplier to the customer.

**See:** [RECONCILIATION.md - Phase 2: Add DC Orders](RECONCILIATION.md#phase-2-add-dc-orders) for complete classification implementation

**Example:**
- Millie Yates orders 10 packages, shipped to customer
- Shows as: Millie → Shipped: 10

---

### 2. Girl's Digital Cookie Site → Girl Delivery

**Identification:**
- `Girl Last Name` ≠ "Site" (scout's own order)
- `Order Type` does NOT contain "Shipped" AND not "Donation"

**Attribution:**
- Direct to scout (from order data)

**Display:**
- Column: **Sales**
- Requires physical inventory
- Tooltip: N/A (self-explanatory)

**Classification Logic:**
Orders are classified as GIRL_DELIVERY when the girl's last name is not "Site", the order type does not contain "Shipped", and it's not a donation-only order. Physical packages are added to the scout's sales totals and inventory requirements.

**Example:**
- Charlie Yates sells 15 packages door-to-door
- Shows as: Charlie → Sales: 15, Inventory impact

---

### 3. Troop Digital Cookie Site → Direct Ship

**Identification:**
- `Girl Last Name` === "Site" (troop order)
- `Order Type` contains "Shipped" OR "shipped"

**Allocation:**
- Via **Smart Direct Ship Divider API**
- Endpoint: `GET /webapi/api/troops/directship/smart-directship-divider`
- Returns per-scout allocation by girlId
- Troop Cookie Manager allocates in Smart Cookie interface

**Attribution:**
- Allocated to scouts via `directShipAllocations` (from API)
- Matched by girlId to scout name

**Display:**
- Per Scout → Column: **Credited**
- Tooltip: "Troop Direct Ship: X packages"
- Site Row → Show UNALLOCATED packages only
- Site Row → Warning if unallocated > 0 (action required)

**How It Works:**
Direct ship divider data is imported and stored as allocations keyed by girlId with package counts and variety breakdowns. During display, each allocation is matched to a scout by girlId, and credited packages/varieties are added to the scout's totals with source "Troop Direct Ship". The Site row shows only unallocated packages (total site direct ship minus total allocated), with a warning if any remain unallocated.

**Example:**
- Troop3990 Site has 20 packages direct ship order
- TCM allocates: Millie 10, Charlie 10
- Shows as:
  - Millie → Credited: 10 (tooltip: "Troop Direct Ship: 10")
  - Charlie → Credited: 10 (tooltip: "Troop Direct Ship: 10")
  - Troop3990 Site → 0 packages (all allocated)

---

### 4. Troop Digital Cookie Site → Girl Delivery

**Identification:**
- `Girl Last Name` === "Site" (troop order)
- `Order Type` does NOT contain "Shipped" AND not "Donation"
- Also called "Virtual Delivery" or "Online Booth Sales for delivery"

**Allocation:**
- Via **Smart Virtual Booth Divider**
- Creates T2G transfers with `virtualBooth: true` flag
- Endpoint data comes from main orders API (transfer_type: "T2G", virtual_booth: true)
- Troop Cookie Manager allocates in Smart Cookie interface

**Attribution:**
- Allocated to scouts via T2G transfers where `virtualBooth === true`
- Matched by scout name (`transfer.to`)

**Display:**
- Per Scout → Column: **Credited**
- Tooltip: "Troop Girl Delivered: X packages"
- Site Row → Show UNALLOCATED packages only
- Site Row → Warning if unallocated > 0 (action required)

**How It Works:**
During Smart Cookie data import, T2G transfers with `virtualBooth: true` are identified as allocated troop girl delivery orders. Their packages and varieties are added to the scout's credited totals with source "Troop Girl Delivered". The Site row shows only unallocated packages (total site girl delivery minus total allocated via virtual booth), with a warning if any remain unallocated.

**Example:**
- Troop3990 Site has 2 packages girl delivery order
- TCM allocates: Millie 1, Charlie 1
- Shows as:
  - Millie → Credited: 1 (tooltip: "Troop Girl Delivered: 1")
  - Charlie → Credited: 1 (tooltip: "Troop Girl Delivered: 1")
  - Troop3990 Site → 0 packages (all allocated)

---

### 5. Door to Door / Cookies in Hand Sales

**Identification:**
- `Girl Last Name` ≠ "Site" (scout's own order)
- `Order Type` === "Cookies in Hand" OR "In Person Delivery"
- Does NOT contain "Shipped"

**Attribution:**
- Direct to scout (from order data)

**Display:**
- Column: **Sales**
- Requires physical inventory
- Tooltip: N/A (self-explanatory)

**Classification Logic:**
Uses the same logic as Type 2 (Girl's Digital Cookie - Girl Delivery). Orders with "Cookies in Hand" or "In Person Delivery" order types are classified as GIRL_DELIVERY and require physical inventory.

**Example:**
- Lucy Torres sells 8 packages at customer's door
- Shows as: Lucy → Sales: 8, Inventory impact

---

### 6. Booth Sales (Physical Troop Booth)

**Identification:**
- Future implementation (no current examples)
- Expected: Similar to Type 4 but for physical booth locations

**Allocation:**
- Via **Smart Booth Divider** (similar to Virtual Booth Divider)
- Creates T2G transfers with booth flag
- Troop Cookie Manager allocates in Smart Cookie interface

**Attribution:**
- Allocated to scouts via T2G transfers (booth-specific flag)
- Matched by scout name

**Display:**
- Per Scout → Column: **Credited**
- Tooltip: "Booth Sales: X packages"
- Site Row → Show UNALLOCATED packages only
- Site Row → Warning if unallocated > 0 (action required)

**Classification Logic:**
Not yet implemented. Expected to work similarly to Type 4 (virtual booth transfers) but for physical booth locations. When implemented, will look for T2G transfers with a booth-specific flag and add credited packages to scouts without physical inventory impact.

**Example (hypothetical):**
- Troop has 50 packages from physical booth
- TCM allocates based on scout participation
- Shows as: Each scout → Credited: X (tooltip: "Booth Sales: X")

---

## Special Case: Virtual Cookie Share

**Identification:**
- `Donation` field > 0 in Digital Cookie data
- `Order Type` can be any type (Donation, Shipped with Donation, etc.)

**Attribution:**
- Counts toward scout's total sold
- Does NOT require physical inventory (virtual)
- Manual entry tracking via Virtual Cookie Share report

**Display:**
- Column: **Donations**
- Tracked in varieties as "Cookie Share"
- Special reconciliation report

**Classification Logic:**
Cookie Share donations are identified by checking if the "Donation" field has a value greater than 0. These packages are added to the scout's donation totals and tracked under the "Cookie Share" variety. Cookie Share is virtual (requires no physical inventory) and has special reconciliation requirements detailed in the Virtual Cookie Share report.

**See:** [CRITICAL-BUSINESS-RULES.md - Cookie Share](CRITICAL-BUSINESS-RULES.md#cookie-share-virtual-donations) for complete reconciliation logic

---

## Column Definitions

| Column | Description | Inventory Impact |
|--------|-------------|------------------|
| **Sales** | Physical packages for in-person delivery | ✓ Requires inventory |
| **Picked Up** | T2G inventory received from troop | Physical only |
| **Inventory** | Net inventory (Picked Up - Sales) | Negative = shortage |
| **Booth** | Other troop credits (rare) | N/A |
| **Credited** | Troop booth + direct ship allocated | No inventory impact |
| **Shipped** | Scout's own direct ship orders | No inventory impact |
| **Donations** | Virtual Cookie Share packages | No inventory impact |
| **Total Sold** | Sales + Shipped + Donations + Credited | All sales |

---

## Data Flow Summary

```
Digital Cookie Orders
  ├─ Scout Orders (lastName ≠ Site)
  │   ├─ Shipped → Shipped column
  │   ├─ Girl Delivery → Sales column (needs inventory)
  │   └─ Cookie Share → Donations column
  │
  └─ Site Orders (lastName === Site)
      ├─ Direct Ship → Smart Direct Ship Divider
      │   └─ Allocated to scouts → Credited column
      │
      └─ Girl Delivery → Smart Virtual Booth Divider
          └─ Allocated to scouts → Credited column

Smart Cookie Transfers (T2G)
  ├─ Regular → Inventory for scout
  ├─ virtualBooth: true → Credited (Troop Girl Delivered)
  └─ Cookie Share → Virtual Cookie Share reconciliation

Smart Cookie Dividers
  ├─ Direct Ship Divider → Troop direct ship allocation
  └─ Virtual Booth Divider → Troop girl delivery allocation
```

---

## Critical Implementation Notes

1. **Site Order Tracking:**
   - Site orders are metadata - don't add to scout totals directly
   - Only show UNALLOCATED amounts in Site row
   - Allocated amounts show in individual scout's Credited column

2. **Credited Column Sources:**
   - Troop booth sales (virtualBooth transfers)
   - Troop direct ship (directShipAllocations)
   - Future: Physical booth sales
   - Should include tooltip showing source breakdown

3. **Inventory Calculations:**
   - Only physical packages count (exclude Cookie Share, Credited, Shipped)
   - Negative inventory = warning indicator
   - Booth/Credited sales don't impact scout's physical inventory

4. **Total Sold Calculation:**
   `totalSold = totalPackages + totalCredited`, where `totalPackages` is the sum of sales packages, shipped packages, and donations (scout's own), and `totalCredited` is the sum of booth credits and credited packages (troop-allocated).

5. **Total Sold Tooltip Breakdown:**
   Shows two lines: "Direct" (sales + shipped + donations) and "Credited" (booth credits + credited packages).

---

## Debugging Checklist

When investigating order classification issues:

1. Check `Girl Last Name` field
   - "Site" = troop order
   - Anything else = scout's own order

2. Check `Order Type` field
   - Contains "Shipped" = direct ship
   - "Donation" = Cookie Share only
   - Other = girl delivery (needs inventory)

3. Check Smart Cookie data
   - T2G with `virtualBooth: true` = troop girl delivery allocation
   - Direct Ship Divider API = troop direct ship allocation

4. Verify allocations sum correctly
   - Site direct ship total = sum of directShipAllocations
   - Site girl delivery total = sum of virtualBooth T2G transfers

5. Check for unallocated packages
   - Site row should show only unallocated
   - Warning if > 0 (TCM needs to allocate)

---

## Future Enhancements

- [ ] Add tooltips to Credited column showing source breakdown
- [ ] Implement physical booth sales handling (Type 6)
- [ ] Add allocation status indicators
- [ ] Show allocation history/audit trail
- [ ] Warn when site orders remain unallocated
- [ ] Support mixed fulfillment orders (partial ship, partial delivery)

---

## Related Documentation

- `PROGRAM-KNOWLEDGE.md` - Overall program structure and data sources
- `DATA-FORMATS.md` - Smart Cookie API and data structure reference

---

**Maintained by:** Tyler Yates
**For questions or updates:** Review actual order data and update this document
