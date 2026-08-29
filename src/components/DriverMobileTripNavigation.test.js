import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const driverSource = fs.readFileSync(path.join(here, 'DriverPage.jsx'), 'utf8');
const appCss = fs.readFileSync(path.join(here, '..', 'index.css'), 'utf8');
const firebaseSource = fs.readFileSync(path.join(here, '..', 'config', 'firebase.js'), 'utf8');
const appDataSource = fs.readFileSync(path.join(here, '..', 'hooks', 'useFirestoreAppData.js'), 'utf8');

describe('driver mobile active-trip navigation regression', () => {
  it('puts a started active trip back in the bottom navigation', () => {
    expect(driverSource).toContain("items.splice(1, 0, {");
    expect(driverSource).toContain("id: 'active-trip'");
    expect(driverSource).toContain('const openWorkTrip = startedTripNav;');
    expect(driverSource).toContain('if (openWorkTrip) {');
    expect(driverSource).not.toContain('if (openWorkTrip && isTripStarted)');
    expect(driverSource).toContain('setStartedTripNavId(trip.id);');
    expect(driverSource).toContain("status === 'assigned' || status === 'unassigned'");
    expect(driverSource).toContain('setActiveWorkTripId(item.tripId);');
    expect(driverSource).not.toContain('window.confirm(`Go back to');
    expect(driverSource).not.toContain('setShowToast({ message: `Back to ${stepBackTarget.label}` });');
    expect(driverSource).toContain("sublabel: remainingName.join(' ') || 'Open Trip'");
    expect(driverSource).not.toContain('aria-label={`Resume active trip for');
  });

  it('suppresses only odometer carets affected by the transformed mobile dialog', () => {
    expect(driverSource.match(/trip-odometer-input/g)).toHaveLength(4);
    expect(appCss).toContain('.trip-odometer-input');
    expect(appCss).toContain('caret-color');
  });

  it('avoids the corruptible persistent Firestore cache on iOS WebKit', () => {
    expect(firebaseSource).toContain('usesWebKitIndexedDbRiskRuntime');
    expect(firebaseSource).toMatch(/usesWebKitIndexedDbRiskRuntime[\s\S]*localCache: memoryLocalCache\(\)/);
    expect(appDataSource).toContain('Target ID already exists|delete range from database without an in-progress transaction');
    expect(appDataSource).toContain('The local Firestore cache became invalid. Close and reopen Agape Care');
  });
});
