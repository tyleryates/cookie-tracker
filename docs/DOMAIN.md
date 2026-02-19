# Cookie Program Domain Knowledge

Everything about how the Girl Scout cookie program works, how the two platforms relate, and the non-obvious details you need to know when working with the data.

---

## Two Platforms, One Cookie Program

**Digital Cookie** — Customer-facing online sales platform. Used by girls and families. Tracks online orders, mobile app sales, customer data, payments, shipping. Girl-centric view.

**Smart Cookie** — Troop business management system. Used by Troop Cookie Managers (TCMs). Manages inventory, finances, reporting, council orders, transfers, booth sales. Troop-centric view.

These are **separate systems** that need manual reconciliation. They track the same sales from different perspectives. Data flows DC to SC (not the other way), but not all of it and not immediately.

**Smart Cookie is the source of truth** for billing, inventory, and official reporting. Digital Cookie is one sales channel.

---

## How Sales Flow Through the Systems

A girl sells cookies online via Digital Cookie. The order appears in DC immediately. Some orders auto-sync to Smart Cookie (shipped orders, donation-only orders). Others require manual reconciliation by the TCM. Only about 10-15% of DC orders appear in SC transfers at any given time — this is normal, not a bug.

Key reconciliation points (from GSSD official guidance):
- **Shipped orders:** DC "Shipped" orders should match SC Direct Ship Orders Report
- **Girl delivery:** DC orders (exclude "Site" rows, exclude shipped) should match SC Girl Cookie Order Detail
- **Cookie Share:** DC donation orders need manual Virtual Cookie Share entries in SC for certain types
- **Troop site sales:** DC "Site" orders map to SC Booths > Virtual Booth and use Smart Booth Divider

---

## Order Types

### Digital Cookie Order Types
1. **Shipped / Shipped with Donation** — Direct ship to customer
2. **In Person Delivery / In Person Delivery with Donation** — Girl delivers
3. **Cookies in Hand / Cookies in Hand with Donation** — Immediate sale
4. **Pick Up** — Customer picks up at location
5. **Donation** — Cookie Share only (no physical cookies)

### Smart Cookie Transfer Types
| Type | Direction | Meaning |
|------|-----------|---------|
| `C2T` / `C2T(P)` | IN | Council to Troop (warehouse pickup) |
| `T2T` | IN or OUT | Troop to Troop (direction depends on from/to vs our troop number) |
| `T2G` | OUT | Troop to Girl (scout pickup from troop inventory) |
| `G2T` | IN | Girl to Troop (return) |
| `D` | — | DC order synced to SC (sync record) |
| `COOKIE_SHARE` / `COOKIE_SHARE_D` | — | Donation package sale (manual or DC-synced) |
| `DIRECT_SHIP` | — | Shipped order (may have S prefix) |
| `PLANNED` | — | Future/uncommitted order |

All OUT transactions have **negative quantities** in SC data — use `Math.abs()` for display.

### Special Cases

**"Site" Orders** — Troop booth sales, NOT individual girl sales. In DC data: Last Name = "Site", First Name = "Troop XXXX". Must be filtered OUT of per-girl reports but included in troop totals.

**Cookie Share** — Donation orders where cookies go to military. Girl collects money but doesn't handle physical cookies. Appears in both systems with different formats. "with Donation" suffix in DC order types indicates Cookie Share.

### Order Number Formats
- **Digital Cookie**: `229584475` (9-digit numeric, no prefix)
- **Smart Cookie Transfer**: `D229584475` (same order with D prefix)
- **Smart Cookie Report**: `229584475` (matches DC exactly)

Strip the `D` prefix when matching SC transfers to DC orders.

---

## Cookie Varieties and Pricing

**$6/package:** Thin Mints, Caramel deLites, Adventurefuls, Exploremores, Lemonades, Peanut Butter Patties, Peanut Butter Sandwich, Trefoils, Cookie Share

**$7/package:** Caramel Chocolate Chip (gluten-free, limited availability)

### Name Mappings Across Systems

