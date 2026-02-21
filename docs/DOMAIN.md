# Cookie Program Domain Knowledge

How the Girl Scout cookie program works, the two platforms, and the terms you'll encounter in the code.

For business rules, data classification, and technical format details, see **RULES.md**.

---

## Two Platforms, One Cookie Program

**Digital Cookie (DC)** — Customer-facing online sales platform. Used by girls and families. Tracks online orders, mobile app sales, customer data, payments, shipping. Girl-centric view.

**Smart Cookie (SC)** — Troop business management system. Used by Troop Cookie Managers (TCMs). Manages inventory, finances, reporting, council orders, transfers, booth sales. Troop-centric view.

These are **separate systems** that need manual reconciliation. Data flows DC → SC (not the other way), but not all of it and not immediately. Only about 10-15% of DC orders appear in SC transfers at any given time — this is normal, not a bug.

**Smart Cookie is the source of truth** for billing, inventory, and official reporting. Digital Cookie is one sales channel.

---

## How Sales Flow Through the Systems

A girl sells cookies online via Digital Cookie. The order appears in DC immediately. Some orders auto-sync to Smart Cookie (shipped orders, credit card donation-only orders). Others require manual reconciliation by the TCM.

Key reconciliation points:
- **Shipped orders:** DC "Shipped" orders should match SC Direct Ship Orders Report
- **Girl delivery:** DC orders (exclude "Site" rows, exclude shipped) should match SC Girl Cookie Order Detail
- **Cookie Share:** DC donation orders may need manual Virtual Cookie Share entries in SC (see RULES.md)
- **Troop site sales:** DC "Site" orders map to SC Booths → Virtual Booth and use Smart Booth Divider

---

## Cookie Varieties and Pricing

**$6/package:** Thin Mints, Caramel deLites, Adventurefuls, Exploremores, Lemonades, Peanut Butter Patties, Peanut Butter Sandwich, Trefoils, Cookie Share

**$7/package:** Caramel Chocolate Chip (gluten-free, limited availability)

Each system uses different names/IDs for the same cookies — see `src/cookie-constants.ts` for the full mapping.

---

## Glossary

### Order Terms
| Term | Definition |
|------|------------|
| **Girl Delivery** | Scout delivers cookies to customer in-person |
| **Direct Ship** | Cookies shipped directly to customer from supplier |
| **Cookie Share** | Donation packages (girl collects $, doesn't handle cookies) |
| **Troop Site Sales** | Booth/walk-up sales attributed to troop (last name "Site" in DC) |

### Organization Terms
| Term | Definition |
|------|------------|
| **TCM** | Troop Cookie Manager — volunteer managing troop cookies |
| **SUCC** | Service Unit Cookie Coordinator — supports multiple troops |
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
| **T2T** | Troop to Troop (can be incoming or outgoing) |
| **PGA** | Per Girl Average (total packages sold / girls selling) |

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

### Contact
| Purpose | Email |
|---------|-------|
| Reconciliation / payment issues | reconciliation@sdgirlscouts.org |
| Customer care / account sync | customercare@sdgirlscouts.org |
| Troop banking questions | troopbanking@sdgirlscouts.org |
