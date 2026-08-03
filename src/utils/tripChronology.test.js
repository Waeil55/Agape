import { describe, expect, it } from 'vitest';
import { compareTripsByCompletionAscending, getTripCompletionSortValue } from './tripChronology';

describe('mobile history and report chronology', () => {
  it('lists the first completed trip first even when its scheduled time was later', () => {
    const trips = [
      { id: 'later', date: '2026-08-02', time: '4:00 AM', completedAt: '2026-08-02T08:45:00' },
      { id: 'first', date: '2026-08-02', time: '10:00 AM', completedAt: '2026-08-02T06:15:00' },
    ];
    expect(trips.sort(compareTripsByCompletionAscending).map((trip) => trip.id)).toEqual(['first', 'later']);
  });

  it('does not let a later audit update reorder an earlier completed trip', () => {
    const trips = [
      {
        id: 'first',
        date: '2026-08-02',
        completedAt: '2026-08-02T06:15:00',
        updatedAt: '2026-08-02T23:59:00',
      },
      { id: 'second', date: '2026-08-02', completedAt: '2026-08-02T07:00:00' },
    ];
    expect(trips.sort(compareTripsByCompletionAscending).map((trip) => trip.id)).toEqual(['first', 'second']);
  });

  it('uses actual dropoff, then pickup, then scheduled time when completion is unavailable', () => {
    const trips = [
      { id: 'scheduled', date: '2026-08-02', time: '9:00 AM' },
      { id: 'pickup', date: '2026-08-02', arrivalTime: '2026-08-02T08:00:00' },
      { id: 'dropoff', date: '2026-08-02', arrivalDropoffTime: '2026-08-02T07:00:00' },
    ];
    expect(trips.sort(compareTripsByCompletionAscending).map((trip) => trip.id)).toEqual(['dropoff', 'pickup', 'scheduled']);
  });

  it('keeps the edited row position frozen until the save settles', () => {
    const first = { id: 'first', date: '2026-08-02', completedAt: '2026-08-02T06:00:00' };
    const edited = { id: 'edited', date: '2026-08-02', completedAt: '2026-08-02T12:00:00' };
    const overrides = { edited: getTripCompletionSortValue({ ...edited, completedAt: '2026-08-02T06:30:00' }) };
    expect([edited, first].sort((a, b) => compareTripsByCompletionAscending(a, b, overrides)).map((trip) => trip.id))
      .toEqual(['first', 'edited']);
  });
});