Each system uses different names and identifiers for the same cookies:

| DC Name | SC Abbreviation | SC Report Column | SC API ID |
|---------|----------------|-----------------|-----------|
| Adventurefuls | ADV | C2 | 48 |
| Caramel deLites | CD | C8 | 1 |
| Caramel Chocolate Chip | GFC | C11 | 52 |
| Exploremores | EXP | C3 | 56 |
| Lemonades | LEM | C4 | 34 |
| Peanut Butter Patties | PBP | C7 | 2 |
| Peanut Butter Sandwich | PBS | C9 | 5 |
| Thin Mints | TM | C6 | 4 |
| Trefoils | TRE | C5 | 3 |
| Cookie Share | CShare | C1 | 37 |

---

## Data Format Gotchas

These are the non-obvious data format issues that cause bugs if you don't know about them:

**Excel serial dates (DC):** DC dates are Excel serial numbers like `46053.55347222222` (days since 1900-01-01), NOT ISO strings. Convert: `new Date((excelDate - 25569) * 86400000)`.

**String booleans (SC Report):** Fields like `CShareVirtual` are strings `"TRUE"`/`"FALSE"`, not actual booleans. `IncludedInIO` is `"Y"`/`"N"`. Must compare as strings.

**Cases/packages format (SC Report):** Cookie columns use `"cases/packages"` like `"2/5"`. Calculate total: `(cases * 12) + packages`. So `"2/5"` = 29 packages.

**Numbers as strings:** Some DC Excel numbers come as strings — must parse explicitly with `parseInt`/`parseFloat`.

**Negative quantities (SC):** All SC transfer OUT quantities are negative. The app takes `Math.abs()` on import.

**D prefix on order numbers:** SC transfers prefix DC order numbers with `D`. Must strip before matching. Direct ship orders may have `S` prefix.

**`transfer_type` vs `type`:** In SC API responses, the actual transfer type is in `transfer_type`, NOT `type` (which is always "TRANSFER").

**C2T type variants:** C2T transfers have suffix variants (`C2T`, `C2T(P)`, potentially others). Never match with exact equality — use startsWith or the `isC2TTransfer()` helper. **Note:** T2T is NOT a C2T variant — it's a separate transfer type with directional semantics (see below).

**T2T direction detection:** T2T transfers are directional — outgoing (our troop sends) vs incoming (another troop sends to us). Direction is determined by comparing the transfer's `from` field against our `troopNumber`. The API `from`/`to` fields contain troop names (e.g., "Troop 3990") while `troopNumber` is a numeric ID (e.g., "3990") from `/me` `troop_id`. The `matchesTroopNumber()` helper in `data-store-operations.ts` handles this format mismatch by extracting the numeric part.

**SC date formats vary:** SC Report uses strings like `"01/25/2026 11:20:42 AM"`. SC Transfers use short dates like `"01/28/2026"`.

**Completed vs Delivered:** In DC data, both "Completed" and "Delivered" statuses mean the order is finished.

---

## Scraper Authentication

Both scrapers use direct API calls (no browser automation).

### Digital Cookie
1. GET `/login` — extract CSRF token from `<input name="_requestConfirmationToken" value="..."/>`
2. POST `/j_spring_security_check` — form login with CSRF token
3. GET `/select-role` — parse role options; auto-select first "Troop" role if none specified
4. The role name contains embedded IDs: "Troop **1234** of Service Unit **567**" — extract with regex
5. GET `/ajaxCall/generateReport?reportType=TROOP_ORDER_REPORT&troopId={id}&serviceUnitId={id}&councilId={id}&troopGlobalID={roleId}`
6. GET `/ajaxCall/downloadFile/TROOP_ORDER_REPORT/{fileName}` — download Excel

### Smart Cookie
1. POST `/webapi/api/account/login` — login with credentials
2. Extract XSRF token from `XSRF-TOKEN` cookie — **CRITICAL:** URL-decode `%7C` to `|` (token format is `part1|part2`)
3. GET `/webapi/api/me` — initialize session
4. GET `/webapi/api/orders/dashboard` — initialize orders context
5. POST `/webapi/api/orders/search` — fetch all orders with `x-xsrf-token` header

