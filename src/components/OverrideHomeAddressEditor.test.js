import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadGoogleMapsApi } = vi.hoisted(() => ({ loadGoogleMapsApi: vi.fn() }));
vi.mock('../hooks/useGoogleMaps', () => ({ loadGoogleMapsApi }));

import { getOverrideHomePolicyUpdates, verifyOverrideHomePolicy } from './OverrideHomeAddressEditor';

describe('shared override home verification', () => {
  beforeEach(() => loadGoogleMapsApi.mockReset());

  it('blocks incomplete addresses before calling Google', async () => {
    await expect(verifyOverrideHomePolicy({ homeAddress: '100 Main St' })).rejects.toThrow('street address, city, state, and valid ZIP');
    expect(loadGoogleMapsApi).not.toHaveBeenCalled();
  });

  it('verifies one address while preserving the rest of the override policy', async () => {
    const result = {
      formatted_address: '10409 Parmer Cir, Fishers, IN 46038, USA',
      address_components: [
        { long_name: '10409', types: ['street_number'] },
        { long_name: 'Parmer Circle', types: ['route'] },
        { long_name: 'Fishers', types: ['locality'] },
        { long_name: 'Indiana', short_name: 'IN', types: ['administrative_area_level_1'] },
        { long_name: '46038', types: ['postal_code'] },
      ],
      geometry: { location: { lat: () => 39.993689, lng: () => -85.988494 } },
    };
    loadGoogleMapsApi.mockResolvedValue({
      Geocoder: function Geocoder() { return { geocode: (request, callback) => callback([result], 'OK') }; },
    });

    await expect(verifyOverrideHomePolicy({
      homeAddress: '10409 Parmer Cir',
      homeCity: 'Fishers',
      homeState: 'IN',
      homeZip: '46038',
      unloadedRate: 1.25,
    })).resolves.toMatchObject({
      homeAddress: '10409 Parmer Circle',
      homeCity: 'Fishers',
      homeState: 'IN',
      homeZip: '46038',
      homeLat: 39.993689,
      homeLng: -85.988494,
      homeFormattedAddress: result.formatted_address,
      unloadedRate: 1.25,
    });
  });

  it('returns only shared home fields for fast report updates', () => {
    const updates = getOverrideHomePolicyUpdates({
      homeAddress: '10409 Parmer Cir',
      homeCity: 'Fishers',
      homeState: 'IN',
      homeZip: '46038',
      unloadedRate: 99,
    });
    expect(updates).toMatchObject({ homeAddress: '10409 Parmer Cir', homeCity: 'Fishers', homeState: 'IN', homeZip: '46038' });
    expect(updates).not.toHaveProperty('unloadedRate');
  });
});
