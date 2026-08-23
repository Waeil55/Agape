import { describe, it, expect } from 'vitest';
import { tripCalendarDateKey, tripMatchesTodayOrTomorrow } from './tripDate';

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
