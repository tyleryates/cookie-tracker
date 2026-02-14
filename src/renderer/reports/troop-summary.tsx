import { ORDER_TYPE, OWNER, TRANSFER_TYPE } from '../../constants';
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
  const troopSales = troopTotals.boothDividerT2G + troopTotals.virtualBoothT2G;
  const girlDelivery = troopTotals.girlDelivery - troopTotals.virtualBoothT2G;

  let troopShipped = 0;
  let girlShipped = 0;
  let dcDelivery = 0;
  let inPerson = 0;
  let girlDonations = 0;
  for (const scout of Object.values(data.scouts)) {
    if (scout.isSiteOrder) {
      troopShipped += scout.totals.shipped || 0;
    } else {
      girlShipped += scout.totals.shipped || 0;
      girlDonations += scout.totals.donations || 0;
      for (const order of scout.orders) {
        if (order.owner !== OWNER.GIRL) continue;
        if (order.orderType === ORDER_TYPE.DELIVERY) dcDelivery += order.physicalPackages;
        else if (order.orderType === ORDER_TYPE.IN_HAND) inPerson += order.physicalPackages;
      }
    }
  }
  const totalShipped = troopShipped + girlShipped;

  const totalSold = troopSales + girlDelivery + totalShipped + troopTotals.donations;
  const soldFromStock = troopTotals.boothDividerT2G + troopTotals.girlDelivery;
  const packagesCredited = troopTotals.packagesCredited;
  const grossProceeds = troopTotals.grossProceeds;

  const c2tTransfers = data.transferBreakdowns?.c2t || [];
  const t2tInTotal = c2tTransfers.filter((t) => t.type === TRANSFER_TYPE.T2T).reduce((sum, t) => sum + (t.physicalPackages || 0), 0);
  const pureC2T = troopTotals.c2tReceived - t2tInTotal;
  const totalPackages = troopTotals.c2tReceived - troopTotals.t2tOut;
  const descParts = [`${pureC2T} C2T`];
  if (t2tInTotal > 0) descParts.push(`+ ${t2tInTotal} T2T In`);
  if (troopTotals.t2tOut > 0) descParts.push(`− ${troopTotals.t2tOut} T2T Out`);
  const packagesDesc = descParts.join(' ');

  const inventoryStats: Array<{ label: string; value: string | number; description: string; color: string }> = [
    { label: 'Total Packages', value: totalPackages, description: packagesDesc, color: '#1565C0' },
    { label: 'Packages Sold', value: soldFromStock, description: `${troopSales} troop + ${girlDelivery} girl`, color: '#2E7D32' }
  ];
  inventoryStats.push(
    { label: 'Troop Inventory', value: troopTotals.inventory, description: 'Troop on hand', color: '#E65100' },
    { label: 'Girl Inventory', value: troopTotals.girlInventory, description: 'With girls, unsold', color: '#F57F17' }
  );

  const financialStats: Array<{ label: string; value: string; description: string; color: string }> = [
    {
      label: 'Packages Credited',
      value: `${packagesCredited}`,
      description: `${totalPackages} received + ${totalShipped} shipped + ${troopTotals.donations} donations`,
      color: '#1565C0'
    },
    {
      label: 'Per Girl Average',
      value: `$${troopTotals.scouts.active > 0 ? Math.round(packagesCredited / troopTotals.scouts.active) : 0}`,
      description: `${troopTotals.scouts.active} girls participating`,
      color: '#00838F'
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
    <div class="report-visual dashboard-layout">
      <div class="dashboard-section">
        <h4 class="report-section-header">Sales by Channel</h4>
        <StatCards
          stats={[
            {
              label: 'Troop Package Sales',
              value: troopSales,
              description: `${troopTotals.boothDividerT2G} booth + ${troopTotals.virtualBoothT2G} site`,
              color: '#7B1FA2'
            },
            { label: 'Girl Package Sales', value: girlDelivery, description: `${dcDelivery} DC + ${inPerson} in person`, color: '#00838F' },
            { label: 'Direct Ship', value: totalShipped, description: `${troopShipped} troop + ${girlShipped} girl`, color: '#37474F' },
            {
              label: 'Donations',
              value: troopTotals.donations,
              description: `${troopTotals.donations - girlDonations} troop + ${girlDonations} girl`,
              color: '#E91E63'
            },
            { label: 'Total Sold', value: totalSold, description: 'All channels', color: '#2E7D32' }
          ]}
        />
      </div>

      <div class="dashboard-section">
        <h4 class="report-section-header">Inventory</h4>
        <StatCards stats={inventoryStats} />
      </div>

      <div class="dashboard-section">
        <h4 class="report-section-header">Finances</h4>
        <StatCards stats={financialStats} />
      </div>
    </div>
  );
}
