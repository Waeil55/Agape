import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const hookPath = fileURLToPath(new URL('../hooks/useFirestoreAppData.js', import.meta.url));
const appPath = fileURLToPath(new URL('../App.jsx', import.meta.url));

describe('trip archive and corrected re-upload persistence contract', () => {
  it('uses one serialized targeted archive API instead of two delayed list writes', () => {
    const app = readFileSync(appPath, 'utf8');
    const archiveStart = app.indexOf('const executeDeleteTrip = async');
    const archiveEnd = app.indexOf('const requestBulkDelete', archiveStart);
    const archiveFlow = app.slice(archiveStart, archiveEnd);
    expect(archiveFlow).toContain('await archiveTripsById([tripId])');
    expect(archiveFlow).not.toContain('setTimeout');
    expect(archiveFlow).not.toContain('setTrashedTrips');
  });

  it('serializes archive and import and writes only selected archive-state patches', () => {
    const hook = readFileSync(hookPath, 'utf8');
    expect(hook).toContain('return enqueueTripPersistence(async () => {');
    expect(hook).toContain('plan.archivePatches.forEach');
    expect(hook).toContain("archiveState: patch.archiveState");
    expect(hook).toContain("await writeTripsToCollection(importedTrips, activeTenantId, { strictAtomic: true })");
    expect(hook).not.toContain('deleteDocsById(TRIPS_COLLECTION, corruptedIds)');
  });

  it('routes uploaded trips through the atomic reactivation API', () => {
    const app = readFileSync(appPath, 'utf8');
    expect(app).toContain('const result = await persistUploadedTrips(newTrips);');
    expect(app).toContain('onTripsCreated={handleUploadedTrips}');
  });
});
