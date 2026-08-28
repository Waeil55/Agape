import { describe, expect, it } from 'vitest';
import { normalizeCurrentPosition } from './currentLocation';

describe('fresh confirmation GPS normalization', () => {
  it('normalizes browser geolocation with accuracy and capture time', () => {
    expect(normalizeCurrentPosition({
      coords: { latitude: 39.7684, longitude: -86.1581, accuracy: 12 },
      timestamp: Date.parse('2026-08-28T12:00:00.000Z'),
    })).toEqual({
      lat: 39.7684,
      lng: -86.1581,
      accuracy: 12,
      capturedAt: '2026-08-28T12:00:00.000Z',
    });
  });

  it('rejects malformed coordinates', () => {
    expect(normalizeCurrentPosition({ coords: { latitude: 'bad', longitude: -86.1581 } })).toBeNull();
  });
});
