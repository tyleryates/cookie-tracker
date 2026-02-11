import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import type { IDataReconciler } from '../../types';
import {
  createTableHeader,
  createTableRow,
  endTable,
  escapeHtml,
  getCompleteVarieties,
  sortVarietiesByOrder,
  startTable
} from '../html-builder';

function generateVarietyReport(reconciler: IDataReconciler): string {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.varieties) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const varieties = reconciler.unified.varieties;
  const varietyStats = varieties.byCookie;

  let html = '<div class="report-visual"><h3>Cookie Popularity Report</h3>';
  html += `<p style="margin-bottom: 15px;">Total: ${varieties.total} packages sold</p>`;
  html += startTable('table-normal');
  html += createTableHeader(['Variety', 'Packages', '% of Physical Sales']);

  sortVarietiesByOrder(Object.entries(getCompleteVarieties(varietyStats)))
    .filter(([variety]) => variety !== COOKIE_TYPE.COOKIE_SHARE)
    .forEach(([variety, count]) => {
      const percent = varieties.total > 0 ? `${((count / varieties.total) * 100).toFixed(1)}%` : '0%';

      html += createTableRow([
        `<td><strong>${escapeHtml(getCookieDisplayName(variety))}</strong></td>`,
        `<td>${count}</td>`,
        `<td>${percent}</td>`
      ]);
    });

  html += `${endTable()}</div>`;
  return html;
}

export { generateVarietyReport };
