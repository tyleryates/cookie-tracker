// HTML Builder Utilities

import { COOKIE_ORDER, getCookieDisplayName } from '../cookie-constants';
import type { CookieType, Varieties } from '../types';

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

function formatCurrency(value: number): string {
  return `$${Math.round(value || 0)}`;
}

/** Build variety tooltip as plain text string (for Preact TooltipCell) */
function buildVarietyTooltip(varieties: Varieties): string {
  if (!varieties || Object.keys(varieties).length === 0) return '';
  return sortVarietiesByOrder(Object.entries(varieties))
    .map(([variety, count]) => `${getCookieDisplayName(variety)}: ${count}`)
    .join('\n');
}

export { buildVarietyTooltip, sortVarietiesByOrder, getCompleteVarieties, DateFormatter, formatDate, formatCurrency };
