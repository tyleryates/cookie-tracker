// Formatting and display utilities

import { BOOTH_RESERVATION_TYPE, TRANSFER_CATEGORY, TRANSFER_TYPE } from '../constants';
import { COOKIE_ORDER, getCookieColor, getCookieDisplayName } from '../cookie-constants';
import type { BoothReservationImported, BoothTimeSlot, CookieType, Scout, Transfer, Varieties } from '../types';

/** Sort varieties entries by preferred display order */
function sortVarietiesByOrder(entries: [string, number][]): [string, number][] {
  return entries.sort((a: [string, number], b: [string, number]) => {
    const indexA = COOKIE_ORDER.indexOf(a[0] as CookieType);
    const indexB = COOKIE_ORDER.indexOf(b[0] as CookieType);

    // If both are in the order list, sort by position
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // If only A is in the list, it comes first
    if (indexA !== -1) return -1;
    // If only B is in the list, it comes first
    if (indexB !== -1) return 1;
    // Neither in list, maintain original order
    return 0;
  });
}

/** Get complete variety list with 0 for missing cookies */
function getCompleteVarieties(varieties: Varieties | undefined): Record<string, number> {
  const complete: Record<string, number> = {};
  const safeVarieties = varieties || {}; // Handle undefined/null varieties
  COOKIE_ORDER.forEach((variety) => {
    complete[variety] = safeVarieties[variety] || 0;
  });
  return complete;
}

