import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMock = vi.hoisted(() => ({
  GOOGLE_MAPS_API_KEY: vi.fn(() => 'test-key'),
}));

vi.mock('./firebase', () => firebaseMock);

const successfulMatrix = {
  ok: true,
  json: vi.fn().mockResolvedValue({
    status: 'OK',
    rows: [{
      elements: [{
        status: 'OK',
        duration: { value: 900, text: '15 mins' },
        distance: { value: 16093.44, text: '10 mi' },
      }],
    }],
  }),
};

beforeEach(() => {
  vi.resetModules();
  firebaseMock.GOOGLE_MAPS_API_KEY.mockReturnValue('test-key');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulMatrix));
});

describe('maps request latency guardrails', () => {
  it('bounds external map calls to a short interactive timeout', async () => {
    const { MAPS_REQUEST_TIMEOUT_MS } = await import('./maps');

    expect(MAPS_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(4000);
  });

  it('deduplicates concurrent route lookups and reuses the short-lived result', async () => {
    const { getTravelDuration } = await import('./maps');

    const [first, second] = await Promise.all([
      getTravelDuration('Fishers, IN', 'Indianapolis, IN'),
      getTravelDuration('Fishers, IN', 'Indianapolis, IN'),
    ]);
    const cached = await getTravelDuration('Fishers, IN', 'Indianapolis, IN');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ durationSeconds: 900, distanceMiles: 10 });
    expect(second).toEqual(first);
    expect(cached).toEqual(first);
  });

  it('deduplicates and caches repeated geocoding for the same address', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [{
          formatted_address: '100 Main St, Fishers, IN 46038',
          place_id: 'place-1',
          geometry: { location: { lat: 39.95, lng: -86.02 } },
          address_components: [
            { long_name: '46038', types: ['postal_code'] },
            { long_name: 'Fishers', types: ['locality'] },
            { short_name: 'IN', types: ['administrative_area_level_1'] },
          ],
        }],
      }),
    });
    const { geocodeAddress } = await import('./maps');

    const [first, second] = await Promise.all([
      geocodeAddress('100 Main St, Fishers, IN 46038'),
      geocodeAddress('  100   Main St, Fishers, IN 46038  '),
    ]);
    const cached = await geocodeAddress('100 MAIN ST, FISHERS, IN 46038');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ lat: 39.95, lng: -86.02, postalCode: '46038' });
    expect(second).toEqual(first);
    expect(cached).toEqual(first);
  });
});
