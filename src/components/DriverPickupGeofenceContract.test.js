import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const driverSource = readFileSync(new URL('./DriverPage.jsx', import.meta.url), 'utf8');

describe('driver pickup geofence evidence', () => {
  it('re-reads fresh GPS for both pickup confirmation paths', () => {
    expect(driverSource.match(/await requestFreshCurrentLocation\(\)/g)).toHaveLength(2);
  });

  it('never creates circular pickup evidence from the driver GPS fallback', () => {
    expect(driverSource).not.toContain("pickupCoordinatesSource: 'driver_gps_fallback'");
    expect(driverSource).toContain("persistedSource !== 'driver_gps_fallback'");
  });

  it('keeps valid legacy/imported pickup coordinates when geocoding is temporarily unavailable', () => {
    expect(driverSource).toContain('return usablePersisted ? persisted : null;');
  });

  it('binds geocoded pickup coordinates to the exact current address', () => {
    expect(driverSource).toContain('pickupCoordinatesAddress: pickupAddress');
    expect(driverSource).toContain('persistedAddress === pickupAddress');
  });
});
