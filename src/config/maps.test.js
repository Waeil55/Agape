import { describe, expect, it } from 'vitest';
import { verifyGeocodedAddress } from './maps';

describe('verified trip address coordinates', () => {
  it('accepts finite in-range coordinates when the pickup ZIP matches', () => {
    expect(verifyGeocodedAddress('9602 E Washington St, Indianapolis, IN 46229', {
      lat: 39.774,
      lng: -86.001,
      postalCode: '46229',
    })).toEqual({ lat: 39.774, lng: -86.001 });
  });

  it('fails closed when the geocoder returns a different ZIP', () => {
    expect(verifyGeocodedAddress('9602 E Washington St, Indianapolis, IN 46229', {
      lat: 39.774,
      lng: -86.001,
      postalCode: '46235',
    })).toBeNull();
  });

  it('rejects missing and out-of-range coordinates', () => {
    expect(verifyGeocodedAddress('Indianapolis, IN', { lat: 120, lng: -86 })).toBeNull();
    expect(verifyGeocodedAddress('Indianapolis, IN', { lat: null, lng: -86 })).toBeNull();
  });
});
