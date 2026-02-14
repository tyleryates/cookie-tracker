import { ORDER_TYPE, OWNER, TRANSFER_TYPE } from '../../constants';
import type { UnifiedDataset } from '../../types';
import type { Stat } from '../components/stat-cards';
import { StatCards } from '../components/stat-cards';

/** Sub-cards rendered inside a drill-down panel */
function DetailCards({ items }: { items: Array<{ label: string; value: string | number; description: string; color?: string }> }) {
  return (
    <div class="detail-cards">
      {items.map((item, i) => (
        <div key={i} class="detail-card">
          <div class="detail-card-label">{item.label}</div>
          <div class="detail-card-value" style={{ color: item.color || 'var(--gray-800)' }}>
            {item.value}
          </div>
          <div class="detail-card-desc">{item.description}</div>
        </div>
      ))}
    </div>
  );
}

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
  const troopDonations = troopTotals.donations - girlDonations;

  const totalSold = troopSales + girlDelivery + totalShipped + troopTotals.donations;
  const soldFromStock = troopTotals.boothDividerT2G + troopTotals.girlDelivery;
  const packagesCredited = troopTotals.packagesCredited;
  const grossProceeds = troopTotals.grossProceeds;

  const c2tTransfers = data.transferBreakdowns?.c2t || [];
  const t2tInTotal = c2tTransfers.filter((t) => t.type === TRANSFER_TYPE.T2T).reduce((sum, t) => sum + (t.physicalPackages || 0), 0);
  const pureC2T = troopTotals.c2tReceived - t2tInTotal;

  const stats: Stat[] = [
    {
      label: 'Total Sales',
      value: totalSold,
      description: 'All channels combined',
      color: '#2E7D32',
      detail: (
        <DetailCards
          items={[
            {
              label: 'Troop Package Sales',
              value: troopSales,
              description: `${troopTotals.boothDividerT2G} booth + ${troopTotals.virtualBoothT2G} site`,
              color: '#7B1FA2'
            },
            {
              label: 'Girl Package Sales',
              value: girlDelivery,
              description: `${dcDelivery} DC delivery + ${inPerson} in person`,
              color: '#00838F'
            },
            {
              label: 'Direct Ship',
              value: totalShipped,
              description: `${troopShipped} troop + ${girlShipped} girl`,
              color: '#37474F'
            },
            {
              label: 'Donations',
              value: troopTotals.donations,
              description: `${troopDonations} troop + ${girlDonations} girl`,
              color: '#E91E63'
            }
          ]}
        />
      )
    },
    {
      label: 'Troop Proceeds',
      value: `$${Math.round(troopTotals.troopProceeds)}`,
      description: `$${troopTotals.proceedsRate.toFixed(2)}/pkg`,
      color: '#2E7D32',
      detail: (
        <DetailCards
          items={[
            {
              label: 'Packages Credited',
              value: packagesCredited,
              description: `${troopTotals.c2tReceived - troopTotals.t2tOut} pkg + ${troopTotals.donations} donations + ${totalShipped} shipped`,
              color: '#1565C0'
            },
            {
              label: 'Per Girl Average',
              value: `$${troopTotals.scouts.active > 0 ? Math.round(packagesCredited / troopTotals.scouts.active) : 0}`,
              description: `${packagesCredited} pkg / ${troopTotals.scouts.active} girls`,
              color: '#00838F'
            },
            {
              label: 'Gross Proceeds',
              value: `$${Math.round(grossProceeds)}`,
              description: `${packagesCredited} pkg \u00D7 $${troopTotals.proceedsRate.toFixed(2)}`,
              color: '#EF6C00'
            },
            ...(troopTotals.proceedsDeduction > 0
              ? [
                  {
                    label: 'First-50 Deduction',
                    value: `-$${Math.round(troopTotals.proceedsDeduction)}`,
                    description: `${troopTotals.proceedsExemptPackages} pkg \u00D7 $${troopTotals.proceedsRate.toFixed(2)}`,
                    color: '#f44336'
                  }
                ]
              : [])
          ]}
        />
      )
    },
    {
      label: 'Troop Inventory',
      value: troopTotals.inventory,
      description: 'Packages on hand',
      color: '#E65100',
      detail: (() => {
        const totalPackages = troopTotals.c2tReceived - troopTotals.t2tOut;
        const pkgParts = [`${pureC2T} C2T`];
        if (t2tInTotal > 0) pkgParts.push(`+ ${t2tInTotal} T2T in`);
        if (troopTotals.t2tOut > 0) pkgParts.push(`\u2212 ${troopTotals.t2tOut} T2T out`);
        return (
          <DetailCards
            items={[
              { label: 'Total Packages', value: totalPackages, description: pkgParts.join(' '), color: '#1565C0' },
              {
                label: 'Sold from Stock',
                value: soldFromStock,
                description: `${troopSales} troop + ${girlDelivery} girl`,
                color: '#2E7D32'
              },
              { label: 'Girl Inventory', value: troopTotals.girlInventory, description: 'With girls', color: '#F57F17' }
            ]}
          />
        );
      })()
    }
  ];

  return (
    <div class="report-visual">
      <h4 class="report-section-header">Overview</h4>
      <StatCards stats={stats} defaultExpanded={0} />
    </div>
  );
}
