import { describe, expect, it } from 'vitest';
import { buildGlobalSearchResults } from './GlobalEntitySearch';

const data = {
  trips: [{ id: 'trip-1', bookingId: 'BK-900', patient: 'Jamie Rider', pickupPhone: '3175550100' }],
  trashedTrips: [{ id: 'trip-2', bookingId: 'BK-ARCHIVE', patient: 'Archived Person' }],
  drivers: [{ id: 'driver-1', name: 'Alex Driver', vehicle: 'Unit 12' }],
  vehicles: [{ id: 'vehicle-1', plate: 'AGP123', make: 'Ford', model: 'Transit' }],
};

describe('global operational search', () => {
  it('searches active and archived trips without changing data', () => {
    expect(buildGlobalSearchResults({ query: 'BK-900', ...data }).map((entry) => entry.type)).toEqual(['trip']);
    expect(buildGlobalSearchResults({ query: 'archive', ...data }).map((entry) => entry.type)).toEqual(['archive']);
  });

  it('searches drivers and vehicles and requires two characters', () => {
    expect(buildGlobalSearchResults({ query: 'Unit 12', ...data })[0].type).toBe('driver');
    expect(buildGlobalSearchResults({ query: 'AGP123', ...data })[0].type).toBe('vehicle');
    expect(buildGlobalSearchResults({ query: 'A', ...data })).toEqual([]);
  });

  it('caps results to protect palette performance', () => {
    const trips = Array.from({ length: 30 }, (_, id) => ({ id: `t-${id}`, patient: `Shared ${id}` }));
    expect(buildGlobalSearchResults({ query: 'shared', trips, limit: 8 })).toHaveLength(8);
  });

  it('ranks the driver profile above trips that only match its assignment name', () => {
    const driver = { id: 'd-1', name: 'waeil2' };
    const trips = Array.from({ length: 20 }, (_, id) => ({ id: `t-${id}`, patient: `Passenger ${id}`, driverName: 'waeil2' }));
    expect(buildGlobalSearchResults({ query: 'waeil2', drivers: [driver], trips, limit: 10 })[0].type).toBe('driver');
  });
});
