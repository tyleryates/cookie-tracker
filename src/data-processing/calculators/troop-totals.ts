// Troop Totals Calculations
// Calculates troop-level aggregate totals and inventory

import { PROCEEDS_EXEMPT_PACKAGES, TROOP_PROCEEDS_PER_PACKAGE } from '../../cookie-constants';
import type { IDataReconciler, Scout, SiteOrdersDataset, TroopTotals } from '../../types';
import { calculatePackageTotals } from './package-totals';
import { calculateScoutCounts } from './scout-calculations';

/** Aggregate scout-level totals: delivery, inventory, shipping, and proceeds */
function aggregateScoutTotals(scouts: Map<string, Scout>) {
  let directShip = 0;
  let proceedsDeduction = 0;
  let exemptPackages = 0;
  let girlDelivery = 0;
  let girlInventory = 0;

  scouts.forEach((scout) => {
    if (!scout.isSiteOrder) {
      girlDelivery += scout.totals.sales || 0;
      girlInventory += Math.max(0, scout.totals.inventory || 0);
    }
    directShip += scout.totals.shipped || 0;
    proceedsDeduction += scout.totals.$proceedsDeduction || 0;
    if (!scout.isSiteOrder && scout.totals.totalSold > 0) {
      exemptPackages += Math.min(scout.totals.totalSold, PROCEEDS_EXEMPT_PACKAGES);
    }
  });

  return { directShip, proceedsDeduction, exemptPackages, girlDelivery, girlInventory };
}

/** Build troop-level aggregate totals */
export function buildTroopTotals(reconciler: IDataReconciler, scouts: Map<string, Scout>, _siteOrders: SiteOrdersDataset): TroopTotals {
  const rawDCData = reconciler.metadata.rawDCData || [];
  const packageTotals = calculatePackageTotals(reconciler.transfers, rawDCData);

  // Net troop inventory: received from council minus all outflows, plus returns
  const totalInventory =
    packageTotals.ordered - packageTotals.allocated - packageTotals.virtualBoothT2G - packageTotals.boothDividerT2G + packageTotals.g2t;

  const scoutCounts = calculateScoutCounts(scouts);
  const scoutAgg = aggregateScoutTotals(scouts);

  // Troop proceeds: $0.90/pkg for all packages troop is responsible for, minus per-girl exemptions
  const grossProceeds = (packageTotals.ordered + packageTotals.donations + scoutAgg.directShip) * TROOP_PROCEEDS_PER_PACKAGE;
  const troopProceeds = grossProceeds - scoutAgg.proceedsDeduction;

  // Packages sold from troop stock = all T2G outflows minus returns
  const packagesSoldFromStock = packageTotals.allocated + packageTotals.virtualBoothT2G + packageTotals.boothDividerT2G - packageTotals.g2t;

  return {
    orders: rawDCData.length,
    sold: packageTotals.sold,
    revenue: packageTotals.revenue,
    troopProceeds,
    proceedsDeduction: scoutAgg.proceedsDeduction,
    proceedsExemptPackages: scoutAgg.exemptPackages,
    inventory: totalInventory,
    packagesSoldFromStock,
    donations: packageTotals.donations,
    ordered: packageTotals.ordered,
    allocated: packageTotals.allocated,
    siteOrdersPhysical: packageTotals.siteOrdersPhysical,
    directShip: packageTotals.directShip,
    boothDividerT2G: packageTotals.boothDividerT2G,
    girlDelivery: scoutAgg.girlDelivery,
    girlInventory: scoutAgg.girlInventory,
    scouts: scoutCounts
  };
}
