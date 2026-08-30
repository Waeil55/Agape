import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(path, 'utf8');

describe('shared home route settings contract', () => {
  it('allows administrators and dispatchers to verify and save one shared home address', () => {
    const settings = read('src/components/SettingsPage.jsx');
    expect(settings).toContain('Home address');
    expect(settings).toContain('This one shared address is used for every driver’s first trip from home and last trip returning home.');
    expect(settings).toContain('Driver-profile addresses are not used for override mileage.');
    expect(settings).toContain('PlacesAutocompleteInput');
    expect(settings).toContain('geocodeHomeAddress(fullHomeAddress)');
    expect(settings).toContain('await updateOverridePolicy(verifiedPolicy)');
    expect(settings).not.toContain('DriverHomeAddressEditor');
    expect(settings).not.toContain('upsertDriverProfile(driver.id');
  });

  it('uses only the shared policy home and the browser driving-route service', () => {
    const desktop = read('src/components/DesktopEnterpriseDashboard.jsx');
    const report = read('src/components/UnloadedTripsReport.jsx');
    const analyzer = read('src/utils/tripCostOverrides.js');
    expect(desktop).not.toContain('drivers={drivers} upsertDriverProfile={upsertDriverProfile} dispatchers={dispatchers}');
    expect(report).toContain('routeDistanceResolver = getGoogleDrivingRouteMiles');
    expect(report).toContain('shared home address in Settings → Override Pricing');
    expect(analyzer).toContain('const getPolicyHome = (policy) =>');
    expect(analyzer).toContain('const home = getPolicyHome(policy);');
    expect(analyzer).not.toContain('const getDriverHome');
  });
});
