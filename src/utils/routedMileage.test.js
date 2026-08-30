import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadGoogleMapsApi } = vi.hoisted(() => ({ loadGoogleMapsApi: vi.fn() }));
vi.mock('../hooks/useGoogleMaps', () => ({ loadGoogleMapsApi }));

import { getGoogleDrivingRouteMiles } from './routedMileage';

describe('Google routed mileage', () => {
  beforeEach(() => loadGoogleMapsApi.mockReset());

  it('sums every driving leg and converts meters to miles', async () => {
    const route = vi.fn((request, callback) => callback({ routes: [{ legs: [
      { distance: { value: 1609.344 } },
      { distance: { value: 3218.688 } },
    ] }] }, 'OK'));
    loadGoogleMapsApi.mockResolvedValue({ DirectionsService: function DirectionsService() { return { route }; }, TravelMode: { DRIVING: 'DRIVING' } });

    await expect(getGoogleDrivingRouteMiles('Fishers, IN', 'Boonville, IN')).resolves.toBeCloseTo(3);
    expect(route).toHaveBeenCalledWith(expect.objectContaining({ travelMode: 'DRIVING' }), expect.any(Function));
  });

  it('fails closed with the Google route status', async () => {
    loadGoogleMapsApi.mockResolvedValue({
      DirectionsService: function DirectionsService() { return { route: (request, callback) => callback(null, 'ZERO_RESULTS') }; },
      TravelMode: { DRIVING: 'DRIVING' },
    });
    await expect(getGoogleDrivingRouteMiles('A', 'B')).rejects.toThrow('ZERO_RESULTS');
  });
});
