const {
  sortVarietiesByOrder,
  getCompleteVarieties,
  escapeHtml,
  startTable,
  createTableHeader,
  createTableRow,
  endTable
} = require('../html-builder.js');

function generateVarietyReport(reconciler) {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.varieties) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const varieties = reconciler.unified.varieties;
  const varietyStats = varieties.byCookie;
  const totalPhysicalPackages = varieties.totalPhysical;
  const totalPackages = varieties.totalAll;

  let html = '<div class="report-visual"><h3>Cookie Variety Report</h3>';
  html += `<p style="margin-bottom: 15px;">Total: ${totalPackages} packages (${totalPhysicalPackages} physical cookies + ${varietyStats['Cookie Share']} Cookie Share)</p>`;
  html += startTable('table-normal');
  html += createTableHeader(['Variety', 'Packages', '% of Physical Sales']);

  sortVarietiesByOrder(Object.entries(getCompleteVarieties(varietyStats)))
    .forEach(([variety, count]) => {
      // Calculate percentage based on physical cookies only (exclude Cookie Share from denominator)
      const percent = variety === 'Cookie Share'
        ? '—'  // Don't show percentage for Cookie Share
        : totalPhysicalPackages > 0 ? ((count / totalPhysicalPackages) * 100).toFixed(1) + '%' : '0%';

      html += createTableRow([
        `<td><strong>${escapeHtml(variety)}</strong></td>`,
        `<td>${count}</td>`,
        `<td>${percent}</td>`
      ]);
    });

  html += endTable() + '</div>';
  return html;
}

module.exports = { generateVarietyReport };
