import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(path, 'utf8');

describe('shared home route settings contract', () => {
  it('allows administrators and dispatchers to verify and save one shared home address', () => {
    const settings = read('src/components/SettingsPage.jsx');
    const editor = read('src/components/OverrideHomeAddressEditor.jsx');
    expect(settings).toContain('<OverrideHomeAddressEditor');
    expect(settings).toContain('verifyOverrideHomePolicy(overrideDraft)');
    expect(settings).toContain('await updateOverridePolicy(verifiedPolicy)');
    expect(editor).toContain('This one shared address is used for every driver’s first trip from home and last trip returning home.');
    expect(editor).toContain('Driver-profile addresses are not used for override mileage.');
    expect(editor).toContain('PlacesAutocompleteInput');
    expect(editor).toContain('geocodeHomeAddress(fullHomeAddress)');
  });

  it('adds the shared home editor directly to the override report', () => {
    const report = read('src/components/UnloadedTripsReport.jsx');
    expect(report).toContain('aria-label="Edit shared home address"');
    expect(report).toContain('<OverrideHomeAddressEditor');
    expect(report).toContain('Save home address');
    expect(report).toContain("sharedHomeMissing\n    ? 'Not set'");
    expect(report).toContain('verifyOverrideHomePolicy({');
    expect(report).toContain('updateOverridePolicy(homeUpdates)');
    expect(report).toContain('setBoundaryDistances(new Map())');
  });

  it('uses only the shared policy home and the browser driving-route service', () => {
    const desktop = read('src/components/DesktopEnterpriseDashboard.jsx');
    const report = read('src/components/UnloadedTripsReport.jsx');
    const analyzer = read('src/utils/tripCostOverrides.js');
    expect(desktop).not.toContain('drivers={drivers} upsertDriverProfile={upsertDriverProfile} dispatchers={dispatchers}');
    expect(report).toContain('routeDistanceResolver = getGoogleDrivingRouteMiles');
    expect(report).toContain('Use the Home button above to verify the shared address');
    expect(analyzer).toContain('const getPolicyHome = (policy) =>');
    expect(analyzer).toContain('const home = getPolicyHome(policy);');
    expect(analyzer).not.toContain('const getDriverHome');
  });
});
