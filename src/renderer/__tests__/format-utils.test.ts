import { describe, expect, it } from 'vitest';
import { BOOTH_RESERVATION_TYPE } from '../../constants';
import { COOKIE_ORDER } from '../../cookie-constants';
import { classifyOrderStatus } from '../../order-classification';
import type { BoothReservationImported, BoothTimeSlot } from '../../types';
import {
  boothTypeClass,
  buildVarietyTooltip,
  countBoothsNeedingDistribution,
  DateFormatter,
  formatBoothDate,
  formatBoothTime,
  formatCompactRange,
  formatCurrency,
  formatDataSize,
  formatDate,
  formatDuration,
  formatMaxAge,
  formatShortDate,
  formatTime12h,
  formatTimeRange,
  getCompleteVarieties,
  haversineDistance,
  isPhysicalVariety,
  isVirtualBooth,
  parseLocalDate,
  parseTimeToMinutes,
  slotOverlapsRange,
  sortVarietiesByOrder,
  todayMidnight
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

  it('returns newline-separated lines with display names and colored dots', () => {
    const varieties = { THIN_MINTS: 5, TREFOILS: 3 };
    const result = buildVarietyTooltip(varieties);
    const lines = result.split('\n');
    expect(lines.some((l) => l.includes('Thin Mints: 5'))).toBe(true);
    expect(lines.some((l) => l.includes('Trefoils: 3'))).toBe(true);
  });

  it('includes colored dot spans in output', () => {
    const varieties = { THIN_MINTS: 2 };
    const result = buildVarietyTooltip(varieties);
    expect(result).toContain('Thin Mints: 2');
    expect(result).toContain('border-radius:50%');
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
    expect(formatTimeRange('4:00 PM', '6:00 PM')).toBe('4:00 pm - 6:00 pm');
  });

  it('returns start time when end is undefined', () => {
    expect(formatTimeRange('4:00 PM', undefined)).toBe('4:00 pm');
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

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD to local midnight Date', () => {
    const d = parseLocalDate('2025-02-05');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(1); // 0-indexed
    expect(d!.getDate()).toBe(5);
  });

  it('parses YYYY/MM/DD format', () => {
    const d = parseLocalDate('2025/03/15');
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(15);
  });

  it('returns null for invalid format', () => {
    expect(parseLocalDate('bad')).toBeNull();
  });
});

describe('boothTypeClass', () => {
  it('returns type-lottery for LOTTERY', () => {
    expect(boothTypeClass(BOOTH_RESERVATION_TYPE.LOTTERY)).toBe('type-lottery');
  });

  it('returns type-fcfs for FCFS', () => {
    expect(boothTypeClass(BOOTH_RESERVATION_TYPE.FCFS)).toBe('type-fcfs');
  });

  it('returns type-default for undefined', () => {
    expect(boothTypeClass(undefined)).toBe('type-default');
  });

  it('returns type-default for unknown string', () => {
    expect(boothTypeClass('OTHER')).toBe('type-default');
  });
});

describe('formatBoothTime', () => {
  it('formats compact range when both start and end given', () => {
    expect(formatBoothTime('10:00', '12:00')).toBe('10am-12pm');
  });

  it('returns start time as fallback when no end', () => {
    expect(formatBoothTime('10:00', undefined)).toBe('10:00');
  });

  it('returns "-" when both undefined', () => {
    expect(formatBoothTime(undefined, undefined)).toBe('-');
  });
});

describe('formatCompactRange', () => {
  it('merges same-period times', () => {
    expect(formatCompactRange('10:00', '12:00')).toBe('10am-12pm');
  });

  it('shows both periods when different', () => {
    expect(formatCompactRange('10:00', '14:00')).toBe('10am-2pm');
  });

  it('drops minutes when :00', () => {
    expect(formatCompactRange('16:00', '18:00')).toBe('4-6pm');
  });

  it('keeps minutes when not :00', () => {
    expect(formatCompactRange('16:30', '18:00')).toBe('4:30-6pm');
  });
});

describe('formatShortDate', () => {
  it('formats ISO date as "Day MM/DD"', () => {
    // 2025-02-05 is Wednesday
    expect(formatShortDate('2025-02-05')).toBe('Wed 02/05');
  });

  it('formats US date as "Day MM/DD"', () => {
    expect(formatShortDate('2/5/2025')).toBe('Wed 02/05');
  });

  it('returns "-" for null', () => {
    expect(formatShortDate(null)).toBe('-');
  });

  it('returns as-is for unknown format', () => {
    expect(formatShortDate('hello')).toBe('hello');
  });
});

describe('formatDuration', () => {
  it('returns empty string for undefined', () => {
    expect(formatDuration(undefined)).toBe('');
  });

  it('formats milliseconds under 1000', () => {
    expect(formatDuration(450)).toBe('450ms');
  });

  it('formats seconds for 1000+', () => {
    expect(formatDuration(1500)).toBe('1.5s');
  });

  it('formats exact seconds', () => {
    expect(formatDuration(2000)).toBe('2.0s');
  });
});

