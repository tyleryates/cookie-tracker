import { COOKIE_TYPE, getCookieColor, getCookieDisplayName } from '../../cookie-constants';
import type { UnifiedDataset } from '../../types';
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

  const rows = sortVarietiesByOrder(Object.entries(getCompleteVarieties(varietyStats))).filter(
    ([variety]) => variety !== COOKIE_TYPE.COOKIE_SHARE
  );

  return (
    <div class="report-visual">
      <h3>Cookie Popularity Report</h3>
      <p class="meta-text">Total: {varieties.total} packages sold</p>
      <DataTable columns={['Variety', 'Packages', '% of Sales']}>
        {rows.map(([variety, count]) => {
          const percent = varieties.total > 0 ? `${((count / varieties.total) * 100).toFixed(1)}%` : '0%';
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
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
