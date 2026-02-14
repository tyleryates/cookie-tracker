import { COOKIE_TYPE, getCookieColor, getCookieDisplayName } from '../../cookie-constants';
import type { CookieType, UnifiedDataset, Varieties } from '../../types';
import { DataTable } from '../components/data-table';
import { getCompleteVarieties, sortVarietiesByOrder } from '../format-utils';

export function VarietyReport({ data }: { data: UnifiedDataset }) {
  if (!data?.varieties) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const varieties = data.varieties;
  const varietyStats = varieties.byCookie;

  // Sum booth sales by variety (exclude virtual booths)
  const boothVarieties: Varieties = {};
  let boothTotal = 0;
  for (const r of data.boothReservations || []) {
    if ((r.booth.reservationType || '').toLowerCase().includes('virtual')) continue;
    for (const [cookie, count] of Object.entries(r.cookies)) {
      if (cookie === COOKIE_TYPE.COOKIE_SHARE) continue;
      const key = cookie as CookieType;
      boothVarieties[key] = (boothVarieties[key] || 0) + (count || 0);
      boothTotal += count || 0;
    }
  }

  const rows = sortVarietiesByOrder(Object.entries(getCompleteVarieties(varietyStats))).filter(
    ([variety]) => variety !== COOKIE_TYPE.COOKIE_SHARE
  );

  const hasBooth = boothTotal > 0;

  return (
    <div class="report-visual">
      <div class="report-header-row">
        <h3>Cookie Popularity Report</h3>
      </div>
      <p class="meta-text">Total: {varieties.total} packages sold</p>
      <DataTable columns={hasBooth ? ['Variety', 'Packages', 'Sales %', 'Booth Sales %'] : ['Variety', 'Packages', 'Sales %']}>
        {rows.map(([variety, count]) => {
          const percent = varieties.total > 0 ? `${((count / varieties.total) * 100).toFixed(1)}%` : '0%';
          const boothCount = boothVarieties[variety as CookieType] || 0;
          const boothPercent = boothTotal > 0 ? `${((boothCount / boothTotal) * 100).toFixed(1)}%` : '0%';
          const color = getCookieColor(variety);
          return (
            <tr key={variety}>
              <td>
                {color && (
                  <span
                    class="inventory-chip-dot"
                    style={{ background: color, display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }}
                  />
                )}
                <strong>{getCookieDisplayName(variety)}</strong>
              </td>
              <td>{count}</td>
              <td>{percent}</td>
              {hasBooth && <td>{boothPercent}</td>}
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