describe('formatDataSize', () => {
  it('returns empty string for undefined', () => {
    expect(formatDataSize(undefined)).toBe('');
  });

  it('formats bytes', () => {
    expect(formatDataSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatDataSize(2048)).toBe('2 KB');
  });

  it('formats megabytes', () => {
    expect(formatDataSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('formatMaxAge', () => {
  it('formats minutes', () => {
    expect(formatMaxAge(1_800_000)).toBe('30 min');
  });

  it('formats 1 hour as "Hourly"', () => {
    expect(formatMaxAge(3_600_000)).toBe('Hourly');
  });

  it('formats multiple hours', () => {
    expect(formatMaxAge(14_400_000)).toBe('4 hours');
  });
});

describe('sortVarietiesByOrder', () => {
  it('sorts entries by COOKIE_ORDER position', () => {
    const entries: [string, number][] = [
      ['TREFOILS', 3],
      ['THIN_MINTS', 5]
    ];
    const sorted = sortVarietiesByOrder(entries);
    // THIN_MINTS comes before TREFOILS in COOKIE_ORDER
    expect(sorted[0][0]).toBe('THIN_MINTS');
    expect(sorted[1][0]).toBe('TREFOILS');
  });

  it('puts unknown varieties after known ones', () => {
    const entries: [string, number][] = [
      ['UNKNOWN_COOKIE', 1],
      ['THIN_MINTS', 5]
    ];
    const sorted = sortVarietiesByOrder(entries);
    expect(sorted[0][0]).toBe('THIN_MINTS');
    expect(sorted[1][0]).toBe('UNKNOWN_COOKIE');
  });
});

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(32.7, -117.1, 32.7, -117.1)).toBe(0);
  });

  it('calculates roughly correct distance between known points', () => {
    // San Diego to Los Angeles ≈ 120 miles
    const dist = haversineDistance(32.7157, -117.1611, 34.0522, -118.2437);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(140);
  });
});

describe('countBoothsNeedingDistribution', () => {
  function makeReservation(overrides: {
    reservationType?: string;
    isDistributed?: boolean;
    date?: string;
    endTime?: string;
  }): BoothReservationImported {
    return {
      booth: {
        id: 1,
        storeName: 'Test',
        reservationType: overrides.reservationType || 'FCFS',
        isDistributed: overrides.isDistributed || false,
        locationId: 1
      },
      timeslot: {
        date: overrides.date || '2020-01-01',
        startTime: '10:00',
        endTime: overrides.endTime || '12:00'
      }
    };
  }

  it('returns 0 for empty array', () => {
    expect(countBoothsNeedingDistribution([])).toBe(0);
  });

  it('counts past undistributed booths', () => {
    const reservations = [makeReservation({ date: '2020-01-01' })];
    expect(countBoothsNeedingDistribution(reservations)).toBe(1);
  });

  it('excludes already distributed booths', () => {
    const reservations = [makeReservation({ date: '2020-01-01', isDistributed: true })];
    expect(countBoothsNeedingDistribution(reservations)).toBe(0);
  });

  it('excludes virtual booth reservations', () => {
    const reservations = [makeReservation({ date: '2020-01-01', reservationType: 'virtual' })];
    expect(countBoothsNeedingDistribution(reservations)).toBe(0);
  });
});

describe('isVirtualBooth', () => {
  it('returns true for "virtual" (case-insensitive)', () => {
    expect(isVirtualBooth('virtual')).toBe(true);
    expect(isVirtualBooth('VIRTUAL')).toBe(true);
    expect(isVirtualBooth('Virtual Booth')).toBe(true);
  });

  it('returns false for LOTTERY', () => {
    expect(isVirtualBooth('LOTTERY')).toBe(false);
  });

  it('returns false for FCFS', () => {
    expect(isVirtualBooth('FCFS')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isVirtualBooth(undefined)).toBe(false);
  });
});

describe('isPhysicalVariety', () => {
  it('returns true for THIN_MINTS', () => {
    expect(isPhysicalVariety('THIN_MINTS')).toBe(true);
  });

  it('returns false for COOKIE_SHARE', () => {
    expect(isPhysicalVariety('COOKIE_SHARE')).toBe(false);
  });
});

describe('todayMidnight', () => {
  it('returns a date with zeroed time components', () => {
    const d = todayMidnight();
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it("returns today's date", () => {
    const d = todayMidnight();
    const now = new Date();
    expect(d.getFullYear()).toBe(now.getFullYear());
    expect(d.getMonth()).toBe(now.getMonth());
    expect(d.getDate()).toBe(now.getDate());
  });
});