// Centralized date formatting utilities
const DateFormatter = {
  // Format date from YYYY/MM/DD to MM/DD/YYYY
  toDisplay(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';
    const str = String(dateStr);
    // Match YYYY/MM/DD or YYYY-MM-DD format
    const match = str.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${month}/${day}/${year}`;
    }
    return str; // Return as-is if format doesn't match
  },

  // Format full timestamp for hover (e.g., "Feb 5, 2026, 3:45 PM")
  toFullTimestamp(date: string | Date | null | undefined): string {
    if (!date) return 'Never synced';

    const then = new Date(date);
    return then.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  },

  // Format friendly relative timestamp with time-of-day (e.g. "Today at 3:45 PM", "2 days ago")
  toRelativeTimestamp(date: string | Date | null | undefined): string {
    if (!date) return 'Never';

    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    // Format time as "3:45 PM"
    const timeStr = then.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Check if same day
    const isToday = then.toDateString() === now.toDateString();

    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = then.toDateString() === yesterday.toDateString();

    const nowDay = new Date(now);
    nowDay.setHours(0, 0, 0, 0);
    const thenDay = new Date(then);
    thenDay.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((nowDay.getTime() - thenDay.getTime()) / 86400000);

    // Recent times (under 1 minute)
    if (diffMins < 1) return 'Just now';

    // Under an hour
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;

    // Today
    if (isToday) return `Today at ${timeStr}`;

    // Yesterday
    if (isYesterday) return `Yesterday at ${timeStr}`;

    // This week (2-6 days ago)
    if (daysDiff < 7) return `${daysDiff} days ago at ${timeStr}`;

    // Older - show full date and time
    const dateStr = then.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
    return `${dateStr} at ${timeStr}`;
  }
};

/** Parse a date string in ISO (YYYY-MM-DD) or US (MM/DD/YYYY) format, returning { year, month, day } */
function parseDateComponents(str: string): { year: number; month: number; day: number } | null {
  const iso = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const us = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (us) return { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) };
  return null;
}

/** Format date as "Sat 02/14" (short day of week + MM/DD, no year) */
function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const str = String(dateStr);
  const parts = parseDateComponents(str);
  if (!parts) return str;
  const d = new Date(parts.year, parts.month - 1, parts.day);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${day} ${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}`;
}

function formatTimeRange(startTime: string | undefined, endTime: string | undefined): string {
  if (startTime && endTime) return `${formatTime12h(startTime)} - ${formatTime12h(endTime)}`;
  return startTime ? formatTime12h(startTime) : '-';
}

function formatCurrency(value: number): string {
  return `$${Math.round(value || 0)}`;
}

/** Build variety tooltip as HTML string with colored dots */
function buildVarietyTooltip(varieties: Varieties): string {
  if (!varieties || Object.keys(varieties).length === 0) return '';
  return sortVarietiesByOrder(Object.entries(varieties))
    .map(([variety, count]) => {
      const color = getCookieColor(variety);
      const dot = color
        ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle"></span>`
        : '';
      return `${dot}${getCookieDisplayName(variety)}: ${count}`;
    })
    .join('\n');
}

/** Parse a time string like "4:00 PM" or "16:00" to minutes since midnight */
function parseTimeToMinutes(time: string): number {
  const match24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return Number(match24[1]) * 60 + Number(match24[2]);
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

function slotOverlapsRange(slot: BoothTimeSlot, afterStr: string, beforeStr: string): boolean {
  const after = parseTimeToMinutes(afterStr);
  const before = parseTimeToMinutes(beforeStr);
  const start = parseTimeToMinutes(slot.startTime);
  if (after < 0 || before < 0 || start < 0) return true;
  return start >= after && start < before;
}

/** Convert a 24h or 12h time string to a friendly 12h format (e.g., "4:00 pm") */
function formatTime12h(time: string): string {
  const match12 = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) return `${Number(match12[1])}:${match12[2]} ${match12[3].toLowerCase()}`;
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

/** Format a YYYY-MM-DD date string as "Mon MM/DD/YYYY" */
function formatBoothDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  if (d) {
    const parts = dateStr.split(/[-/]/);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayName} ${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  return dateStr;
}

/** Count non-virtual booth reservations that need distribution (past, or today after end time) */
function countBoothsNeedingDistribution(boothReservations: BoothReservationImported[]): number {
  const now = new Date();
  const today = todayMidnight();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return boothReservations.filter((r) => {
    const type = (r.booth.reservationType || '').toLowerCase();
    if (type.includes('virtual')) return false;
    if (r.booth.isDistributed) return false;
    if (!r.timeslot.date) return true;
    const d = parseLocalDate(r.timeslot.date);
    if (!d) return true;
    if (d < today) return true; // Past day
    if (d.getTime() === today.getTime()) {
      // Today — only count if booth end time has passed
      const endMin = parseTimeToMinutes(r.timeslot.endTime || '');
      return endMin >= 0 && nowMinutes >= endMin;
    }
    return false; // Future
  }).length;
}

/** Compact time like "4pm" or "10am" — drops :00 minutes, no space */
function formatCompactTime(time: string): { hour: string; period: string } {
  const full = formatTime12h(time); // e.g. "4:00 pm"
  const match = full.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return { hour: full, period: '' };
  const hour = match[2] === '00' ? match[1] : `${match[1]}:${match[2]}`;
  return { hour, period: match[3] };
}

/** Format range like "4-6pm" or "10am-12pm" */
function formatCompactRange(startTime: string, endTime: string): string {
  const start = formatCompactTime(startTime);
  const end = formatCompactTime(endTime);
  if (start.period === end.period) return `${start.hour}-${end.hour}${end.period}`;
  return `${start.hour}${start.period}-${end.hour}${end.period}`;
}

/** Parse a YYYY-MM-DD or YYYY/MM/DD date string to a local Date (midnight) */
function parseLocalDate(dateStr: string): Date | null {
  const parts = dateStr.split(/[-/]/);
  if (parts.length < 3) return null;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/** Haversine distance between two lat/lng points, in miles */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** CSS class for booth reservation type badge */
function boothTypeClass(reservationType: string | undefined): string {
  if (reservationType === BOOTH_RESERVATION_TYPE.LOTTERY) return 'type-lottery';
  if (reservationType === BOOTH_RESERVATION_TYPE.FCFS) return 'type-fcfs';
  return 'type-default';
}

/** Format booth time slot as compact range with fallback */
function formatBoothTime(startTime: string | undefined, endTime: string | undefined): string {
  if (startTime && endTime) return formatCompactRange(startTime, endTime);
  return startTime || '-';
}

/** Format millisecond duration as "123ms" or "1.2s" */
function formatDuration(ms: number | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format byte count as "123 B", "45 KB", or "1.2 MB" */
function formatDataSize(bytes: number | undefined): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human-readable frequency label from milliseconds */
function formatMaxAge(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours === 1) return 'Hourly';
  return `${hours} hours`;
}

/** Check if a booth reservation type is virtual (excluded from most booth reports) */
function isVirtualBooth(reservationType: string | undefined): boolean {
  return (reservationType || '').toLowerCase().includes('virtual');
}

/** Check if a cookie variety is physical (not Cookie Share / donation-only) */
function isPhysicalVariety(variety: string): boolean {
  return variety !== 'COOKIE_SHARE';
}

/** Get today's date at local midnight */
function todayMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Remove expired slot keys (boothId|YYYY-MM-DD|startTime) whose date is before today */
function pruneExpiredSlots(slots: string[]): string[] {
  const now = new Date();
  const todayInt = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return slots.filter((key) => {
    const parts = key.split('|');
    if (parts.length < 2) return false;
    const d = parts[1].split(/[-/]/);
    if (d.length < 3) return false;
    return Number(d[0]) * 10000 + Number(d[1]) * 100 + Number(d[2]) >= todayInt;
  });
}

/** Filter out site-order scouts, sort alphabetically by name */
function getActiveScouts(scouts: Record<string, Scout>): Array<[string, Scout]> {
  return Object.entries(scouts)
    .filter(([, s]) => !s.isSiteOrder)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** Normalize date strings to YYYY-MM-DD for consistent grouping and sorting */
function normalizeDate(dateStr: string): string {
  const iso = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return dateStr;
}

/** Inventory direction from the troop's perspective */
type InventoryDirection = 'in' | 'out';

/** Build a human-readable type label, from/to, and direction for a transfer row */
function describeTransfer(transfer: Transfer): { typeLabel: string; from: string; to: string; direction: InventoryDirection } {
  switch (transfer.category) {
    case TRANSFER_CATEGORY.COUNCIL_TO_TROOP:
      if (transfer.type === TRANSFER_TYPE.T2T) {
        return { typeLabel: 'T2T In', from: `Troop ${transfer.from}`, to: 'Troop', direction: 'in' };
      }
      return { typeLabel: 'C2T', from: transfer.from || 'Council', to: 'Troop', direction: 'in' };
    case TRANSFER_CATEGORY.TROOP_OUTGOING:
      return { typeLabel: 'T2T Out', from: 'Troop', to: `Troop ${transfer.to}`, direction: 'out' };
    case TRANSFER_CATEGORY.GIRL_PICKUP:
    case TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION:
    case TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION:
    case TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION:
      return { typeLabel: 'T2G', from: 'Troop', to: transfer.to || '-', direction: 'out' };
    case TRANSFER_CATEGORY.GIRL_RETURN:
      return { typeLabel: 'G2T', from: transfer.from || '-', to: 'Troop', direction: 'in' };
    default:
      return { typeLabel: transfer.type || '-', from: transfer.from || '-', to: transfer.to || '-', direction: 'out' };
  }
}

export {
  boothTypeClass,
  buildVarietyTooltip,
  sortVarietiesByOrder,
  getActiveScouts,
  getCompleteVarieties,
  countBoothsNeedingDistribution,
  DateFormatter,
  describeTransfer,
  formatShortDate,
  formatBoothTime,
  formatCurrency,
  formatDataSize,
  formatDuration,
  formatMaxAge,
  formatTimeRange,
  formatCompactRange,
  formatTime12h,
  formatBoothDate,
  isPhysicalVariety,
  isVirtualBooth,
  normalizeDate,
  parseTimeToMinutes,
  slotOverlapsRange,
  parseLocalDate,
  todayMidnight,
  haversineDistance,
  pruneExpiredSlots
};
