import { COOKIE_TYPE, getCookieDisplayName } from '../../cookie-constants';
import { sumPhysicalPackages } from '../../data-processing/utils';
import type { BoothReservationImported, IDataReconciler, Scout } from '../../types';
import {
  buildVarietyTooltipAttr,
  createHorizontalStats,
  createTableHeader,
  endTable,
  escapeHtml,
  formatDate,
  startTable
} from '../html-builder';

// Helper: Build scout allocations detail section for a booth
function buildBoothScoutAllocations(booth: BoothReservationImported, scouts: Map<string, Scout>): string {
  if (!scouts) return '';

  // Find all scouts with allocations matching this booth (by store + date)
  const scoutsForBooth = [];
  scouts.forEach((scout: Scout, name: string) => {
    if (scout.isSiteOrder) return;
    const allocations = scout.credited.boothSales.allocations || [];

    // Find allocations matching this booth
    const matchingAllocations = allocations.filter((a) => {
      const storeMatch = (a.storeName || '').toLowerCase() === (booth.booth.storeName || '').toLowerCase();
      const dateMatch = a.date === booth.timeslot.date;
      return storeMatch && dateMatch;
    });

    if (matchingAllocations.length > 0) {
      const totalPackages = matchingAllocations.reduce((sum: number, a) => sum + (a.packages || 0), 0);
      const totalDonations = matchingAllocations.reduce((sum: number, a) => sum + (a.donations || 0), 0);
      scoutsForBooth.push({ name, packages: totalPackages, donations: totalDonations });
    }
  });

  if (scoutsForBooth.length === 0) {
    return '<tr class="detail-row" style="display: none;"><td colspan="7"><div style="padding: 12px; background: #f5f5f5; border-radius: 4px; color: #999; font-style: italic;">No scout allocations for this booth yet. Distribute in Smart Cookie to see per-scout breakdown.</div></td></tr>';
  }

  // Sort by name
  scoutsForBooth.sort((a, b) => a.name.localeCompare(b.name));

  let html = '<tr class="detail-row" style="display: none;">';
  html += '<td colspan="7" style="padding: 0;">';
  html += '<div style="background: #f9f9f9; padding: 12px; border-top: 1px solid #e0e0e0;">';
  html += '<h6 style="margin: 0 0 8px 0; color: #666;">Scout Allocations</h6>';
  html += startTable('table-compact');
  html += createTableHeader(['Scout', 'Packages', 'Donations']);

  scoutsForBooth.forEach(({ name, packages, donations }) => {
    html += '<tr>';
    html += `<td><strong>${escapeHtml(name)}</strong></td>`;
    html += `<td>${packages}</td>`;
    html += `<td>${donations > 0 ? donations : '—'}</td>`;
    html += '</tr>';
  });

  html += endTable();
  html += '</div></td></tr>';
  return html;
}

