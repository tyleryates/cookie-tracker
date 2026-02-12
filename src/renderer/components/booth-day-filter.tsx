// BoothDayFilter — 7×6 checkbox grid for filtering booth days and time slots

import { useMemo, useState } from 'preact/hooks';
import { BOOTH_TIME_SLOTS, DAY_LABELS } from '../../constants';
import type { DayFilter } from '../../types';
import { slotOverlapsRange } from '../format-utils';

interface BoothDayFilterProps {
  currentFilters: DayFilter[];
  onSave: (filters: DayFilter[]) => void;
  onCancel: () => void;
}

/** Build a key like "3-14:00" (day + slot start time) */
function slotKey(day: number, start: string): string {
  return `${day}-${start}`;
}

/** Initialize selection set from existing DayFilter array */
function initFromFilters(filters: DayFilter[]): Set<string> {
  const selected = new Set<string>();
  for (const f of filters) {
    if (!f.timeAfter && !f.timeBefore && !f.excludeAfter && !f.excludeBefore) {
      // No time constraint — all slots for this day
      for (const slot of BOOTH_TIME_SLOTS) {
        selected.add(slotKey(f.day, slot.start));
      }
    } else {
      // Determine which of the 6 fixed slots this filter covers
      for (const slot of BOOTH_TIME_SLOTS) {
        const fakeSlot = { startTime: slot.start, endTime: slot.end };
        let included = true;
        if (f.timeAfter && f.timeBefore) {
          included = slotOverlapsRange(fakeSlot, f.timeAfter, f.timeBefore);
        }
        if (included && f.excludeAfter && f.excludeBefore) {
          included = !slotOverlapsRange(fakeSlot, f.excludeAfter, f.excludeBefore);
        }
        if (included) selected.add(slotKey(f.day, slot.start));
      }
    }
  }
  return selected;
}

/** Convert selection set back to DayFilter[] */
function toFilters(selected: Set<string>): DayFilter[] {
  const filters: DayFilter[] = [];
  for (let day = 0; day < 7; day++) {
    const daySlots = BOOTH_TIME_SLOTS.filter((s) => selected.has(slotKey(day, s.start)));
    if (daySlots.length === 0) continue;
    if (daySlots.length === BOOTH_TIME_SLOTS.length) {
      // All slots — emit with no time constraint
      filters.push({ day });
    } else {
      // One entry per selected slot
      for (const s of daySlots) {
        filters.push({ day, timeAfter: s.start, timeBefore: s.end });
      }
    }
  }
  return filters;
}

export function BoothDayFilter({ currentFilters, onSave, onCancel }: BoothDayFilterProps) {
  const [selected, setSelected] = useState<Set<string>>(() => initFromFilters(currentFilters));

  const totalSelected = selected.size;

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDay = (day: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const keys = BOOTH_TIME_SLOTS.map((s) => slotKey(day, s.start));
      const allOn = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const toggleSlot = (slotIndex: number) => {
    const start = BOOTH_TIME_SLOTS[slotIndex].start;
    setSelected((prev) => {
      const next = new Set(prev);
      const keys = DAY_LABELS.map((_, d) => slotKey(d, start));
      const allOn = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const isDayFullySelected = useMemo(() => {
    return DAY_LABELS.map((_, day) => BOOTH_TIME_SLOTS.every((s) => selected.has(slotKey(day, s.start))));
  }, [selected]);

  return (
    <div class="report-visual">
      <h3>Filter Days & Times</h3>
      <p class="muted-text" style={{ marginTop: '-16px', marginBottom: '16px' }}>
        Toggle which days and time slots appear in Available Booths.
      </p>

      <table class="day-filter-grid">
        <thead>
          <tr>
            <th />
            {BOOTH_TIME_SLOTS.map((slot, i) => (
              <th key={slot.start} onClick={() => toggleSlot(i)} title={`Toggle all ${slot.label}`}>
                {slot.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_LABELS.map((label, day) => (
            <tr key={day}>
              <th onClick={() => toggleDay(day)} title={`Toggle all ${label}`}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span class="toggle-switch toggle-switch-sm">
                    <input
                      type="checkbox"
                      checked={isDayFullySelected[day]}
                      onClick={(e: Event) => e.stopPropagation()}
                      onChange={() => toggleDay(day)}
                    />
                    <span class="toggle-slider" />
                  </span>
                  {label}
                </span>
              </th>
              {BOOTH_TIME_SLOTS.map((slot) => {
                const key = slotKey(day, slot.start);
                return (
                  <td key={key}>
                    <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div class="report-toolbar" style={{ marginTop: '16px' }}>
        <button type="button" class="btn btn-primary" onClick={() => onSave(toFilters(selected))}>
          Save Filters ({totalSelected} slot{totalSelected === 1 ? '' : 's'})
        </button>
        <button type="button" class="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
