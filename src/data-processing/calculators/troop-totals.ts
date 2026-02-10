// Troop Totals Calculations
// Calculates troop-level aggregate totals and inventory

import { PROCEEDS_EXEMPT_PACKAGES, TROOP_PROCEEDS_PER_PACKAGE } from '../../cookie-constants';
import type { IDataReconciler, Scout, SiteOrdersDataset, TroopTotals } from '../../types';
import { calculatePackageTotals } from './package-totals';
import { calculateScoutCounts } from './scout-calculations';

/** Build troop-level aggregate totals */
export function buildTroopTotals(reconciler: IDataReconciler, scouts: Map<string, Scout>, _siteOrders: SiteOrdersDataset): TroopTotals {
  const rawDCData = reconciler.metadata.rawDCData || [];

  // Count total DC orders
  const totalOrders = rawDCData.length;

  // Calculate package totals from transfers
  const packageTotals = calculatePackageTotals(reconciler.transfers, rawDCData);

  // Calculate net troop inventory
  //
  // FORMULA: Received from Council - All ways packages leave troop stock
  //
  // Inventory IN:
  //   - C2T transfers (excluding Cookie Share - it's virtual)
  //
  // Inventory OUT:
  //   - Physical T2G: Scout picks up packages
  //   - Virtual Booth T2G: Site order allocated to scout (already delivered)
  //   - Booth Divider T2G: Booth sale allocated to scout (already sold)
  //
  // Note: Cookie Share is excluded from both IN and OUT because it's virtual
  // G2T returns add packages back to troop stock
  const totalInventory =
    packageTotals.ordered - packageTotals.allocated - packageTotals.virtualBoothT2G - packageTotals.boothDividerT2G + packageTotals.g2t;

  // Calculate scout-level aggregate statistics
  const scoutCounts = calculateScoutCounts(scouts);

  // Calculate scout-level aggregates
  let totalDirectShip = 0;
  let totalProceedsDeduction = 0;
  let totalExemptPackages = 0;
  let totalGirlDelivery = 0; // Packages girls actually sold for delivery (DC orders)
  let totalGirlInventory = 0; // Packages girls picked up but haven't sold yet
  scouts.forEach((scout) => {
    if (!scout.isSiteOrder) {
      totalGirlDelivery += scout.totals.sales || 0;
      totalGirlInventory += Math.max(0, scout.totals.inventory || 0);
    }
    totalDirectShip += scout.totals.shipped || 0;
    totalProceedsDeduction += scout.totals.$proceedsDeduction || 0;
    if (!scout.isSiteOrder && scout.totals.totalSold > 0) {
      totalExemptPackages += Math.min(scout.totals.totalSold, PROCEEDS_EXEMPT_PACKAGES);
    }
  });

  // Calculate troop proceeds ($0.90 per package)
  // Formula: (C2T received + Cookie Share + Direct Ship) × $0.90 − per-girl exemptions
  // Troop is financially responsible for ALL packages received from council,
  // regardless of whether they've been allocated to girls yet (includes inventory on hand)
  const grossProceeds = (packageTotals.ordered + packageTotals.donations + totalDirectShip) * TROOP_PROCEEDS_PER_PACKAGE;
  const troopProceeds = grossProceeds - totalProceedsDeduction;

  // Packages sold from troop stock = all T2G that depleted troop inventory minus returns
  // Computed directly from component totals (not derived from other computed values)
  const packagesSoldFromStock = packageTotals.allocated + packageTotals.virtualBoothT2G + packageTotals.boothDividerT2G - packageTotals.g2t;

  return {
    orders: totalOrders,
    sold: packageTotals.sold,
    revenue: packageTotals.revenue,
    troopProceeds: troopProceeds,
    proceedsDeduction: totalProceedsDeduction,
    proceedsExemptPackages: totalExemptPackages,
    inventory: totalInventory,
    packagesSoldFromStock: packagesSoldFromStock,
    donations: packageTotals.donations,
    ordered: packageTotals.ordered,
    allocated: packageTotals.allocated,
    siteOrdersPhysical: packageTotals.siteOrdersPhysical,
    directShip: packageTotals.directShip,
    boothDividerT2G: packageTotals.boothDividerT2G,
    girlDelivery: totalGirlDelivery,
    girlInventory: totalGirlInventory,

    // Scout-level aggregate stats
    scouts: scoutCounts
  };
}
