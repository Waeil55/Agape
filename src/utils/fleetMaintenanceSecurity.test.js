import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readProjectFile = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('driver maintenance security contract', () => {
  it('keeps direct driver vehicle writes denied', () => {
    const rules = readProjectFile('firestore.rules');
    expect(rules).toContain('match /fleetVehicles/{vehicleId}');
    expect(rules).toContain('allow write: if signedIn() && isDispatcher();');
  });

  it('uses a scoped callable with recent authentication and assignment verification', () => {
    const source = readProjectFile('functions/index.js');
    expect(source).toContain('exports.recordDriverVehicleMaintenance');
    expect(source).toContain('requireRecentAuthentication(context)');
    expect(source).toContain('Only the driver currently assigned to this vehicle');
    expect(source).toContain('vehicle.maintenance_recorded');
    expect(source).toContain('db.runTransaction');
  });

  it('routes driver settings resets through the callable instead of direct Firestore writes', () => {
    const source = readProjectFile('src/components/DriverPage.jsx');
    expect(source).toContain("httpsCallable(functions, 'recordDriverVehicleMaintenance')");
    expect(source).not.toContain('The maintenance reset was not confirmed by Firestore.');
  });
});
