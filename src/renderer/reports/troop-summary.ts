import type { IDataReconciler } from '../../types';
import { createHorizontalStats } from '../html-builder';

const sectionHeader = (text: string) =>
  `<h4 style="margin: 18px 0 4px 0; font-size: 0.85em; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">${text}</h4>`;

function generateTroopSummaryReport(reconciler: IDataReconciler): string {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.troopTotals) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const troopTotals = reconciler.unified.troopTotals;

  let html = '<div class="report-visual"><h3>Troop Summary</h3>';

  // Sales channel breakdown (physical packages, consistent with inventory row)
  const totalSold = troopTotals.boothDividerT2G + troopTotals.girlDelivery + troopTotals.directShip + troopTotals.donations;

  html += sectionHeader('Sales by Channel');
  html += createHorizontalStats([
    { label: 'Booth Sales', value: troopTotals.boothDividerT2G, description: 'Via booth divider', color: '#7B1FA2' },
    { label: 'Girl Delivery', value: troopTotals.girlDelivery, description: 'In-person & online delivery', color: '#1976D2' },
    { label: 'Direct Ship', value: troopTotals.directShip, description: 'Shipped orders', color: '#00838F' },
    { label: 'Donations', value: troopTotals.donations, description: 'Cookie Share', color: '#E91E63' },
    { label: 'Total Sold', value: totalSold, description: 'To customers', color: '#2E7D32' }
  ]);

  // Physical inventory: where are the packages from council?
  // Sold from Stock = physical packages sold to customers from troop inventory (booth + girl delivery)
  const soldFromStock = troopTotals.boothDividerT2G + troopTotals.girlDelivery;

  html += sectionHeader('Inventory');
  const inventoryStats = [
    { label: 'Total Received', value: troopTotals.ordered, description: 'C2T and T2T pickups', color: '#1565C0' },
    { label: 'Sold from Stock', value: soldFromStock, description: 'Physical pkgs sold', color: '#2E7D32' },
    { label: 'Girl Inventory', value: troopTotals.girlInventory, description: 'With girls, unsold', color: '#F57F17' },
    { label: 'Troop Inventory', value: troopTotals.inventory, description: 'Troop on hand', color: '#E65100' }
  ];
  if (troopTotals.pendingPickup > 0) {
    inventoryStats.push({ label: 'Pending Pickup', value: troopTotals.pendingPickup, description: 'Sold, awaiting T2G', color: '#BF360C' });
  }
  html += createHorizontalStats(inventoryStats);

  // Financial stats
  const packagesCredited = troopTotals.packagesCredited;
  const grossProceeds = troopTotals.grossProceeds;
  const financialStats: { label: string; value: string; description: string; color: string }[] = [
    { label: 'Packages Credited', value: `${packagesCredited}`, description: 'Received + direct ship + donations', color: '#1565C0' },
    {
      label: 'Per Girl Average',
      value: `$${troopTotals.scouts.active > 0 ? Math.round(packagesCredited / troopTotals.scouts.active) : 0}`,
      description: `${troopTotals.scouts.active} girls participating`,
      color: '#6A1B9A'
    },
    {
      label: 'Gross Proceeds',
      value: `$${Math.round(grossProceeds)}`,
      description: `$${troopTotals.proceedsRate.toFixed(2)}/pkg owed to troop`,
      color: '#EF6C00'
    }
  ];
  if (troopTotals.proceedsDeduction > 0) {
    financialStats.push({
      label: 'First-50 Deduction',
      value: `-$${Math.round(troopTotals.proceedsDeduction)}`,
      description: `${troopTotals.proceedsExemptPackages} pkg × $${troopTotals.proceedsRate.toFixed(2)}`,
      color: '#f44336'
    });
  }
  financialStats.push({
    label: 'Troop Proceeds',
    value: `$${Math.round(troopTotals.troopProceeds)}`,
    description: 'After first-50 deduction',
    color: '#2E7D32'
  });
  html += sectionHeader('Finances');
  html += createHorizontalStats(financialStats);

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