---

## Virtual Cookie Share — When Manual Entry Is Required

Virtual Cookie Share orders are manual entries in Smart Cookie that give girls credit for Cookie Share packages. They count toward total packages sold and affect rewards.

**Requires manual entry:**
- **Girl Delivery with Donation** — Customer orders cookies AND Cookie Share. Cookies flow automatically, but TCM must manually create Virtual Cookie Share for the donation portion.
- **Non-credit-card Cookie Share** — Cookie Share sold for cash/check outside DC.

**Does NOT require manual entry (credit card payments only):**
- Ship-only orders with Cookie Share paid by credit card (flows automatically)
- Donation-only orders paid by credit card (flows automatically)

**Note:** CASH payment types NEVER auto-sync regardless of order type. See RULES.md for the full auto-sync matrix.

---

## Financial Model

### Payment Flow
Credit card payments through Digital Cookie do NOT go into the troop bank account. Instead, troops receive credit that reduces the ACH balance due at season end.

### Troop Proceeds
Troops earn $0.85–$0.95 per package based on Per Girl Average (PGA). Exact tiers in council program materials.

### ACH Payments
- **First payment (Feb 11):** Auto-debited, adjusted for DC payments received
- **Final payment (Mar 11):** Auto-debited, adjusted for outstanding balances and DC payments

---

## Glossary

### Order Terms
| Term | Definition |
|------|------------|
| **Girl Delivery** | Scout delivers cookies to customer in-person |
| **Direct Ship** | Cookies shipped directly to customer from supplier |
| **Cookie Share** | Donation packages (girl collects $, doesn't handle cookies) |
| **Troop Site Sales** | Booth/walk-up sales attributed to troop (last name "Site" in DC) |
| **Planned Order** | Future/uncommitted order in SC |

### Organization Terms
| Term | Definition |
|------|------------|
| **TCM** | Troop Cookie Manager — volunteer managing troop cookies |
| **SUCC** | Service Unit Cookie Coordinator — supports multiple troops |
| **IRM** | Individually Registered Member — scouts not in a troop |
| **Service Unit** | Geographic grouping of troops |
| **Council** | Regional GSUSA organization (e.g., Girl Scouts San Diego, Council 623) |

### Inventory Terms
| Term | Definition |
|------|------------|
| **Package** | Single box of cookies |
| **Case** | Container of 12 packages |
| **C2T** | Council to Troop (warehouse pickup) |
| **T2G** | Troop to Girl (scout pickup from troop inventory) |
| **G2T** | Girl to Troop (return) |
| **PGA** | Per Girl Average (total packages sold / girls selling) |
| **troopNumber** | Numeric troop ID from SC `/me` `troop_id` (e.g., `"3990"`) — used for T2T direction detection |
| **troopName** | Display name from SC (e.g., `"Troop 3990"`) — appears in transfer `from`/`to` fields |

---

## 2026 Season Reference (Girl Scouts San Diego)

### Key Dates
| Event | Date |
|-------|------|
| Initial Orders Due | December 12, 2025 |
| Delivery Day | January 24, 2026 |
| Sales Period | January 25 – March 8, 2026 |
| Booths Begin | February 7, 2026 |
| First ACH Payment | February 11, 2026 |
| Final ACH Payment | March 11, 2026 |
| Outstanding Balance Deadline | March 12, 2026 |

### Booth Operations
- Must be at council-approved locations only
- Scheduling: lottery system (high-demand) or first-come-first-serve
- Smart Booth Divider: tool to allocate booth inventory/sales to individual girls
- Troop Secured Booths: arranged directly with businesses, still must be council-approved

### Contact
| Purpose | Email |
|---------|-------|
| Reconciliation / payment issues | reconciliation@sdgirlscouts.org |
| Customer care / account sync | customercare@sdgirlscouts.org |
| Troop banking questions | troopbanking@sdgirlscouts.org |
