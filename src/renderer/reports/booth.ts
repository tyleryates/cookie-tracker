import { COOKIE_TYPE } from '../../cookie-constants';
import type { BoothAvailableDate, BoothLocation, BoothReservationImported, BoothTimeSlot, IDataReconciler, Scout } from '../../types';
import {
  buildVarietyTooltipAttr,
  createHorizontalStats,
  createTableHeader,
  endTable,
  escapeHtml,
  formatDate,
  startTable
} from '../html-builder';

// ============================================================================
// BOOTH AVAILABILITY FILTER CONFIG
// TODO: Make this user-configurable via settings UI
// ============================================================================

interface DayFilter {
  /** 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat */
  day: number;
  /** If set, only show time slots starting within this range (24h, e.g. "16:00") */
  timeAfter?: string;
  timeBefore?: string;
  /** If set, exclude time slots starting within this range (24h) */
  excludeAfter?: string;
  excludeBefore?: string;
}

// Day/time display filter: weekends (exclude 6-8pm) + Fridays 4-6pm only
// Booth IDs are configured in constants.ts (BOOTH_IDS) and filtered at scrape time
const BOOTH_DAY_FILTERS: DayFilter[] = [
  { day: 6, excludeAfter: '18:00', excludeBefore: '20:00' }, // Saturday, skip 6-8pm
  { day: 0, excludeAfter: '18:00', excludeBefore: '20:00' }, // Sunday, skip 6-8pm
  { day: 5, timeAfter: '16:00', timeBefore: '18:00' } // Friday 4-6pm
];

/** Parse a time string like "4:00 PM" or "16:00" to minutes since midnight */
function parseTimeToMinutes(time: string): number {
  // Handle 24h format "16:00"
  const match24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return Number(match24[1]) * 60 + Number(match24[2]);
  }
  // Handle 12h format "4:00 PM"
  const match12 = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = Number(match12[1]);
    const minutes = Number(match12[2]);
    const period = match12[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  return -1;
}

/** Check if a time slot overlaps with a time range */
function slotOverlapsRange(slot: BoothTimeSlot, afterStr: string, beforeStr: string): boolean {
  const after = parseTimeToMinutes(afterStr);
  const before = parseTimeToMinutes(beforeStr);
  const start = parseTimeToMinutes(slot.startTime);
  if (after < 0 || before < 0 || start < 0) return true; // Can't parse — show it
  // Show slot if it starts within the range
  return start >= after && start < before;
}

/** Filter available dates based on config day/time filters, excluding past dates */
function filterAvailableDates(dates: BoothAvailableDate[]): BoothAvailableDate[] {
  const filters = BOOTH_DAY_FILTERS;
  // Use YYYYMMDD integer comparison to avoid timezone issues
  const now = new Date();
  const todayInt = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const result: BoothAvailableDate[] = [];

  for (const d of dates) {
    const parts = d.date.split(/[-/]/);
    if (parts.length < 3) continue;
    const dateInt = Number(parts[0]) * 10000 + Number(parts[1]) * 100 + Number(parts[2]);

    // Skip past dates
    if (dateInt < todayInt) continue;

    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayOfWeek = dateObj.getDay();
    const matchingFilter = filters.find((f) => f.day === dayOfWeek);
    if (!matchingFilter) continue;

    let slots = d.timeSlots;

    // Include filter: only slots starting within range
    if (matchingFilter.timeAfter && matchingFilter.timeBefore) {
      slots = slots.filter((s) => slotOverlapsRange(s, matchingFilter.timeAfter!, matchingFilter.timeBefore!));
    }

    // Exclude filter: remove slots starting within excluded range
    if (matchingFilter.excludeAfter && matchingFilter.excludeBefore) {
      slots = slots.filter((s) => !slotOverlapsRange(s, matchingFilter.excludeAfter!, matchingFilter.excludeBefore!));
    }

    if (slots.length > 0) {
      result.push({ date: d.date, timeSlots: slots });
    }
  }

  return result;
}

/** Format a time like "16:00" or "4:00 PM" to friendly "4:00 pm" */
function formatTime12h(time: string): string {
  // Already in 12h format
  const match12 = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    return `${Number(match12[1])}:${match12[2]} ${match12[3].toLowerCase()}`;
  }
  // 24h format
  const match24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    let hours = Number(match24[1]);
    const mins = match24[2];
    const period = hours >= 12 ? 'pm' : 'am';
    if (hours === 0) hours = 12;
    else if (hours > 12) hours -= 12;
    return `${hours}:${mins} ${period}`;
  }
  return time;
}

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