function generateBoothReport(reconciler: IDataReconciler): string {
  if (!reconciler.unified) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const boothReservations = reconciler.unified.boothReservations || [];
  const scouts = reconciler.unified.scouts;

  let html = '<div class="report-visual"><h3>Booth Reservations & Sales</h3>';

  // Filter out Virtual Delivery reservations (handled by Virtual Booth Divider)
  const nonVirtualReservations = boothReservations.filter((r: BoothReservationImported) => {
    const type = (r.booth.reservationType || '').toLowerCase();
    return !type.includes('virtual');
  });

  // Calculate stats
  const totalReservations = nonVirtualReservations.length;
  const distributed = nonVirtualReservations.filter((r: BoothReservationImported) => r.booth.isDistributed).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pastNotDistributed = nonVirtualReservations.filter((r: BoothReservationImported) => {
    if (r.booth.isDistributed) return false;
    const d = r.timeslot.date ? new Date(r.timeslot.date) : null;
    return !d || d < today;
  }).length;

  // Pre-computed booth sales totals from troop totals
  const totalBoothPackages = reconciler.unified.troopTotals.boothSalesPackages;
  const totalBoothDonations = reconciler.unified.troopTotals.boothSalesDonations;

  if (totalReservations === 0 && totalBoothPackages === 0 && totalBoothDonations === 0) {
    html +=
      '<p style="color: #999; font-style: italic;">No booth reservation or allocation data available. Booth data is fetched from the Smart Cookie reservations API during sync.</p>';
    html += '</div>';
    return html;
  }

  // Stats row
  const stats = [
    { label: 'Reservations', value: totalReservations, description: 'Total booth slots', color: '#2196F3' },
    { label: 'Distributed', value: distributed, description: 'Allocations complete', color: '#4CAF50' },
    {
      label: 'Needs Distribution',
      value: pastNotDistributed,
      description: 'Past booths pending',
      color: pastNotDistributed > 0 ? '#ff9800' : '#999'
    },
    { label: 'Booth Packages', value: totalBoothPackages, description: 'Physical cookies', color: '#9C27B0' },
    {
      label: 'Booth Donations',
      value: totalBoothDonations,
      description: getCookieDisplayName(COOKIE_TYPE.COOKIE_SHARE),
      color: totalBoothDonations > 0 ? '#7B1FA2' : '#999'
    }
  ];
  html += createHorizontalStats(stats);

  // Reservations table (expandable)
  if (nonVirtualReservations.length > 0) {
    html += '<h4 style="margin-top: 24px;">Booth Reservations</h4>';
    html += '<p class="table-hint">💡 Click on any booth to see scout allocations for that booth.</p>';

    // Sort by date
    const sorted = [...nonVirtualReservations].sort((a, b) => {
      const dateA = a.timeslot.date || '';
      const dateB = b.timeslot.date || '';
      return dateA.localeCompare(dateB);
    });

    html += startTable('table-normal booth-table');
    html += createTableHeader(['Store', 'Date', 'Time', 'Type', 'Packages', 'Donations', 'Status']);

    sorted.forEach((r, idx) => {
      const timeDisplay =
        r.timeslot.startTime && r.timeslot.endTime ? `${r.timeslot.startTime} - ${r.timeslot.endTime}` : r.timeslot.startTime || '-';

      // Future booths that aren't distributed yet are expected, not warnings
      const boothDate = r.timeslot.date ? new Date(r.timeslot.date) : null;
      const isFuture = boothDate && boothDate >= today;

      let statusText: string, statusStyle: string;
      if (r.booth.isDistributed) {
        statusText = 'Distributed';
        statusStyle = 'color: #4CAF50; font-weight: 600;';
      } else if (isFuture) {
        statusText = 'Upcoming';
        statusStyle = 'color: #999; font-weight: 600;';
      } else {
        statusText = 'Not Distributed';
        statusStyle = 'color: #ff9800; font-weight: 600;';
      }

      // Split packages vs donations
      const donations = r.cookies?.[COOKIE_TYPE.COOKIE_SHARE] || 0;
      const physicalPackages = sumPhysicalPackages(r.cookies);

      // Build tooltip for physical packages only (exclude Cookie Share)
      const physicalCookies = { ...r.cookies };
      delete physicalCookies[COOKIE_TYPE.COOKIE_SHARE];
      const tooltipAttr = buildVarietyTooltipAttr(physicalCookies);

      // Main booth row (clickable)
      html += `<tr class="booth-row" data-booth-index="${idx}">`;
      html += `<td><span class="expand-icon" style="margin-right: 8px;">▶</span>${escapeHtml(r.booth.storeName || '-')}</td>`;
      html += `<td>${escapeHtml(formatDate(r.timeslot.date))}</td>`;
      html += `<td>${escapeHtml(timeDisplay)}</td>`;
      html += `<td>${escapeHtml(r.booth.reservationType || '-')}</td>`;
      html += `<td class="tooltip-cell"${tooltipAttr}>${physicalPackages}</td>`;
      html += `<td>${donations > 0 ? donations : '—'}</td>`;
      html += `<td style="${statusStyle}">${statusText}</td>`;
      html += '</tr>';

      // Detail row with scout allocations (hidden by default)
      html += buildBoothScoutAllocations(r, scouts);
    });

    html += endTable();
  }

  html += '</div>';
  return html;
}

export { generateBoothReport };
