// Available Booths — Utility functions and types
// Extracted from available-booths.tsx for use by other modules

import { BOOTH_TIME_SLOTS } from '../../constants';
import type { BoothAvailableDate, BoothLocation, BoothTimeSlot } from '../../types';
import { parseLocalDate, slotOverlapsRange, todayMidnight } from '../format-utils';

/** Encode a slot as "boothId|date|startTime" for ignored/notified tracking */
export function encodeSlotKey(boothId: number, date: string, startTime: string): string {
  return `${boothId}|${date}|${startTime}`;
}

export interface SlotDetail {
  date: string;
  startTime: string;
  endTime: string;
}

export interface BoothSlotSummary {
  id: number;
  storeName: string;
  address: string;
  slotCount: number;
  slots: SlotDetail[];
}

/** Build a lookup: day number → Set of allowed start times. Empty set means no filter for that day. */
export function parseFiltersByDay(filters: string[]): Map<number, Set<string>> {
  const byDay = new Map<number, Set<string>>();
  for (const f of filters) {
    if (typeof f !== 'string') continue;
    const [dayStr, start] = f.split('|');
    const day = Number(dayStr);
    if (!byDay.has(day)) byDay.set(day, new Set());
    if (start) byDay.get(day)!.add(start);
  }
  return byDay;
}

/** Look up end time from BOOTH_TIME_SLOTS for a given start time */
function slotEndTime(start: string): string | undefined {
  return BOOTH_TIME_SLOTS.find((s) => s.start === start)?.end;
}

function isSlotIgnored(boothId: number, date: string, startTime: string, ignored: Set<string>): boolean {
  return ignored.has(encodeSlotKey(boothId, date, startTime));
}

/** Check if a time slot matches the allowed filter starts (exact match or overlap) */
function isSlotAllowed(slot: BoothTimeSlot, allowedStarts: Set<string>): boolean {
  if (allowedStarts.size === 0) return true; // day with no time constraint
  if (allowedStarts.has(slot.startTime)) return true;
  return [...allowedStarts].some((start) => {
    const end = slotEndTime(start);
    return end ? slotOverlapsRange(slot, start, end) : false;
  });
}

export function filterAvailableDates(dates: BoothAvailableDate[], filters: string[]): BoothAvailableDate[] {
  const byDay = parseFiltersByDay(filters);
  const today = todayMidnight();
  const result: BoothAvailableDate[] = [];

  for (const d of dates) {
    const dateObj = parseLocalDate(d.date);
    if (!dateObj || dateObj < today) continue;

    const allowedStarts = byDay.get(dateObj.getDay());
    if (!allowedStarts) continue;

    const slots = d.timeSlots.filter((s) => isSlotAllowed(s, allowedStarts));
    if (slots.length > 0) result.push({ date: d.date, timeSlots: slots });
  }
  return result;
}

export function removeIgnoredSlots(dates: BoothAvailableDate[], boothId: number, ignored: Set<string>): BoothAvailableDate[] {
  if (ignored.size === 0) return dates;
  const result: BoothAvailableDate[] = [];
  for (const d of dates) {
    const slots = d.timeSlots.filter((s) => !isSlotIgnored(boothId, d.date, s.startTime, ignored));
    if (slots.length > 0) result.push({ date: d.date, timeSlots: slots });
  }
  return result;
}

/** Summarize available slots per booth for notification messages */
export function summarizeAvailableSlots(boothLocations: BoothLocation[], filters: string[], ignored: string[]): BoothSlotSummary[] {
  const ignoredSet = new Set(ignored);
  const result: BoothSlotSummary[] = [];
  for (const loc of boothLocations) {
    const filtered = filterAvailableDates(loc.availableDates || [], filters);
    const visible = removeIgnoredSlots(filtered, loc.id, ignoredSet);
    const slots: SlotDetail[] = [];
    for (const d of visible) {
      for (const s of d.timeSlots) {
        slots.push({ date: d.date, startTime: s.startTime, endTime: s.endTime });
      }
    }
    if (slots.length > 0) {
      const addr = loc.address;
      result.push({
        id: loc.id,
        storeName: loc.storeName,
        address: `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`,
        slotCount: slots.length,
        slots
      });
    }
  }
  return result;
}
