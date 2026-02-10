# Girl Scout Cookie Systems Overview

Domain knowledge about the two primary systems this app reconciles.

---

## Two Primary Systems

**Digital Cookie** — Customer-facing online sales platform
- Used by girls and families
- Tracks online orders, mobile app sales
- Manages customer data, payments, shipping
- Girl-centric view

**Smart Cookies** — Troop business management system
- Used by Troop Cookie Managers (TCMs)
- Manages inventory, finances, reporting
- Handles council orders, transfers, booth sales
- Troop-centric view

These are **separate systems** that need manual reconciliation. They track the same sales from different perspectives and don't fully auto-sync.

---

## Digital Cookie

### Order Types
1. **Shipped / Shipped with Donation** — Direct ship to customer
2. **In Person Delivery / In Person Delivery with Donation** — Girl delivers
3. **Cookies in Hand / Cookies in Hand with Donation** — Immediate sale
4. **Pick Up** — Customer picks up at location
5. **Donation** — Cookie Share only

### Reports Available
- **All Orders Report** — Comprehensive export (this is what the app imports)

---

## Smart Cookies

### Main Sections
- **Dashboard** — Key metrics: sales, finances, inventory, PGA
- **Orders** — Initial, Transfer, Planned, Damage, Virtual Cookie Share, Troop Direct Ship
- **Booth** — Scheduling, reservations, Smart Booth Divider
- **Reports** — Girl Cookie Order Detail, Direct Ship Orders, Financial reports
- **Finances** — Financial transactions

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

## GSSD Reconciliation Requirements

Official guidance from "Reconciling Digital Cookie and Smart Cookies Reporting Troop":

**Ship Only Sales:** DC All Orders (filter "Shipped") should match SC Direct Ship Orders Report.

**Girl Delivery Sales:** DC All Orders (exclude "Site" rows, exclude shipped) should match SC Girl Cookie Order Detail (filter "Girl Delivery").

**Cookie Share Sales:** DC All Orders (exclude "Site", filter donation types) compared to SC Girl Cookie Order Detail. "In Person with Donation" and "Cookies In Hand with Donation" need Cookie Share entries created in SC.

**Troop Site Sales — Delivery:** DC All Orders (filter Site + delivery types) → SC Booths > My Reservation > Virtual Booth. Use Smart Booth Divider to allocate.

**Troop Site Sales — Shipped:** DC All Orders (filter Site + shipped types) → SC Orders > Troop Ship Orders. Distribute to girls before end of sale.

---

## Report Mapping

| DC Report | SC Equivalent | Notes |
|-----------|--------------|-------|
| All Orders (Girl Delivery) | Girl Cookie Order Detail | Filter for Girl Delivery |
| All Orders (Shipped) | Direct Ship Orders Report | Should match |
| All Orders (Site) | Virtual Booth / Smart Booth Divider | Allocated via reservations API |
| N/A | Financial Transactions | SC only |
| N/A | Transfer Orders | SC only — inventory moves |
