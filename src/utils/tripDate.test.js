import { describe, it, expect } from 'vitest';
import { tripCalendarDateKey, tripMatchesTodayOrTomorrow, tripMatchesCalendarDay } from './tripDate';

describe('tripCalendarDateKey', () => {
  it('parses ISO YYYY-MM-DD without UTC shift', () => {
    expect(tripCalendarDateKey('2026-06-30')).toBe('2026-06-30');
    expect(tripCalendarDateKey('2026-01-01')).toBe('2026-01-01');
  });

  it('parses US MM/DD/YYYY format', () => {
    expect(tripCalendarDateKey('06/30/2026')).toBe('2026-06-30');
  });

  it('returns undefined for null/undefined/empty', () => {
    expect(tripCalendarDateKey(null)).toBeUndefined();
    expect(tripCalendarDateKey(undefined)).toBeUndefined();
    expect(tripCalendarDateKey('')).toBeUndefined();
  });

  it('handles ISO with extra time component', () => {
    expect(tripCalendarDateKey('2026-06-30T10:00:00')).toBe('2026-06-30');
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
