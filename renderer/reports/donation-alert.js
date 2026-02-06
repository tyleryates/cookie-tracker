const {
  createHorizontalStats,
  escapeHtml,
  startTable,
  createTableHeader,
  createTableRow,
  endTable
} = require('../html-builder.js');

function generateDonationAlertReport(reconciler) {
  // Use pre-processed unified dataset
  if (!reconciler.unified || !reconciler.unified.cookieShare) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const cookieShare = reconciler.unified.cookieShare;

  let html = '<div class="report-visual"><h3>Virtual Cookie Share</h3>';

  const totalDCDonations = cookieShare.digitalCookie.total;
  const autoSyncDonations = cookieShare.digitalCookie.autoSync;
  const manualEntryDonations = cookieShare.digitalCookie.manualEntry;
  const totalSCCookieShare = cookieShare.smartCookie.total;
  const manualCookieShareEntries = cookieShare.smartCookie.manualEntries;

  // Calculate adjustment needed: what needs manual entry - what's already entered
  const adjustmentNeeded = manualEntryDonations - manualCookieShareEntries;

  // Reconciliation section at the top
  html += '<h4 style="margin-top: 20px;">📊 Cookie Share Reconciliation</h4>';

  // Determine adjustment display
  let adjustmentDisplay = '';
  let adjustmentColor = '#4CAF50'; // Green for reconciled
  if (adjustmentNeeded > 0) {
    adjustmentDisplay = `+${adjustmentNeeded}`;
    adjustmentColor = '#ff9800'; // Orange for needs more entries
  } else if (adjustmentNeeded < 0) {
    adjustmentDisplay = `${adjustmentNeeded}`;
    adjustmentColor = '#f44336'; // Red for too many entries
  } else {
    adjustmentDisplay = '—';
    adjustmentColor = '#4CAF50'; // Green for reconciled
  }

  html += createHorizontalStats([
    { label: 'DC Total', value: totalDCDonations, description: 'All donations', color: '#2196F3' },
    { label: 'DC Auto-Sync', value: autoSyncDonations, description: 'Credit card', color: '#4CAF50' },
    { label: 'DC Manual Entry', value: manualEntryDonations, description: 'CASH + girl delivery', color: '#ff9800' },
    { label: 'SC Manual Entries', value: manualCookieShareEntries, description: 'COOKIE_SHARE transfers', color: '#9C27B0' },
    { label: 'Adjustment', value: adjustmentDisplay, description: 'Packages to add/remove', color: adjustmentColor }
  ]);

  // Check if manual entries are reconciled
  if (adjustmentNeeded === 0) {
    html += '<div style="padding: 15px; background: #C8E6C9; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2E7D32;">';
    html += '<p style="margin: 0; color: #2E7D32; font-weight: 600;">✓ Manual Entries Reconciled!</p>';
    html += '<p style="margin: 8px 0 0 0; color: #2E7D32; font-size: 0.9em;">All manual Cookie Share donations have been entered in Smart Cookie.</p>';
    html += '</div>';
  } else if (adjustmentNeeded > 0) {
    html += '<div style="padding: 15px; background: #FFE0B2; border-radius: 8px; margin: 15px 0; border-left: 4px solid #F57F17;">';
    html += '<p style="margin: 0; color: #E65100; font-weight: 600;">⚠️ Manual Entry Needed</p>';
    html += `<p style="margin: 8px 0 0 0; color: #E65100; font-size: 0.9em;">You need to add <strong>${adjustmentNeeded}</strong> more Cookie Share packages in Smart Cookie (Orders → Virtual Cookie Share).</p>`;
    html += '</div>';
  } else {
    html += '<div style="padding: 15px; background: #FFCDD2; border-radius: 8px; margin: 15px 0; border-left: 4px solid #C62828;">';
    html += '<p style="margin: 0; color: #C62828; font-weight: 600;">⚠️ Too Many Manual Entries</p>';
    html += `<p style="margin: 8px 0 0 0; color: #C62828; font-size: 0.9em;">Smart Cookie has <strong>${Math.abs(adjustmentNeeded)}</strong> more Cookie Share packages than Digital Cookie. You may need to remove some manual entries.</p>`;
    html += '</div>';
  }

  // Build per-scout manual entry breakdown from unified dataset ($ = calculated)
  const scoutManualEntries = {};
  const scouts = reconciler.unified.scouts;

  scouts.forEach((scout, scoutName) => {
    if (scout.$cookieShare.dcTotal > 0) {
      scoutManualEntries[scoutName] = {
        total: scout.$cookieShare.dcTotal,
        autoSync: scout.$cookieShare.dcAutoSync,
        manualEntered: 0  // Will be filled from SC data below
      };
    }
  });

  // Add Virtual Cookie Share allocations (manual entries already made) per scout
  // Use the detailed per-scout breakdown from Smart Cookie API
  if (reconciler && reconciler.virtualCookieShareAllocations) {
    // Build girlId to scout name mapping
    const girlIdToName = new Map();
    scouts.forEach((scout, scoutName) => {
      if (scout.girlId) {
        girlIdToName.set(scout.girlId, scoutName);
      }
    });

    reconciler.virtualCookieShareAllocations.forEach((quantity, girlId) => {
      const scoutName = girlIdToName.get(girlId);
      if (!scoutName) return; // Guard clause: skip if no scout name

      if (!scoutManualEntries[scoutName]) {
        scoutManualEntries[scoutName] = {
          total: 0,
          autoSync: 0,
          manualEntered: 0
        };
      }
      scoutManualEntries[scoutName].manualEntered += quantity;
    });
  }

  // Scout-by-scout manual entry breakdown
  // Filter out scouts with 0 DC Total before displaying
  const scoutsToDisplay = Object.keys(scoutManualEntries).filter(name => scoutManualEntries[name].total > 0);

  if (scoutsToDisplay.length > 0) {
    html += '<h5 style="margin-top: 20px;">📋 Virtual Cookie Share Manual Entry Guide:</h5>';
    html += '<p style="margin-bottom: 10px; font-size: 0.9em; color: #666;">Use this table to adjust Virtual Cookie Share in Smart Cookie (Orders → Virtual Cookie Share).</p>';
    html += startTable('table-normal');
    html += createTableHeader(['Scout', 'DC Total', 'Auto-Sync', 'SC Entered', 'Manual Needed', 'Adjustment']);

    scoutsToDisplay.sort().forEach(scoutName => {
      const scout = scoutManualEntries[scoutName];
      const manualNeeded = scout.total - scout.autoSync;
      const adjustment = manualNeeded - scout.manualEntered;

      // Color code the row based on adjustment needed
      let rowClass = '';
      let adjustmentDisplay = adjustment;
      let adjustmentStyle = '';

      if (adjustment > 0) {
        // Need to add more
        rowClass = 'style="background: #fff3cd;"';
        adjustmentDisplay = `+${adjustment}`;
        adjustmentStyle = 'style="color: #ff9800; font-weight: 600;"';
      } else if (adjustment < 0) {
        // Too many entries
        rowClass = 'style="background: #ffcdd2;"';
        adjustmentDisplay = `${adjustment}`;
        adjustmentStyle = 'style="color: #f44336; font-weight: 600;"';
      } else {
        // Reconciled
        adjustmentDisplay = '—';
        adjustmentStyle = 'style="color: #4CAF50; font-weight: 600;"';
      }

      html += createTableRow([
        `<td><strong>${escapeHtml(scoutName)}</strong></td>`,
        `<td>${scout.total}</td>`,
        `<td>${scout.autoSync}</td>`,
        `<td>${scout.manualEntered}</td>`,
        `<td>${manualNeeded}</td>`,
        `<td ${adjustmentStyle}><strong>${adjustmentDisplay}</strong></td>`
      ], rowClass);
    });

    html += endTable();

    html += '<div style="margin-top: 15px; padding: 12px; background: #e3f2fd; border-radius: 8px; font-size: 0.9em;">';
    html += '<p style="margin: 0 0 8px 0;"><strong>💡 How to use this table:</strong></p>';
    html += '<ol style="margin: 0; padding-left: 20px;">';
    html += '<li>Log in to Smart Cookie and go to <strong>Orders → Virtual Cookie Share</strong></li>';
    html += '<li>Edit the COOKIE_SHARE row for each scout based on the "Adjustment" column:</li>';
    html += '<ul style="margin: 5px 0; padding-left: 20px;">';
    html += '<li><strong>+N</strong> (orange): Add N packages to that scout\'s COOKIE_SHARE row</li>';
    html += '<li><strong>-N</strong> (red): Remove N packages from that scout\'s COOKIE_SHARE row</li>';
    html += '<li><strong>—</strong> (green): Already reconciled, no changes needed</li>';
    html += '</ul>';
    html += '<li>Click Save after adjusting each scout\'s packages</li>';
    html += '<li>Refresh this report to verify all adjustments show —</li>';
    html += '</ol>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

module.exports = { generateDonationAlertReport };
