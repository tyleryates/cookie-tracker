// Troop Totals Calculations
// Calculates troop-level aggregate totals and inventory

import { DC_COLUMNS, SPECIAL_IDENTIFIERS } from '../../constants';
import { PROCEEDS_EXEMPT_PACKAGES, getTroopProceedsRate } from '../../cookie-constants';
import type { IDataReconciler, Scout, SiteOrdersDataset, TroopTotals } from '../../types';
import { calculatePackageTotals } from './package-totals';
import { calculateScoutCounts } from './scout-calculations';

/** Aggregate scout-level totals: delivery, inventory, shipping, and proceeds */
function aggregateScoutTotals(scouts: Map<string, Scout>) {
  let directShip = 0;
  let creditedDonations = 0;
  let proceedsDeduction = 0;
  let exemptPackages = 0;
  let girlDelivery = 0;
  let girlInventory = 0;
  let pendingPickup = 0;

  scouts.forEach((scout) => {
    if (!scout.isSiteOrder) {
      girlDelivery += (scout.totals.sales || 0) + (scout.credited.virtualBooth.packages || 0);
      girlInventory += Math.max(0, scout.totals.inventory || 0);
      // Credited Cookie Share from divider allocations (site orders distributed to scouts)
      creditedDonations += scout.credited.virtualBooth.donations || 0;
      creditedDonations += scout.credited.directShip.donations || 0;
      creditedDonations += scout.credited.boothSales.donations || 0;
      // Shortfalls: orders approved for delivery but scout hasn't picked up inventory yet
      if (scout.$issues?.negativeInventory) {
        scout.$issues.negativeInventory.forEach((issue) => {
          pendingPickup += issue.shortfall;
        });
      }
    }
    directShip += scout.totals.shipped || 0;
    proceedsDeduction += scout.totals.$proceedsDeduction || 0;
    if (!scout.isSiteOrder && scout.totals.totalSold > 0) {
      exemptPackages += Math.min(scout.totals.totalSold, PROCEEDS_EXEMPT_PACKAGES);
    }
  });

  return { directShip, creditedDonations, proceedsDeduction, exemptPackages, girlDelivery, girlInventory, pendingPickup };
}

/** Count Cookie Share donations from DC raw data (non-site orders only).
 *  Site order donations are handled separately via credited allocations
 *  to avoid double-counting (site orders → booth/VB/DS dividers → scouts). */
function countDCDonations(rawDCData: Record<string, any>[]): number {
  let total = 0;
  rawDCData.forEach((row: Record<string, any>) => {
    if (row[DC_COLUMNS.GIRL_LAST_NAME] === SPECIAL_IDENTIFIERS.SITE_ORDER_LASTNAME) return;
    const donations = parseInt(row[DC_COLUMNS.DONATION], 10) || 0;
    if (donations > 0) total += donations;
  });
  return total;
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
  // Total donations = DC non-site (individual girl orders) + credited allocations (site orders distributed to scouts)
  const donations = countDCDonations(rawDCData) + scoutAgg.creditedDonations;

  // Troop proceeds: rate depends on Per Girl Average (PGA)
  const packagesCredited = packageTotals.ordered + donations + scoutAgg.directShip;
  const pga = scoutCounts.active > 0 ? Math.round(packagesCredited / scoutCounts.active) : 0;
  const proceedsRate = getTroopProceedsRate(pga);
  const grossProceeds = packagesCredited * proceedsRate;
  const exemptPackages = scoutCounts.active * PROCEEDS_EXEMPT_PACKAGES;
  const proceedsDeduction = exemptPackages * proceedsRate;
  const troopProceeds = grossProceeds - proceedsDeduction;

  return {
    orders: rawDCData.length,
    sold: packageTotals.sold,
    revenue: packageTotals.revenue,
    troopProceeds,
    proceedsRate,
    proceedsDeduction,
    proceedsExemptPackages: exemptPackages,
    inventory: totalInventory,
    donations,
    ordered: packageTotals.ordered,
    allocated: packageTotals.allocated,
    siteOrdersPhysical: packageTotals.siteOrdersPhysical,
    directShip: packageTotals.directShip,
    boothDividerT2G: packageTotals.boothDividerT2G,
    virtualBoothT2G: packageTotals.virtualBoothT2G,
    girlDelivery: scoutAgg.girlDelivery,
    girlInventory: scoutAgg.girlInventory,
    pendingPickup: scoutAgg.pendingPickup,
    scouts: scoutCounts
  };
}
