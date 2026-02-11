// Troop Totals Calculations
// Calculates troop-level aggregate totals and inventory

import { DC_COLUMNS, SPECIAL_IDENTIFIERS } from '../../constants';
import { getTroopProceedsRate, PROCEEDS_EXEMPT_PACKAGES } from '../../cookie-constants';
import type { DataStore } from '../../data-store';
import type { Scout, ScoutCounts, TroopTotals } from '../../types';
import type { PackageTotals } from './package-totals';

/** Aggregate scout-level totals: delivery, inventory, shipping, and proceeds */
function aggregateScoutTotals(scouts: Map<string, Scout>) {
  let directShip = 0;
  let creditedDonations = 0;
  let girlDelivery = 0;
  let girlInventory = 0;
  let pendingPickup = 0;
  let boothSalesPackages = 0;
  let boothSalesDonations = 0;

  scouts.forEach((scout) => {
    if (!scout.isSiteOrder) {
      const { booth: bs, directShip: ds, virtualBooth: vb } = scout.totals.$allocationSummary;

      girlDelivery += (scout.totals.delivered || 0) + vb.packages;
      girlInventory += Math.max(0, scout.totals.inventory || 0);
      // Credited Cookie Share from divider allocations (site orders distributed to scouts)
      creditedDonations += vb.donations + ds.donations + bs.donations;
      // Booth sales totals (used by booth and donation-alert reports)
      boothSalesPackages += bs.packages;
      boothSalesDonations += bs.donations;
      // Shortfalls: orders approved for delivery but scout hasn't picked up inventory yet
      if (scout.$issues?.negativeInventory) {
        scout.$issues.negativeInventory.forEach((issue) => {
          pendingPickup += issue.shortfall;
        });
      }
    }
    directShip += scout.totals.shipped || 0;
  });

  return { directShip, creditedDonations, girlDelivery, girlInventory, pendingPickup, boothSalesPackages, boothSalesDonations };
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
export function buildTroopTotals(
  reconciler: DataStore,
  scouts: Map<string, Scout>,
  packageTotals: PackageTotals,
  scoutCounts: ScoutCounts
): TroopTotals {
  const rawDCData = reconciler.metadata.rawDCData || [];

  // Net troop inventory: received from council minus all outflows, plus returns
  const totalInventory =
    packageTotals.c2tReceived - packageTotals.allocated - packageTotals.virtualBoothT2G - packageTotals.boothDividerT2G + packageTotals.g2t;
  const scoutAgg = aggregateScoutTotals(scouts);
  // Total donations = DC non-site (individual girl orders) + credited allocations (site orders distributed to scouts)
  const donations = countDCDonations(rawDCData) + scoutAgg.creditedDonations;

  // Troop proceeds: rate depends on Per Girl Average (PGA)
  const packagesCredited = packageTotals.c2tReceived + donations + scoutAgg.directShip;
  const pga = scoutCounts.active > 0 ? Math.round(packagesCredited / scoutCounts.active) : 0;
  const proceedsRate = getTroopProceedsRate(pga);
  const grossProceeds = packagesCredited * proceedsRate;
  const exemptPackages = scoutCounts.active * PROCEEDS_EXEMPT_PACKAGES;
  const proceedsDeduction = exemptPackages * proceedsRate;
  const troopProceeds = grossProceeds - proceedsDeduction;

  return {
    troopProceeds,
    proceedsRate,
    proceedsDeduction,
    proceedsExemptPackages: exemptPackages,
    inventory: totalInventory,
    donations,
    c2tReceived: packageTotals.c2tReceived,
    directShip: packageTotals.directShip,
    boothDividerT2G: packageTotals.boothDividerT2G,
    virtualBoothT2G: packageTotals.virtualBoothT2G,
    girlDelivery: scoutAgg.girlDelivery,
    girlInventory: scoutAgg.girlInventory,
    pendingPickup: scoutAgg.pendingPickup,
    boothSalesPackages: scoutAgg.boothSalesPackages,
    boothSalesDonations: scoutAgg.boothSalesDonations,
    packagesCredited,
    grossProceeds,
    scouts: scoutCounts
  };
}
