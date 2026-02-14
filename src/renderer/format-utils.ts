// HTML Builder Utilities

import { COOKIE_ORDER, getCookieColor, getCookieDisplayName } from '../cookie-constants';
import type { BoothReservationImported, BoothTimeSlot, CookieType, Varieties } from '../types';

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

  // Create filename-safe timestamp (YYYY-MM-DD-HH-MM-SS)
  toTimestamp(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-').split('.')[0];
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

  // Format friendly relative timestamp with time-of-day
  toFriendly(date: string | Date | null | undefined): string {
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

// Convenience wrapper for DateFormatter.toDisplay()
function formatDate(dateStr: string | null | undefined): string {
  return DateFormatter.toDisplay(dateStr);
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
  const parts = dateStr.split(/[-/]/);
  if (parts.length >= 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayName} ${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  return dateStr;
}

/** Count non-virtual booth reservations that need distribution (past, or today after end time) */
function countBoothsNeedingDistribution(boothReservations: BoothReservationImported[]): number {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return boothReservations.filter((r) => {
    const type = (r.booth.reservationType || '').toLowerCase();
    if (type.includes('virtual')) return false;
    if (r.booth.isDistributed) return false;
    if (!r.timeslot.date) return true;
    const parts = r.timeslot.date.split(/[-/]/);
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (d < todayMidnight) return true; // Past day
    if (d.getTime() === todayMidnight.getTime()) {
      // Today — only count if booth end time has passed
      const endMin = parseTimeToMinutes(r.timeslot.endTime || '');
      return endMin >= 0 && nowMinutes >= endMin;
    }
    return false; // Future
  }).length;
}

export {
  buildVarietyTooltip,
  sortVarietiesByOrder,
  getCompleteVarieties,
  countBoothsNeedingDistribution,
  DateFormatter,
  formatDate,
  formatCurrency,
  formatTimeRange,
  formatTime12h,
  formatBoothDate,
  parseTimeToMinutes,
  slotOverlapsRange,
  haversineDistance
};

/** Haversine distance between two lat/lng points, in miles */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
