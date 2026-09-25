import { describe, it, expect } from 'vitest';
import { tripCalendarDateKey, tripMatchesTodayOrTomorrow, getTripHistoryDateKey, resolveTripCompletionTimestamp, addDaysToDateKey, calendarDateKeyDaysAgo } from './tripDate';

describe('tripCalendarDateKey', () => {
  it('parses ISO YYYY-MM-DD without UTC shift', () => {
    expect(tripCalendarDateKey('2026-06-30')).toBe('2026-06-30');
    expect(tripCalendarDateKey('2026-01-01')).toBe('2026-01-01');
  });

  it('parses US MM/DD/YYYY format', () => {
    expect(tripCalendarDateKey('06/30/2026')).toBe('2026-06-30');
    expect(tripCalendarDateKey('08-05-2026')).toBe('2026-08-05');
  });

  it('contains corrupt Firestore timestamp objects', () => {
    expect(tripCalendarDateKey({ toDate: () => { throw new Error('corrupt'); } })).toBeUndefined();
  });

  it('returns undefined for null/undefined/empty', () => {
    expect(tripCalendarDateKey(null)).toBeUndefined();
    expect(tripCalendarDateKey(undefined)).toBeUndefined();
    expect(tripCalendarDateKey('')).toBeUndefined();
  });

  it('handles ISO with extra time component', () => {
    expect(tripCalendarDateKey('2026-06-30T10:00:00')).toBe('2026-06-30');
  });

  it('converts UTC instants to the LOCAL calendar day (evening-completion regression)', () => {
    // Real failure: completedAt '2026-08-23T00:45:25.599Z' (8:45 PM EDT Aug 22)
    // was keyed as 2026-08-23 and dropped from the local history window.
    const expected = (() => {
      const d = new Date('2026-08-23T03:45:00Z');
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    expect(tripCalendarDateKey('2026-08-23T03:45:00Z')).toBe(expected);
    expect(tripCalendarDateKey('2026-08-22T14:49:38.292Z')).toBe(
      (() => {
        const d = new Date('2026-08-22T14:49:38.292Z');
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })(),
    );
  });

  it('returns undefined for timestamped ISO that cannot parse', () => {
    expect(tripCalendarDateKey('2026-13-45T99:99:99Z')).toBeUndefined();
  });
});

describe('tripMatchesTodayOrTomorrow', () => {
  it('returns true for undefined date (legacy trips)', () => {
    expect(tripMatchesTodayOrTomorrow(undefined)).toBe(true);
  });

  it('returns true for today', () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    expect(tripMatchesTodayOrTomorrow(key)).toBe(true);
  });
});

describe('getTripHistoryDateKey', () => {
  it('uses the trip service date when there is no completion', () => {
    expect(getTripHistoryDateKey({ date: '2026-09-24' })).toBe('2026-09-24');
  });

  it('anchors to the service date even when completed or updated the next day', () => {
    expect(getTripHistoryDateKey({
      date: '2026-09-24',
      completedAt: '2026-09-25T00:10:00',
    })).toBe('2026-09-24');
  });

  it('never moves a backdated correction onto a much later completion date', () => {
    expect(getTripHistoryDateKey({
      date: '2026-09-10',
      completedAt: '2026-09-25T14:00:00',
    })).toBe('2026-09-10');
  });

  it('falls back to completion date if trip has no service date', () => {
    expect(getTripHistoryDateKey({
      completedAt: '2026-09-25T14:00:00',
    })).toBe('2026-09-25');
  });
});

describe('resolveTripCompletionTimestamp', () => {
  const now = new Date('2026-09-25T14:00:00');

  it('stamps the live moment for a trip scheduled today', () => {
    expect(resolveTripCompletionTimestamp({ date: '2026-09-25' }, now)).toBe(now.toISOString());
  });

  it('anchors a backdated trip to its own recorded dropoff time', () => {
    const result = resolveTripCompletionTimestamp({
      date: '2026-09-24',
      arrivalDropoffTime: '2026-09-24T18:30:00',
    }, now);
    expect(tripCalendarDateKey(result)).toBe('2026-09-24');
  });

  it('anchors a backdated trip with no recorded dropoff time to its own date, not today', () => {
    const result = resolveTripCompletionTimestamp({ date: '2026-09-24' }, now);
    expect(tripCalendarDateKey(result)).toBe('2026-09-24');
  });
});

describe('addDaysToDateKey', () => {
  it('shifts forward and backward across a month boundary', () => {
    expect(addDaysToDateKey('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysToDateKey('2026-10-01', -1)).toBe('2026-09-30');
  });
});

describe('global (device-independent) date resolution', () => {
  it('buckets a UTC timestamp by the fixed operating timezone, not the device clock', () => {
    // 2026-06-15T03:30:00Z is 2026-06-14 23:30 in Indianapolis (EDT, UTC-4).
    // A device set to UTC (or any zone ahead of Indianapolis) must still see
    // this as the 14th, matching every other operator's view of the trip.
    expect(tripCalendarDateKey('2026-06-15T03:30:00.000Z')).toBe('2026-06-14');
  });

  it('keeps calendarDateKeyDaysAgo consistent with the same fixed timezone', () => {
    const from = new Date('2026-06-15T03:30:00.000Z');
    expect(calendarDateKeyDaysAgo(0, from)).toBe('2026-06-14');
    expect(calendarDateKeyDaysAgo(1, from)).toBe('2026-06-13');
  });
});
