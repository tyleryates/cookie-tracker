// sync-formatters — utility functions for sync notifications and staleness checks

import { formatCompactRange, formatShortDate } from '../format-utils';
import { type BoothSlotSummary, encodeSlotKey } from '../reports/available-booths-utils';

// ============================================================================
// AUTO-SYNC — staleness-based polling
// ============================================================================

export function isStale(lastSync: string | undefined | null, maxAgeMs: number): boolean {
  if (!lastSync) return true;
  return Date.now() - new Date(lastSync).getTime() > maxAgeMs;
}

// ============================================================================
// NOTIFICATION FORMATTING
// ============================================================================

function formatSlotTime(slot: { date: string; startTime: string; endTime: string }): string {
  return `${formatShortDate(slot.date)} ${formatCompactRange(slot.startTime, slot.endTime)}`;
}

function formatBoothCompact(b: BoothSlotSummary): string {
  return b.slotCount === 1 ? `${b.storeName} ${formatSlotTime(b.slots[0])}` : `${b.storeName} (${b.slotCount} slots)`;
}

/** Build sync result message for logging and UI display */
export function formatSyncResult(
  parts: string[],
  errors: string[]
): { logLevel: 'info' | 'warn' | 'error'; logMsg: string; userMsg: string; type: 'success' | 'warning' | 'error' } {
  const hasSuccess = parts.length > 0;
  const hasErrors = errors.length > 0;

  if (hasSuccess && !hasErrors) {
    return { logLevel: 'info', logMsg: `complete — ${parts.join(', ')}`, userMsg: `Sync complete! ${parts.join(', ')}`, type: 'success' };
  }
  if (hasSuccess && hasErrors) {
    return {
      logLevel: 'warn',
      logMsg: `partial — ${parts.join(', ')}. Errors: ${errors.join('; ')}`,
      userMsg: `Partial sync: ${parts.join(', ')}. Errors: ${errors.join('; ')}`,
      type: 'warning'
    };
  }
  if (hasErrors) {
    return { logLevel: 'error', logMsg: `failed — ${errors.join('; ')}`, userMsg: `Sync failed: ${errors.join('; ')}`, type: 'error' };
  }
  return { logLevel: 'warn', logMsg: 'completed with warnings', userMsg: 'Sync completed with warnings', type: 'warning' };
}

/** Short body for OS notification banner — verbose times when single location, capped at 2 */
export function formatNotificationBody(booths: BoothSlotSummary[]): string {
  if (booths.length === 1 && booths[0].slotCount > 1) {
    const b = booths[0];
    const shown = b.slots
      .slice(0, 2)
      .map((s) => formatSlotTime(s))
      .join(', ');
    const remaining = b.slotCount - 2;
    return remaining > 0 ? `${b.storeName}: ${shown} +${remaining} more` : `${b.storeName}: ${shown}`;
  }
  return booths.map(formatBoothCompact).join(', ');
}

/** Filter booth summaries to only slots not yet notified, returns new summaries (or empty) */
export function filterNewSlots(booths: BoothSlotSummary[], notified: Set<string>): BoothSlotSummary[] {
  const result: BoothSlotSummary[] = [];
  for (const b of booths) {
    const newSlots = b.slots.filter((s) => !notified.has(encodeSlotKey(b.id, s.date, s.startTime)));
    if (newSlots.length > 0) {
      result.push({ ...b, slotCount: newSlots.length, slots: newSlots });
    }
  }
  return result;
}

/** Mark all slots in the summaries as notified */
export function markNotified(booths: BoothSlotSummary[], notified: Set<string>): void {
  for (const b of booths) {
    for (const s of b.slots) notified.add(encodeSlotKey(b.id, s.date, s.startTime));
  }
}

/** Detailed body for iMessage — verbose with address when single location */
export function formatImessageBody(booths: BoothSlotSummary[]): string {
  const total = booths.reduce((sum, b) => sum + b.slotCount, 0);
  const header = `${total} booth opening${total === 1 ? '' : 's'}`;
  const lines = [header];
  for (const b of booths) {
    lines.push('', b.storeName, b.address, '');
    for (const s of b.slots) lines.push(formatSlotTime(s));
  }
  return lines.join('\n');
}
