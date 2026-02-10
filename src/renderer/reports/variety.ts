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
  const totalPhysicalPackages = varieties.totalPhysical;
  const totalPackages = varieties.totalAll;

  let html = '<div class="report-visual"><h3>Cookie Popularity Report</h3>';
  html += `<p style="margin-bottom: 15px;">Total: ${totalPackages} packages (${totalPhysicalPackages} physical cookies + ${varietyStats[COOKIE_TYPE.COOKIE_SHARE]} Cookie Share)</p>`;
  html += startTable('table-normal');
  html += createTableHeader(['Variety', 'Packages', '% of Physical Sales']);

  sortVarietiesByOrder(Object.entries(getCompleteVarieties(varietyStats))).forEach(([variety, count]) => {
    // Calculate percentage based on physical cookies only (exclude Cookie Share from denominator)
    const percent =
      variety === COOKIE_TYPE.COOKIE_SHARE
        ? '—' // Don't show percentage for Cookie Share
        : totalPhysicalPackages > 0
          ? `${((count / totalPhysicalPackages) * 100).toFixed(1)}%`
          : '0%';

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
