/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { buildDriverServiceDateBuckets, scopeOperationsTripsByDate } from '../utils/portalSelectors';
import {
  canManageSharedRoutes,
  tripMatchesRouteServiceDate,
  tripsToClients,
} from './RouteSequencer';

describe('trip and route service-date release contract', () => {
  const todayKey = '2026-08-13';
  const tomorrowKey = '2026-08-14';

  it('puts only the exact next local calendar day in Driver Tomorrow', () => {
    const trips = [
      { id: 'today', date: todayKey },
      { id: 'tomorrow', date: tomorrowKey },
      { id: 'history', date: '2026-08-12' },
      { id: 'same-weekday-next-week', date: '2026-08-21' },
      { id: 'invalid', date: 'not-a-date' },
      { id: 'missing' },
    ];

    const buckets = buildDriverServiceDateBuckets(trips, todayKey);

    expect(buckets.todayTrips.map((trip) => trip.id)).toEqual(['today']);
    expect(buckets.tomorrowKey).toBe(tomorrowKey);
    expect(buckets.tomorrowTrips.map((trip) => trip.id)).toEqual(['tomorrow']);
  });

  it('fails closed for Operations selected-date scope and counts invalid dates', () => {
    const result = scopeOperationsTripsByDate([
      { id: 'selected', date: todayKey },
      { id: 'other', date: tomorrowKey },
      { id: 'missing' },
      { id: 'invalid', date: 'not-a-date' },
      { id: 'impossible', date: '2026-99-99' },
    ], todayKey);

    expect(result.scopedTrips.map((trip) => trip.id)).toEqual(['selected']);
    expect(result.excludedInvalidDateTrips).toBe(3);
  });

  it('never mixes a matching weekday from another week into the route pool', () => {
    const selectedTrip = { id: 'selected', patient: 'Selected', date: todayKey, status: 'Assigned' };
    const sameWeekdayLater = { id: 'later', patient: 'Later', date: '2026-08-20', status: 'Assigned' };

    expect(tripMatchesRouteServiceDate(selectedTrip, todayKey)).toBe(true);
    expect(tripMatchesRouteServiceDate(sameWeekdayLater, todayKey)).toBe(false);
    expect(tripMatchesRouteServiceDate({ ...selectedTrip, date: undefined }, todayKey)).toBe(false);
    expect(tripsToClients([selectedTrip, sameWeekdayLater], todayKey).map((trip) => trip.id)).toEqual(['selected']);
  });

  it('keeps shared route mutation admin/dispatcher-only', () => {
    expect(canManageSharedRoutes('admin')).toBe(true);
    expect(canManageSharedRoutes('dispatcher')).toBe(true);
    expect(canManageSharedRoutes('driver')).toBe(false);
  });
});
