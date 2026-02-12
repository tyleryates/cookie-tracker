import { describe, expect, it } from 'vitest';
import { COOKIE_ORDER, getCookieDisplayName } from '../../cookie-constants';
import { classifyOrderStatus } from '../../order-classification';
import type { BoothTimeSlot } from '../../types';
import {
  buildVarietyTooltip,
  DateFormatter,
  formatBoothDate,
  formatCurrency,
  formatDate,
  formatTime12h,
  formatTimeRange,
  getCompleteVarieties,
  parseTimeToMinutes,
  slotOverlapsRange
} from '../format-utils';

describe('formatDate / DateFormatter.toDisplay', () => {
  it('converts YYYY/MM/DD to MM/DD/YYYY', () => {
    expect(formatDate('2025/02/05')).toBe('02/05/2025');
  });

  it('converts YYYY-MM-DD to MM/DD/YYYY', () => {
    expect(DateFormatter.toDisplay('2025-02-05')).toBe('02/05/2025');
  });

  it('returns "-" for null', () => {
    expect(formatDate(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatDate(undefined)).toBe('-');
  });

  it('returns as-is for unknown format', () => {
    expect(formatDate('February 5, 2025')).toBe('February 5, 2025');
  });
});

describe('DateFormatter.toTimestamp', () => {
  it('creates filename-safe timestamp from Date', () => {
    const date = new Date('2025-02-05T14:30:45.123Z');
    const result = DateFormatter.toTimestamp(date);
    expect(result).toBe('2025-02-05T14-30-45-123Z');
  });

  it('does not contain colons or dots', () => {
    const result = DateFormatter.toTimestamp(new Date());
    expect(result).not.toMatch(/[:.]/);
  });
});

describe('formatCurrency', () => {
  it('formats a positive number with $ and rounds', () => {
    expect(formatCurrency(123.7)).toBe('$124');
  });

  it('formats a round number', () => {
    expect(formatCurrency(50)).toBe('$50');
  });

  it('handles 0', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('rounds down when decimal < 0.5', () => {
    expect(formatCurrency(99.4)).toBe('$99');
  });
});

describe('buildVarietyTooltip', () => {
  it('returns empty string for empty object', () => {
    expect(buildVarietyTooltip({})).toBe('');
  });

  it('returns empty string for undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(buildVarietyTooltip(undefined as any)).toBe('');
  });

  it('returns newline-separated "Name: count" lines using display names', () => {
    const varieties = { THIN_MINTS: 5, TREFOILS: 3 };
    const result = buildVarietyTooltip(varieties);
    const lines = result.split('\n');
    expect(lines).toContain(`${getCookieDisplayName('THIN_MINTS')}: 5`);
    expect(lines).toContain(`${getCookieDisplayName('TREFOILS')}: 3`);
  });

  it('uses actual cookie display names', () => {
    const varieties = { THIN_MINTS: 2 };
    const result = buildVarietyTooltip(varieties);
    expect(result).toBe('Thin Mints: 2');
  });
});

describe('parseTimeToMinutes', () => {
  it('parses "4:00 PM" to 960', () => {
    expect(parseTimeToMinutes('4:00 PM')).toBe(960);
  });

  it('parses "16:00" (24-hour) to 960', () => {
    expect(parseTimeToMinutes('16:00')).toBe(960);
  });

  it('parses "12:00 AM" to 0 (midnight)', () => {
    expect(parseTimeToMinutes('12:00 AM')).toBe(0);
  });

  it('parses "12:00 PM" to 720 (noon)', () => {
    expect(parseTimeToMinutes('12:00 PM')).toBe(720);
  });

  it('returns -1 for invalid time string', () => {
    expect(parseTimeToMinutes('not a time')).toBe(-1);
  });
});

describe('slotOverlapsRange', () => {
  const makeSlot = (startTime: string, endTime: string): BoothTimeSlot => ({ startTime, endTime });

  it('returns true when slot start is within range', () => {
    const slot = makeSlot('4:00 PM', '6:00 PM');
    expect(slotOverlapsRange(slot, '3:00 PM', '5:00 PM')).toBe(true);
  });

  it('returns false when slot start is before range', () => {
    const slot = makeSlot('1:00 PM', '3:00 PM');
    expect(slotOverlapsRange(slot, '3:00 PM', '5:00 PM')).toBe(false);
  });

  it('returns false when slot start is at or after range end', () => {
    const slot = makeSlot('5:00 PM', '7:00 PM');
    expect(slotOverlapsRange(slot, '3:00 PM', '5:00 PM')).toBe(false);
  });

  it('returns true when any time string is invalid', () => {
    const slot = makeSlot('invalid', '6:00 PM');
    expect(slotOverlapsRange(slot, '3:00 PM', '5:00 PM')).toBe(true);
  });

  it('returns true when after string is invalid', () => {
    const slot = makeSlot('4:00 PM', '6:00 PM');
    expect(slotOverlapsRange(slot, 'bad', '5:00 PM')).toBe(true);
  });
});

describe('classifyOrderStatus', () => {
  it('returns NEEDS_APPROVAL for "Needs Approval"', () => {
    expect(classifyOrderStatus('Needs Approval')).toBe('NEEDS_APPROVAL');
  });

  it('returns COMPLETED for "Status Delivered"', () => {
    expect(classifyOrderStatus('Status Delivered')).toBe('COMPLETED');
  });

  it('returns COMPLETED for "Completed"', () => {
    expect(classifyOrderStatus('Completed')).toBe('COMPLETED');
  });

  it('returns PENDING for "Pending"', () => {
    expect(classifyOrderStatus('Pending')).toBe('PENDING');
  });

  it('returns UNKNOWN for unknown status string', () => {
    expect(classifyOrderStatus('Something Else')).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for undefined', () => {
    expect(classifyOrderStatus(undefined)).toBe('UNKNOWN');
  });
});

describe('formatTimeRange', () => {
  it('formats start and end into "start - end"', () => {
    expect(formatTimeRange('4:00 PM', '6:00 PM')).toBe('4:00 PM - 6:00 PM');
  });

  it('returns start time when end is undefined', () => {
    expect(formatTimeRange('4:00 PM', undefined)).toBe('4:00 PM');
  });

  it('returns "-" when both are undefined', () => {
    expect(formatTimeRange(undefined, undefined)).toBe('-');
  });
});

describe('getCompleteVarieties', () => {
  it('fills missing cookies with 0', () => {
    const result = getCompleteVarieties({});
    for (const type of COOKIE_ORDER) {
      expect(result[type]).toBe(0);
    }
  });

  it('includes provided values', () => {
    const result = getCompleteVarieties({ THIN_MINTS: 10, TREFOILS: 5 });
    expect(result.THIN_MINTS).toBe(10);
    expect(result.TREFOILS).toBe(5);
  });

  it('has an entry for every cookie in COOKIE_ORDER', () => {
    const result = getCompleteVarieties({ THIN_MINTS: 3 });
    expect(Object.keys(result).length).toBe(COOKIE_ORDER.length);
    for (const type of COOKIE_ORDER) {
      expect(result).toHaveProperty(type);
    }
  });

  it('handles undefined input', () => {
    const result = getCompleteVarieties(undefined);
    for (const type of COOKIE_ORDER) {
      expect(result[type]).toBe(0);
    }
  });
});

describe('formatTime12h', () => {
  it('passes through 12h format with lowercase period', () => {
    expect(formatTime12h('4:00 PM')).toBe('4:00 pm');
  });

  it('converts 24h to 12h (afternoon)', () => {
    expect(formatTime12h('16:00')).toBe('4:00 pm');
  });

  it('converts 24h to 12h (morning)', () => {
    expect(formatTime12h('9:30')).toBe('9:30 am');
  });

  it('converts midnight (0:00) to 12:00 am', () => {
    expect(formatTime12h('0:00')).toBe('12:00 am');
  });

  it('converts noon (12:00) to 12:00 pm', () => {
    expect(formatTime12h('12:00')).toBe('12:00 pm');
  });

  it('returns as-is for unrecognized format', () => {
    expect(formatTime12h('noon')).toBe('noon');
  });
});

describe('formatBoothDate', () => {
  it('formats YYYY-MM-DD as "Day MM/DD/YYYY"', () => {
    // 2025-02-05 is a Wednesday
    expect(formatBoothDate('2025-02-05')).toBe('Wed 02/05/2025');
  });

  it('handles YYYY/MM/DD format', () => {
    expect(formatBoothDate('2025/03/15')).toBe('Sat 03/15/2025');
  });

  it('returns as-is for unrecognized format', () => {
    expect(formatBoothDate('February 5')).toBe('February 5');
  });
});