// Helper: Format a date string from YYYY-MM-DD to "Wed 02/12/2026"
function formatBoothDate(dateStr: string): string {
  const parts = dateStr.split(/[-/]/);
  if (parts.length >= 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayName} ${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  return dateStr;
}

// Helper: Build the "Available Booths" section showing booth locations with dates/times
function buildAvailableBoothsSection(boothLocations: BoothLocation[]): string {
  if (boothLocations.length === 0) return '';

  // Only show booths that have filtered results
  const boothsWithDatesPrecheck = boothLocations.filter((loc) => filterAvailableDates(loc.availableDates || []).length > 0);
  if (boothsWithDatesPrecheck.length === 0) return '';

  let html = '<div style="display: flex; align-items: center; gap: 12px; margin-top: 32px;">';
  html += '<h4 style="margin: 0;">Available Booths</h4>';
  html +=
    '<button id="refreshBoothAvailability" style="padding: 4px 12px; font-size: 0.82em; border: 1px solid #90CAF9; background: #e3f2fd; color: #1565C0; border-radius: 6px; cursor: pointer; font-weight: 500;">Refresh Availability</button>';
  html += '</div>';

  boothsWithDatesPrecheck.forEach((loc) => {
    const addrParts = [loc.address.street, loc.address.city, loc.address.state, loc.address.zip].filter(Boolean);
    const addressStr = addrParts.join(', ');

    const typeColor = loc.reservationType === 'LOTTERY' ? '#9C27B0' : loc.reservationType === 'FCFS' ? '#FF9800' : '#666';

    // Booth header card
    html += '<div style="margin: 16px 0; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">';
    html +=
      '<div style="padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">';
    html += `<div><strong style="font-size: 1.05em;">${escapeHtml(loc.storeName || '-')}</strong>`;
    html += `<div style="color: #666; font-size: 0.85em; margin-top: 2px;">${escapeHtml(addressStr || '-')}</div>`;
    if (loc.notes) {
      html += `<div style="color: #888; font-size: 0.82em; margin-top: 2px; font-style: italic;">${escapeHtml(loc.notes)}</div>`;
    }
    html += '</div>';
    html += `<span style="padding: 3px 10px; background: ${typeColor}22; color: ${typeColor}; border-radius: 12px; font-size: 0.82em; font-weight: 600;">${escapeHtml(loc.reservationType || '-')}</span>`;
    html += '</div>';

    // Dates and times (filtered by day/time config, past dates excluded)
    const dates = filterAvailableDates(loc.availableDates || []);
    html += '<div style="padding: 12px 16px;">';

    dates.forEach((d) => {
      html += '<div style="margin-bottom: 10px; padding: 8px 12px; background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0;">';
      html += `<div style="font-weight: 600; color: #1565C0; margin-bottom: 6px;">${formatBoothDate(d.date)}</div>`;

      if (d.timeSlots.length === 0) {
        html += '<span style="color: #999; font-size: 0.85em; font-style: italic;">No time slots available</span>';
      } else {
        html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
        d.timeSlots.forEach((slot) => {
          const friendly =
            slot.startTime && slot.endTime
              ? `${formatTime12h(slot.startTime)} – ${formatTime12h(slot.endTime)}`
              : formatTime12h(slot.startTime) || '-';
          const raw = slot.startTime && slot.endTime ? `${slot.startTime} – ${slot.endTime}` : slot.startTime || '-';
          html += `<span title="${escapeHtml(raw)}" style="padding: 3px 10px; background: #e8f5e9; color: #2E7D32; border-radius: 10px; font-size: 0.82em; border: 1px solid #A5D6A7;">${escapeHtml(friendly)}</span>`;
        });
        html += '</div>';
      }

      html += '</div>';
    });

    html += '</div>';
    html += '</div>'; // close card
  });

  return html;
}

function generateBoothReport(reconciler: IDataReconciler): string {
  if (!reconciler.unified) {
    return '<div class="report-visual"><p>No data available. Please import data first.</p></div>';
  }

  const boothReservations = reconciler.unified.boothReservations || [];
  const scouts = reconciler.unified.scouts;

  let html = '<div class="report-visual"><h3>Booths Report</h3>';

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

  // Calculate total booth sales from scout allocations
  let totalBoothPackages = 0;
  let totalBoothDonations = 0;
  if (scouts) {
    scouts.forEach((scout: Scout) => {
      totalBoothPackages += scout.credited.boothSales.packages || 0;
      totalBoothDonations += scout.credited.boothSales.donations || 0;
    });
  }

  const availableBoothLocations = reconciler.unified.boothLocations || [];
  if (totalReservations === 0 && totalBoothPackages === 0 && totalBoothDonations === 0 && availableBoothLocations.length === 0) {
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
      description: COOKIE_TYPE.COOKIE_SHARE,
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
      const physicalPackages = (r.totalPackages || 0) - donations;

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

  // Available Booths section (from booth locations search API)
  const boothLocations = reconciler.unified.boothLocations || [];
  html += buildAvailableBoothsSection(boothLocations);

  html += '</div>';
  return html;
}

export { generateBoothReport };
