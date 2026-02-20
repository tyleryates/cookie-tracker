// Formatting and display utilities

import { BOOTH_RESERVATION_TYPE, TRANSFER_CATEGORY, TRANSFER_TYPE } from '../constants';
import { COOKIE_ORDER, getCookieDisplayName, sortVarietiesByOrder } from '../cookie-constants';
import type { Allocation, BoothReservationImported, BoothTimeSlot, Scout, Transfer, Varieties } from '../types';

// ============================================================================
// DATE FORMATTING
// ============================================================================

/** Centralized date formatting utilities */
const DateFormatter = {
  /** Format date from YYYY/MM/DD to MM/DD/YYYY */
  toDisplay(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';
    const str = String(dateStr);
    const match = str.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${month}/${day}/${year}`;
    }
    return str;
  },

  /** Format full timestamp for hover (e.g., "Feb 5, 2026, 3:45 PM") */
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

  /** Format friendly relative timestamp with time-of-day (e.g. "Today at 3:45 PM", "2 days ago") */
  toRelativeTimestamp(date: string | Date | null | undefined): string {
    if (!date) return 'Never';

    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    const timeStr = then.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const isToday = then.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = then.toDateString() === yesterday.toDateString();

    const nowDay = new Date(now);
    nowDay.setHours(0, 0, 0, 0);
    const thenDay = new Date(then);
    thenDay.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((nowDay.getTime() - thenDay.getTime()) / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (isToday) return `Today at ${timeStr}`;
    if (isYesterday) return `Yesterday at ${timeStr}`;
    if (daysDiff < 7) return `${daysDiff} days ago at ${timeStr}`;

    const dateStr = then.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
    return `${dateStr} at ${timeStr}`;
  }
};

/** Canonical date parser — handles ISO (YYYY-MM-DD) and US (MM/DD/YYYY) formats.
 *  Single source of truth for date string parsing; all other date functions derive from this. */
const DATE_ISO = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/;
const DATE_US = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/;

function parseDateParts(str: string): { year: number; month: number; day: number } | null {
  const iso = str.match(DATE_ISO);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const us = str.match(DATE_US);
  if (us) return { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) };
  return null;
}

/** Format date as "Sat 02/14" (short day of week + MM/DD, no year) */
function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const str = String(dateStr);
  const parts = parseDateParts(str);
  if (!parts) return str;
  const d = new Date(parts.year, parts.month - 1, parts.day);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${day} ${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}`;
}

/** Parse a date string (ISO or US format) to a local Date (midnight) */
function parseLocalDate(dateStr: string): Date | null {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
}

/** Normalize date strings to YYYY-MM-DD for consistent grouping and sorting */
function normalizeDate(dateStr: string): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Get today's date at local midnight */
function todayMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

/** Parse a time string into { hours (24h), minutes } or null */
function parseTimeParts(time: string): { hours: number; minutes: number } | null {
  const match24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return { hours: Number(match24[1]), minutes: Number(match24[2]) };
  const match12 = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = Number(match12[1]);
    const minutes = Number(match12[2]);
    const period = match12[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
  }
  return null;
}

/** Parse a time string like "4:00 PM" or "16:00" to minutes since midnight */
function parseTimeToMinutes(time: string): number {
  const parts = parseTimeParts(time);
  if (!parts) return -1;
  return parts.hours * 60 + parts.minutes;
}

/** Convert a 24h or 12h time string to a friendly 12h format (e.g., "4:00 pm") */
function formatTime12h(time: string): string {
  const parts = parseTimeParts(time);
  if (!parts) return time;
  let hours = parts.hours;
  const mins = String(parts.minutes).padStart(2, '0');
  const period = hours >= 12 ? 'pm' : 'am';
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return `${hours}:${mins} ${period}`;
}

function formatTimeRange(startTime: string | undefined, endTime: string | undefined): string {
  if (startTime && endTime) return `${formatTime12h(startTime)} - ${formatTime12h(endTime)}`;
  return startTime ? formatTime12h(startTime) : '-';
}

/** Compact time parts { hour, period } — e.g. { hour: "4", period: "pm" }. Drops :00 minutes. */
function formatCompactTime(time: string): { hour: string; period: string } {
  const full = formatTime12h(time);
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

/** Check if a time slot overlaps a given range (start >= after && start < before) */
function slotOverlapsRange(slot: BoothTimeSlot, afterStr: string, beforeStr: string): boolean {
  const after = parseTimeToMinutes(afterStr);
  const before = parseTimeToMinutes(beforeStr);
  const start = parseTimeToMinutes(slot.startTime);
  if (after < 0 || before < 0 || start < 0) return true;
  return start >= after && start < before;
}

// ============================================================================
// BOOTH DISPLAY HELPERS
// ============================================================================

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

/** Format booth time slot as compact range with fallback */
function formatBoothTime(startTime: string | undefined, endTime: string | undefined): string {
  if (startTime && endTime) return formatCompactRange(startTime, endTime);
  return startTime || '-';
}

/** CSS class for booth reservation type badge */
function boothTypeClass(reservationType: string | undefined): string {
  if (reservationType === BOOTH_RESERVATION_TYPE.LOTTERY) return 'type-lottery';
  if (reservationType === BOOTH_RESERVATION_TYPE.FCFS) return 'type-fcfs';
  return 'type-default';
}

/** Check if a booth reservation type is virtual (excluded from most booth reports) */
function isVirtualBooth(reservationType: string | undefined): boolean {
  return (reservationType || '').toLowerCase().includes('virtual');
}

/** Haversine distance between two lat/lng points, in miles */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

// ============================================================================
// VARIETY & COOKIE HELPERS
// ============================================================================

/** Get complete variety list with 0 for missing cookies */
function getCompleteVarieties(varieties: Varieties | undefined): Record<string, number> {
  const complete: Record<string, number> = {};
  const safeVarieties = varieties || {};
  COOKIE_ORDER.forEach((variety) => {
    complete[variety] = safeVarieties[variety] || 0;
  });
  return complete;
}

/** Build variety tooltip as plain text lines */
function buildVarietyTooltip(varieties: Varieties): string {
  if (!varieties || Object.keys(varieties).length === 0) return '';
  return sortVarietiesByOrder(Object.entries(varieties))
    .map(([variety, count]) => `${getCookieDisplayName(variety)}: ${count}`)
    .join('\n');
}

/** Check if a cookie variety is physical (not Cookie Share / donation-only) */
function isPhysicalVariety(variety: string): boolean {
  return variety !== 'COOKIE_SHARE';
}

/** Sum varieties across multiple allocations into a single Varieties map */
function accumulateVarieties(allocations: Allocation[]): Varieties {
  const result: Varieties = {};
  for (const a of allocations)
    for (const [v, n] of Object.entries(a.varieties)) result[v as keyof Varieties] = (result[v as keyof Varieties] || 0) + (n || 0);
  return result;
}

// ============================================================================
// SCOUT & TRANSFER HELPERS
// ============================================================================

/** Filter out site-order scouts, sort alphabetically by name */
function getActiveScouts(scouts: Record<string, Scout>): Array<[string, Scout]> {
  return Object.entries(scouts)
    .filter(([, s]) => !s.isSiteOrder)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** Inventory direction from the troop's perspective */
type InventoryDirection = 'in' | 'out';

/** Build a human-readable type label, from/to, and direction for a transfer row */
function getTransferDisplayInfo(transfer: Transfer): { typeLabel: string; from: string; to: string; direction: InventoryDirection } {
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

// ============================================================================
// GENERAL FORMATTING
// ============================================================================

function formatCurrency(value: number): string {
  return `$${Math.round(value || 0)}`;
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

// ============================================================================
// EXPORTS
// ============================================================================

export {
  accumulateVarieties,
  boothTypeClass,
  buildVarietyTooltip,
  countBoothsNeedingDistribution,
  DateFormatter,
  formatBoothDate,
  formatBoothTime,
  formatCompactRange,
  formatCurrency,
  formatDataSize,
  formatDuration,
  formatMaxAge,
  formatShortDate,
  formatTime12h,
  formatTimeRange,
  getActiveScouts,
  getCompleteVarieties,
  getTransferDisplayInfo,
  haversineDistance,
  isPhysicalVariety,
  isVirtualBooth,
  normalizeDate,
  parseLocalDate,
  parseTimeToMinutes,
  pruneExpiredSlots,
  slotOverlapsRange,
  sortVarietiesByOrder,
  todayMidnight
};
