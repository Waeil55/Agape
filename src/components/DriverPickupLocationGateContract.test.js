import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const driver = readFileSync(new URL('./DriverPage.jsx', import.meta.url), 'utf8');
const timeTracking = readFileSync(new URL('../utils/timeTracking.js', import.meta.url), 'utf8');

describe('driver pickup confirmation location contract', () => {
  it('never gates either pickup-confirmation path on GPS or geocoding', () => {
    expect(driver).toContain('getTripPickupLocation(showOdometerPrompt) || driverLocation');
    expect(driver).toContain('getTripPickupLocation(showArrivalConfirm) || driverLocation');
    expect(driver).not.toContain('resolveVerifiedPickupLocation');
    expect(driver).not.toContain('evaluateVerifiedTripWorkEvidence');
    expect(driver).not.toContain('verifiedWorkEvidence');
    expect(driver).not.toContain('pickupCoordinatesSource');
  });

  it('removes the obsolete pickup geofence and all of its blocking messages', () => {
    const combined = `${driver}\n${timeTracking}`;
    expect(combined).not.toContain('OUTSIDE_PICKUP_GEOFENCE');
    expect(combined).not.toContain('MISSING_PICKUP_LOCATION');
    expect(combined).not.toContain('MISSING_DRIVER_GPS');
    expect(combined).not.toContain('Move closer before confirming work');
    expect(combined).not.toContain('Ask dispatch to correct the pickup address before continuing');
    expect(timeTracking).not.toContain('validateArrival');
    expect(timeTracking).not.toContain('ARRIVAL_RADIUS');
  });
});
