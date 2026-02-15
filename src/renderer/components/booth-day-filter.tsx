// BoothDayFilter — 7×6 checkbox grid for filtering booth days and time slots

import { useState } from 'preact/hooks';
import { BOOTH_TIME_SLOTS, DAY_LABELS } from '../../constants';

interface BoothDayFilterProps {
  currentFilters: string[];
  onSave: (filters: string[]) => void;
  onCancel: () => void;
}

/** Key format: "day|startTime" e.g. "3|14:00" */
function slotKey(day: number, start: string): string {
  return `${day}|${start}`;
}

export function BoothDayFilter({ currentFilters, onSave, onCancel }: BoothDayFilterProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentFilters));

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

  return (
    <div class="report-visual">
      <h3>Select Days & Times</h3>
      <p class="muted-text" style={{ marginTop: '-16px', marginBottom: '16px' }}>
        Choose which days and time slots to show in Booth Finder.
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
              <th onClick={() => toggleDay(day)} title={`Toggle all ${label}`} style={{ cursor: 'pointer' }}>
                {label}
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
        <button type="button" class="btn btn-primary" onClick={() => onSave([...selected])}>
          Save Filters ({totalSelected} slot{totalSelected === 1 ? '' : 's'})
        </button>
        <button type="button" class="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
