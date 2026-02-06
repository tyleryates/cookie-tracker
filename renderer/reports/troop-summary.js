const {
  createHorizontalStats,
  escapeHtml
} = require('../html-builder.js');

function generateTroopSummaryReport(reconciler) {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.troopTotals) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const troopTotals = reconciler.unified.troopTotals;

  let html = '<div class="report-visual"><h3>Troop Summary Report</h3>';

  // Overall stats - high-level troop summary
  html += createHorizontalStats([
    { label: 'Total Orders', value: troopTotals.orders, description: 'From Digital Cookie', color: '#2196F3' },
    { label: 'Packages Sold', value: troopTotals.sold, description: 'From Smart Cookie', color: '#4CAF50' },
    { label: 'Total Revenue', value: `$${Math.round(troopTotals.revenue)}`, description: 'From Smart Cookie', color: '#ff9800' },
    { label: 'Troop Inventory', value: troopTotals.inventory, description: 'Packages on hand', color: '#9C27B0' }
  ]);

  // Add info about related reports
  html += `
    <div style="margin: 20px 0; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196F3;">
      <p style="margin: 0 0 8px 0; font-size: 0.9em;"><strong>📊 Other Reports:</strong></p>
      <ul style="margin: 0; padding-left: 20px; font-size: 0.9em;">
        <li><strong>Scout Summary:</strong> Individual scout performance, order details, and inventory tracking by scout</li>
        <li><strong>Inventory:</strong> Net troop inventory by variety, C2T pickups (cases & packages), and T2G allocations</li>
        <li><strong>Cookie Varieties:</strong> Sales breakdown by cookie type with percentages (excludes Cookie Share from %)</li>
        <li><strong>Virtual Cookie Share:</strong> Cookie Share reconciliation between Digital Cookie and Smart Cookie</li>
      </ul>
    </div>
  `;

  html += '</div>';
  return html;
}

module.exports = { generateTroopSummaryReport };
