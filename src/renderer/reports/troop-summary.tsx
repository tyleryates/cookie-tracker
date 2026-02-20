import type { ComponentChildren } from 'preact';
import type { UnifiedDataset } from '../../types';
import { STAT_COLORS, type Stat, StatCards } from '../components/stat-cards';

export function TroopProceedsReport({ data, banner }: { data: UnifiedDataset; banner?: ComponentChildren }) {
  if (!data?.troopTotals) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const troopTotals = data.troopTotals;
  const packagesCredited = troopTotals.packagesCredited;
  const grossProceeds = troopTotals.grossProceeds;

  // Sum shipped from scout orders (not troopTotals.directShip, which comes from transfer
  // breakdowns and may differ from order-based totals when SC/DC data is incomplete)
  let totalShipped = 0;
  for (const scout of Object.values(data.scouts || {})) {
    totalShipped += scout.totals.shipped || 0;
  }

  const stats: Stat[] = [
    {
      label: 'Packages Credited',
      value: packagesCredited,
      description: `${troopTotals.c2tReceived - troopTotals.t2tOut} pkg + ${troopTotals.donations} donations + ${totalShipped} shipped`,
      color: STAT_COLORS.BLUE
    },
    {
      label: 'Credit Tier',
      value: `$${troopTotals.proceedsRate.toFixed(2)}`,
      description: `${troopTotals.scouts.active > 0 ? Math.round(packagesCredited / troopTotals.scouts.active) : 0} PGA (${troopTotals.scouts.active} girls)`,
      color: STAT_COLORS.TEAL,
      operator: '\u00D7'
    },
    {
      label: 'Gross Proceeds',
      value: `$${Math.round(grossProceeds)}`,
      description: `${packagesCredited} pkg \u00D7 $${troopTotals.proceedsRate.toFixed(2)}`,
      color: STAT_COLORS.AMBER,
      operator: '='
    },
    ...(troopTotals.proceedsDeduction > 0
      ? [
          {
            label: 'First-50 Deduction',
            value: `$${Math.round(troopTotals.proceedsDeduction)}`,
            description: `${troopTotals.proceedsExemptPackages} pkg \u00D7 $${troopTotals.proceedsRate.toFixed(2)}`,
            color: STAT_COLORS.RED,
            operator: '\u2212'
          }
        ]
      : []),
    {
      label: 'Troop Proceeds',
      value: `$${Math.round(troopTotals.troopProceeds)}`,
      description: 'Net troop earnings',
      color: STAT_COLORS.GREEN,
      operator: '=',
      highlight: true
    }
  ];

  return (
    <div class="report-visual">
      <h3>Troop Proceeds</h3>
      {banner}
      <StatCards stats={stats} />
    </div>
  );
}
