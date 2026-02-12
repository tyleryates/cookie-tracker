// Available Booths Report — Preact component
// Shows booth locations with filtered availability dates/times

import { useState } from 'preact/hooks';
import { BOOTH_RESERVATION_TYPE } from '../../constants';
import type { AppConfig, BoothAvailableDate, BoothLocation, DayFilter, IgnoredTimeSlot, UnifiedDataset } from '../../types';
import { BoothSelector } from '../components/booth-selector';
import { formatBoothDate, formatTime12h, parseTimeToMinutes, slotOverlapsRange } from '../format-utils';

interface AvailableBoothsConfig {
  filters: DayFilter[];
  ignoredTimeSlots: IgnoredTimeSlot[];
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
  appConfig: AppConfig | null;
  refreshing: boolean;
  onIgnoreSlot: (boothId: number, date: string, startTime: string) => void;
  onResetIgnored: () => void;
  onRefresh: () => void;
  onSaveBoothIds: (ids: number[]) => void;
}

export function AvailableBoothsReport({
  data,
  config,
  appConfig,
  refreshing,
  onIgnoreSlot,
  onResetIgnored,
  onRefresh,
  onSaveBoothIds
}: AvailableBoothsProps) {
  const [selecting, setSelecting] = useState(false);
  if (!data) {
    return (
      <div class="report-visual">
        <p>No data available. Please import data first.</p>
      </div>
    );
  }

  const { filters, ignoredTimeSlots } = config;
  const boothLocations = data.boothLocations || [];

  if (selecting) {
    return (
      <BoothSelector
        currentBoothIds={appConfig?.boothIds || []}
        onSave={(ids) => {
          setSelecting(false);
          onSaveBoothIds(ids);
        }}
        onCancel={() => setSelecting(false)}
      />
    );
  }

  const boothsWithDates = boothLocations.filter((loc) => {
    const filtered = filterAvailableDates(loc.availableDates || [], filters);
    return removeIgnoredSlots(filtered, loc.id, ignoredTimeSlots).length > 0;
  });

  return (
    <div class="report-visual">
      <h3>Available Booths</h3>
      <div class="report-toolbar">
        <button type="button" class="btn btn-secondary" onClick={() => setSelecting(true)}>
          Select Booths
        </button>
        <button type="button" class="btn btn-secondary" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? 'Refreshing...' : 'Refresh Availability'}
        </button>
        {ignoredTimeSlots.length > 0 && (
          <button type="button" class="btn btn-secondary" onClick={onResetIgnored}>
            Reset Ignored ({ignoredTimeSlots.length})
          </button>
        )}
      </div>

      {boothsWithDates.length === 0 ? (
        <p class="muted-text">No available booth slots found. Booth availability is fetched from Smart Cookie during sync.</p>
      ) : (
        boothsWithDates.map((loc) => {
          const addrParts = [loc.address.street, loc.address.city, loc.address.state, loc.address.zip].filter(Boolean);
          const addressStr = addrParts.join(', ');
          const typeClass =
            loc.reservationType === BOOTH_RESERVATION_TYPE.LOTTERY
              ? 'type-lottery'
              : loc.reservationType === BOOTH_RESERVATION_TYPE.FCFS
                ? 'type-fcfs'
                : 'type-default';

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
