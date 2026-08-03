import { describe, expect, it } from 'vitest';
import { minuteEpoch, normalizeCompletionClocks } from './tripCompletionTimes';

describe('trip completion time normalization', () => {
  it('treats events in the same displayed minute as equal', () => {
    expect(minuteEpoch('2026-08-03T10:35:00-04:00'))
      .toBe(minuteEpoch('2026-08-03T10:35:38-04:00'));
  });

  it('repairs a stale departure draft that predates pickup arrival', () => {
    expect(normalizeCompletionClocks({
      pickupArrival: '04:44', pickupDeparture: '04:16', dropoffArrival: '04:44', now: '04:45',
    })).toEqual({ pickupDeparture: '04:44', dropoffArrival: '04:44' });
  });

  it('preserves valid driver-entered chronology', () => {
    expect(normalizeCompletionClocks({
      pickupArrival: '10:35', pickupDeparture: '10:36', dropoffArrival: '10:40', now: '10:41',
    })).toEqual({ pickupDeparture: '10:36', dropoffArrival: '10:40' });
  });
});
