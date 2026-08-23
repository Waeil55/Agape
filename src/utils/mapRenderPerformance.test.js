import { describe, expect, it } from 'vitest';
import {
  buildDriverTripBuckets,
  buildRoutePlan,
  buildStopsFingerprint,
  shouldAnimateMapMarkers,
} from './mapRenderPerformance';

describe('map render performance helpers', () => {
  it('indexes exact id and normalized-email assignments without rescanning per driver', () => {
    const drivers = [
      { id: 'a', email: 'A@example.com' },
      { id: 'b', email: 'b@example.com' },
    ];
    const trips = [
      { id: 'id-match', driverId: 'a', driverEmail: 'other@example.com' },
      { id: 'email-match', driverId: 'missing', driverEmail: ' a@EXAMPLE.com ' },
      { id: 'fallback-email', driverId: 'b' },
    ];

    const buckets = buildDriverTripBuckets(trips, drivers);

    expect(buckets.get(drivers[0]).map(trip => trip.id)).toEqual(['id-match', 'email-match']);
    expect(buckets.get(drivers[1]).map(trip => trip.id)).toEqual(['fallback-email']);
  });

  it('creates the same route key for cloned equivalent props', () => {
    const trips = [
      { id: 'one', pickupLat: 39.7, pickupLng: -86.1, dropoffLat: 39.8, dropoffLng: -86.2 },
      { id: 'two', pickupLat: 39.9, pickupLng: -86.3, dropoffLat: 40, dropoffLng: -86.4 },
    ];
    const first = buildRoutePlan(trips, { lat: 39.6, lng: -86 });
    const clone = buildRoutePlan(structuredClone(trips), { lat: 39.6, lng: -86 });

    expect(clone).toEqual(first);
    expect(first.key).toBe('39.6,-86|39.8,-86.2|39.9,-86.3|40,-86.4');
  });

  it('fingerprints only marker-visible stop data', () => {
    const stop = {
      id: 'one-pickup',
      lat: 39.7,
      lng: -86.1,
      label: '1',
      type: 'pickup',
      patient: 'Client',
      address: '100 Main St',
      trip: { bookingId: 'BOOK-1', internalNote: 'not rendered on the map' },
    };

    expect(buildStopsFingerprint([stop])).toBe(buildStopsFingerprint([
      { ...stop, trip: { ...stop.trip, internalNote: 'changed' } },
    ]));
    expect(buildStopsFingerprint([stop])).not.toBe(buildStopsFingerprint([
      { ...stop, address: '200 Main St' },
    ]));
  });

  it('turns off decorative marker animation for touch and reduced-motion devices', () => {
    expect(shouldAnimateMapMarkers()).toBe(true);
    expect(shouldAnimateMapMarkers({ coarsePointer: true })).toBe(false);
    expect(shouldAnimateMapMarkers({ reducedMotion: true })).toBe(false);
  });
});
