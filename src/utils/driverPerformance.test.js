import { describe, expect, it } from 'vitest';
import {
  deriveDriverRouteSignals,
  getDriverEtaTargetSignature,
  mergeDriverEtaMeasurements,
  normalizeRouteStopOrder,
  selectDriverEtaTrips,
} from './driverPerformance';

const minutes = (value) => {
  const [hours, minute] = String(value).split(':').map(Number);
  return hours * 60 + minute;
};

describe('driver performance helpers', () => {
  it('normalizes large route plans in stable pickup-before-dropoff order without losing source fields', () => {
    const routeStops = [];
    for (let index = 0; index < 60; index += 1) {
      routeStops.push({ id: `do-${index}`, tripId: `trip-${index}`, stopType: 'DO', label: `Dropoff ${index}`, phone: `317555${String(index).padStart(4, '0')}` });
    }
    for (let index = 0; index < 60; index += 1) {
      routeStops.push({ id: `pu-${index}`, tripId: `trip-${index}`, stopType: 'PU', label: `Pickup ${index}` });
    }

    const result = normalizeRouteStopOrder([{ id: 'origin', type: 'origin', label: 'Office' }, ...routeStops]);

    expect(result).toHaveLength(121);
    for (let index = 0; index < 60; index += 1) {
      expect(result.findIndex((stop) => stop.id === `pu-${index}`)).toBeLessThan(
        result.findIndex((stop) => stop.id === `do-${index}`),
      );
    }
    expect(result.find((stop) => stop.id === 'do-12')?.phone).toBe('3175550012');
    expect(routeStops[0].letter).toBeUndefined();
  });

  it('merges an ETA batch with one immutable update and preserves identity when values did not change', () => {
    const previous = { a: 12, b: 18 };
    const unchanged = mergeDriverEtaMeasurements(previous, [
      { tripId: 'a', minutes: 12 },
      { tripId: 'b', minutes: 18 },
    ]);
    const changed = mergeDriverEtaMeasurements(previous, [
      { tripId: 'a', minutes: 13 },
      { tripId: 'missing', minutes: Number.NaN },
    ]);

    expect(unchanged).toBe(previous);
    expect(changed).not.toBe(previous);
    expect(changed).toEqual({ a: 13, b: 18 });
  });

  it('limits and fingerprints only usable ETA targets deterministically', () => {
    const trips = [
      { id: 'a', pickup: '100 Main', pickupLat: 39.1, pickupLng: -86.1 },
      { id: 'b', pickup: '' },
      { id: 'c', pickup: '200 Main' },
      { id: 'd', pickup: '300 Main' },
      { id: 'e', pickup: '400 Main' },
    ];
    const selected = selectDriverEtaTrips(trips);

    expect(selected.map((trip) => trip.id)).toEqual(['a', 'c', 'd']);
    expect(getDriverEtaTargetSignature(selected)).toBe('a:100 Main:39.1:-86.1|c:200 Main::|d:300 Main::');
  });

  it('derives capped route signals without mutating the active trip collection', () => {
    const trips = [
      { id: 'a', patient: 'A', pickup: '100 Main Street', dropoff: '900 Oak', time: '09:00' },
      { id: 'b', patient: 'B', pickup: '100 Main Street Suite 2', dropoff: '800 Oak', time: '09:15' },
      { id: 'c', patient: 'C', pickup: '100 Main Street Suite 3', dropoff: '700 Oak', time: '09:20' },
    ];
    const snapshot = JSON.stringify(trips);
    const signals = deriveDriverRouteSignals(trips, { timeToMinutes: minutes });

    expect(signals.aiRideShare).toHaveLength(3);
    expect(signals.conflicts).toHaveLength(3);
    expect(JSON.stringify(trips)).toBe(snapshot);
  });
});
