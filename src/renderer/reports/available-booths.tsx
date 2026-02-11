// Available Booths Report — Preact component
// Shows booth locations with filtered availability dates/times

import type { BoothAvailableDate, BoothLocation, BoothTimeSlot, DayFilter, IgnoredTimeSlot, UnifiedDataset } from '../../types';

interface AvailableBoothsConfig {
  filters: DayFilter[];
  ignoredTimeSlots: IgnoredTimeSlot[];
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

function isSlotIgnored(boothId: number, date: string, startTime: string, ignored: IgnoredTimeSlot[]): boolean {
  const startMinutes = parseTimeToMinutes(startTime);
  return ignored.some((i) => i.boothId === boothId && i.date === date && parseTimeToMinutes(i.startTime) === startMinutes);
}

function filterAvailableDates(dates: BoothAvailableDate[], filters: DayFilter[]): BoothAvailableDate[] {
  const now = new Date();
  const todayInt = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const result: BoothAvailableDate[] = [];

  for (const d of dates) {
    const parts = d.date.split(/[-/]/);
    if (parts.length < 3) continue;
    const dateInt = Number(parts[0]) * 10000 + Number(parts[1]) * 100 + Number(parts[2]);
    if (dateInt < todayInt) continue;

    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayOfWeek = dateObj.getDay();
    const matchingFilter = filters.find((f) => f.day === dayOfWeek);
    if (!matchingFilter) continue;

    let slots = d.timeSlots;
    if (matchingFilter.timeAfter && matchingFilter.timeBefore) {
      slots = slots.filter((s) => slotOverlapsRange(s, matchingFilter.timeAfter!, matchingFilter.timeBefore!));
    }
    if (matchingFilter.excludeAfter && matchingFilter.excludeBefore) {
      slots = slots.filter((s) => !slotOverlapsRange(s, matchingFilter.excludeAfter!, matchingFilter.excludeBefore!));
    }
    if (slots.length > 0) result.push({ date: d.date, timeSlots: slots });
  }
  return result;
}

function removeIgnoredSlots(dates: BoothAvailableDate[], boothId: number, ignored: IgnoredTimeSlot[]): BoothAvailableDate[] {
  if (ignored.length === 0) return dates;
  const result: BoothAvailableDate[] = [];
  for (const d of dates) {
    const slots = d.timeSlots.filter((s) => !isSlotIgnored(boothId, d.date, s.startTime, ignored));
    if (slots.length > 0) result.push({ date: d.date, timeSlots: slots });
  }
  return result;
}

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

function formatBoothDate(dateStr: string): string {
  const parts = dateStr.split(/[-/]/);
  if (parts.length >= 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayName} ${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  return dateStr;
}

/** Count total available (non-ignored) slots across all booths */
export function countAvailableSlots(boothLocations: BoothLocation[], filters: DayFilter[], ignored: IgnoredTimeSlot[]): number {
  let count = 0;
  for (const loc of boothLocations) {
    const filtered = filterAvailableDates(loc.availableDates || [], filters);
    const visible = removeIgnoredSlots(filtered, loc.id, ignored);
    for (const d of visible) count += d.timeSlots.length;
  }
  return count;
}

interface AvailableBoothsProps {
  data: UnifiedDataset;
  config: AvailableBoothsConfig;
  refreshing: boolean;
  onIgnoreSlot: (boothId: number, date: string, startTime: string) => void;
  onRefresh: () => void;
}

export function AvailableBoothsReport({ data, config, refreshing, onIgnoreSlot, onRefresh }: AvailableBoothsProps) {
  if (!data) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const { filters, ignoredTimeSlots } = config;
  const boothLocations = data.boothLocations || [];

  const boothsWithDates = boothLocations.filter((loc) => {
    const filtered = filterAvailableDates(loc.availableDates || [], filters);
    return removeIgnoredSlots(filtered, loc.id, ignoredTimeSlots).length > 0;
  });

  return (
    <div class="report-visual">
      <h3>Available Booths</h3>
      <div class="report-toolbar">
        <button type="button" class="btn btn-secondary" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? 'Refreshing...' : 'Refresh Availability'}
        </button>
      </div>

      {boothsWithDates.length === 0 ? (
        <p class="muted-text">No available booth slots found. Booth availability is fetched from Smart Cookie during sync.</p>
      ) : (
        boothsWithDates.map((loc) => {
          const addrParts = [loc.address.street, loc.address.city, loc.address.state, loc.address.zip].filter(Boolean);
          const addressStr = addrParts.join(', ');
          const typeClass =
            loc.reservationType === 'LOTTERY' ? 'type-lottery' : loc.reservationType === 'FCFS' ? 'type-fcfs' : 'type-default';

          const filtered = filterAvailableDates(loc.availableDates || [], filters);
          const dates = removeIgnoredSlots(filtered, loc.id, ignoredTimeSlots);

          return (
            <div key={loc.id} class="booth-card">
              <div class="booth-card-header">
                <div>
                  <strong>{loc.storeName || '-'}</strong>
                  <div class="meta-text">{addressStr || '-'}</div>
                  {loc.notes && <div class="muted-text note-text">{loc.notes}</div>}
                </div>
                <span class={`booth-type-badge ${typeClass}`}>{loc.reservationType || '-'}</span>
              </div>

              <div class="booth-card-body">
                {dates.map((d) => (
                  <div key={d.date} class="booth-date-group">
                    <div class="booth-date-label">{formatBoothDate(d.date)}</div>
                    {d.timeSlots.length === 0 ? (
                      <span class="muted-text">No time slots available</span>
                    ) : (
                      <div class="booth-slot-list">
                        {d.timeSlots.map((slot) => {
                          const friendly =
                            slot.startTime && slot.endTime
                              ? `${formatTime12h(slot.startTime)} – ${formatTime12h(slot.endTime)}`
                              : formatTime12h(slot.startTime) || '-';
                          const raw = slot.startTime && slot.endTime ? `${slot.startTime} – ${slot.endTime}` : slot.startTime || '-';

                          return (
                            <span key={`${d.date}-${slot.startTime}`} title={raw} class="booth-time-slot">
                              {friendly}
                              <button
                                type="button"
                                class="booth-slot-dismiss"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onIgnoreSlot(loc.id, d.date, slot.startTime);
                                }}
                                title="Ignore this time slot"
                              >
                                &times;
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
