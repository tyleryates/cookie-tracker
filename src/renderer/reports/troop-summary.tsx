import type { UnifiedDataset } from '../../types';
import { StatCards } from '../components/stat-cards';

export function TroopSummaryReport({ data }: { data: UnifiedDataset }) {
  if (!data?.troopTotals) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const troopTotals = data.troopTotals;
  const totalSold = troopTotals.boothDividerT2G + troopTotals.girlDelivery + troopTotals.directShip + troopTotals.donations;
  const soldFromStock = troopTotals.boothDividerT2G + troopTotals.girlDelivery;
  const packagesCredited = troopTotals.packagesCredited;
  const grossProceeds = troopTotals.grossProceeds;

  const inventoryStats: Array<{ label: string; value: string | number; description: string; color: string }> = [
    { label: 'Total Received', value: troopTotals.ordered, description: 'C2T and T2T pickups', color: '#1565C0' },
    { label: 'Sold from Stock', value: soldFromStock, description: 'Physical pkgs sold', color: '#2E7D32' },
    { label: 'Girl Inventory', value: troopTotals.girlInventory, description: 'With girls, unsold', color: '#F57F17' },
    { label: 'Troop Inventory', value: troopTotals.inventory, description: 'Troop on hand', color: '#E65100' }
  ];
  if (troopTotals.pendingPickup > 0) {
    inventoryStats.push({ label: 'Pending Pickup', value: troopTotals.pendingPickup, description: 'Sold, awaiting T2G', color: '#BF360C' });
  }

  const financialStats: Array<{ label: string; value: string; description: string; color: string }> = [
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

  return (
    <div class="report-visual">
      <h3>Troop Summary</h3>

      <h4 class="report-section-header">"Sales by Channel</h4>
      <StatCards
        stats={[
          { label: 'Booth Sales', value: troopTotals.boothDividerT2G, description: 'Via booth divider', color: '#7B1FA2' },
          { label: 'Girl Delivery', value: troopTotals.girlDelivery, description: 'In-person & online delivery', color: '#1976D2' },
          { label: 'Direct Ship', value: troopTotals.directShip, description: 'Shipped orders', color: '#00838F' },
          { label: 'Donations', value: troopTotals.donations, description: 'Cookie Share', color: '#E91E63' },
          { label: 'Total Sold', value: totalSold, description: 'To customers', color: '#2E7D32' }
        ]}
      />

      <h4 class="report-section-header">"Inventory</h4>
      <StatCards stats={inventoryStats} />

      <h4 class="report-section-header">"Finances</h4>
      <StatCards stats={financialStats} />

      <div class="info-box info-box-info">
        <p class="meta-text">
          <strong>Other Reports:</strong>
        </p>
        <ul class="info-box-list">
          <li>
            <strong>Scouts:</strong> Per-scout sales, inventory, credited booth/direct ship allocations, and cash owed
          </li>
          <li>
            <strong>Donations:</strong> Cookie Share reconciliation between Digital Cookie and Smart Cookie
          </li>
          <li>
            <strong>Booths:</strong> Booth reservations, distribution status, and per-scout booth sale allocations
          </li>
          <li>
            <strong>Available Booths:</strong> Upcoming booth locations with available time slots
          </li>
          <li>
            <strong>Inventory:</strong> Troop inventory by variety, council pickups (C2T), and scout allocations (T2G)
          </li>
          <li>
            <strong>Cookies:</strong> Sales breakdown by cookie type with percentages
          </li>
        </ul>
      </div>
    </div>
  );
}
