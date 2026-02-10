import { calculateRevenue } from '../../cookie-constants';
import type { BoothReservationImported, IDataReconciler } from '../../types';
import { createHorizontalStats, escapeHtml } from '../html-builder';

function generateTroopSummaryReport(reconciler: IDataReconciler): string {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.troopTotals) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const troopTotals = reconciler.unified.troopTotals;

  let html = '<div class="report-visual"><h3>Troop Summary</h3>';

  // Sales channel breakdown
  const boothSalesPackages = troopTotals.boothDividerT2G;
  const girlDeliveryPackages = troopTotals.girlDelivery;
  const directShipPackages = troopTotals.directShip;
  const donationPackages = troopTotals.donations;
  const totalSold = boothSalesPackages + girlDeliveryPackages + directShipPackages + donationPackages;

  const channelStats = [
    { label: 'Booth Sales', value: boothSalesPackages, description: 'Via booth divider', color: '#7B1FA2' },
    { label: 'Girl Delivery', value: girlDeliveryPackages, description: 'Sold from hand', color: '#2196F3' },
    { label: 'Direct Ship', value: directShipPackages, description: 'Shipped orders', color: '#0288D1' },
    { label: 'Donations', value: donationPackages, description: 'Cookie Share', color: '#7B1FA2' },
    { label: 'Total Sold', value: totalSold, description: 'To customers', color: '#4CAF50' }
  ];

  html += createHorizontalStats(channelStats);

  // Operational stats: received, sold (from stock), inventory, cash owed
  // packagesSoldFromStock is pre-computed from component totals in troop-totals.ts
  const packagesSold = troopTotals.packagesSoldFromStock;
  const varieties = reconciler.unified.varieties;
  const inventoryValue = Math.round(calculateRevenue(varieties.inventory));
  const salesRevenue = Math.round(troopTotals.revenue);
  const cashOwed = salesRevenue + inventoryValue;
  const cashTooltip = `Sales: $${salesRevenue}\nInventory: $${inventoryValue}`;
  const cashOwedHtml = `<span class="tooltip-cell" data-tooltip="${escapeHtml(cashTooltip)}">$${cashOwed}</span>`;

  html += createHorizontalStats([
    { label: 'Total Received', value: troopTotals.ordered, description: 'Packages from council', color: '#ff9800' },
    { label: 'Packages Sold', value: packagesSold, description: 'From troop stock', color: '#4CAF50' },
    { label: 'Troop Inventory', value: troopTotals.inventory, description: 'Troop on hand', color: '#9C27B0' },
    { label: 'Girl Inventory', value: troopTotals.girlInventory, description: 'Girls on hand', color: '#9C27B0' },
    { label: 'Cash Owed', value: cashOwedHtml, description: 'Troop owes council', color: '#C62828' }
  ]);

  // Financial stats
  const financialStats: { label: string; value: string; description: string; color: string }[] = [
    { label: 'Total Revenue', value: `$${Math.round(troopTotals.revenue)}`, description: 'Retail price (to GSUSA)', color: '#ff9800' }
  ];
  if (troopTotals.proceedsDeduction > 0) {
    financialStats.push({
      label: 'First-50 Deduction',
      value: `-$${Math.round(troopTotals.proceedsDeduction)}`,
      description: `${troopTotals.proceedsExemptPackages} pkg × $0.90`,
      color: '#f44336'
    });
  }
  financialStats.push({
    label: 'Troop Proceeds',
    value: `$${Math.round(troopTotals.troopProceeds)}`,
    description: 'After first-50 deduction',
    color: '#4CAF50'
  });
  html += createHorizontalStats(financialStats);

  // Add booth reservation stats if available (exclude Virtual Delivery booths)
  const allBoothReservations = reconciler.unified.boothReservations || [];
  const boothReservations = allBoothReservations.filter(
    (r: BoothReservationImported) => !(r.booth.reservationType || '').toLowerCase().includes('virtual')
  );
  if (boothReservations.length > 0) {
    const distributedCount = boothReservations.filter((r: BoothReservationImported) => r.booth.isDistributed).length;
    html += createHorizontalStats([
      { label: 'Booths', value: boothReservations.length, description: `${distributedCount} distributed`, color: '#00796B' }
    ]);
  }

  // Add info about related reports
  html += `
    <div style="margin: 20px 0; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196F3;">
      <p style="margin: 0 0 8px 0; font-size: 0.9em;"><strong>📊 Other Reports:</strong></p>
      <ul style="margin: 0; padding-left: 20px; font-size: 0.9em;">
        <li><strong>Scouts:</strong> Per-scout sales, inventory, credited booth/direct ship allocations, and cash owed</li>
        <li><strong>Donations:</strong> Cookie Share reconciliation between Digital Cookie and Smart Cookie</li>
        <li><strong>Booths:</strong> Booth reservations, distribution status, and per-scout booth sale allocations</li>
        <li><strong>Available Booths:</strong> Upcoming booth locations with available time slots</li>
        <li><strong>Inventory:</strong> Troop inventory by variety, council pickups (C2T), and scout allocations (T2G)</li>
        <li><strong>Cookies:</strong> Sales breakdown by cookie type with percentages</li>
      </ul>
    </div>
  `;

  html += '</div>';
  return html;
}

export { generateTroopSummaryReport };
