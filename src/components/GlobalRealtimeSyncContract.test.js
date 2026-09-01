import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('global realtime synchronization contract', () => {
  it('publishes only changed shared records while retaining global listeners', () => {
    const hook = read('src/hooks/useFirestoreAppData.js');
    expect(hook).toContain("setupListener(collection(db, TRIPS_COLLECTION), applyTripsSnapshot, 'Trips')");
    expect(hook).toContain('applyFirestoreDocumentChanges(');
    expect(hook).toContain('planCollectionMutations(previousValue || [], sanitized');
    expect(hook).toContain('writeTripsToCollection(mutationPlan.upserts, activeTenantId)');
    expect(hook).toContain('writeAssignmentsToCollection(mutationPlan.upserts, activeTenantId, priorChangedRecords)');
    expect(hook).toContain("collection: 'assignments'");
    expect(hook).toContain('isPermanentSyncFailure(error)');
    expect(hook).toContain('rollbackOptimisticValue(');
    expect(hook).toContain('new Set(archivedTrips.map(t => t.id))');
    expect(hook).not.toContain('writeAssignmentsToCollection(dataRef.current.trips');
    expect(hook).not.toContain('writeDriversToCollection(dataRef.current.drivers');
  });

  it('keeps users and per-user settings live across devices', () => {
    const app = read('src/App.jsx');
    const usersPage = read('src/components/UsersPage.jsx');
    const hook = read('src/hooks/useFirestoreAppData.js');
    expect(app).toContain("return onSnapshot(doc(db, 'users', uid)");
    expect(app).toContain('remoteSettingsApplyRef.current = true');
    expect(usersPage).toContain("return onSnapshot(collection(db, 'users')");
    expect(usersPage).toContain('snapshot.docChanges({ includeMetadataChanges: false })');
    expect(app).toContain('addLog({');
    expect(app).not.toContain("setLogs(prev => [{ t: title");
    expect(hook).not.toContain('const setLogs = useCallback');
    expect(hook).toContain("enqueueFieldPersistence('logs', async ()");
    expect(hook).toContain("collection: 'logs'");
  });

  it('serializes edits by shared field so rapid saves preserve invocation order', () => {
    const hook = read('src/hooks/useFirestoreAppData.js');
    expect(hook).toContain("enqueueFieldPersistence('trips'");
    expect(hook).toContain("enqueueFieldPersistence('drivers'");
    expect(hook).toContain("enqueueFieldPersistence('dispatchers'");
    expect(hook).toContain("enqueueFieldPersistence('vehicles'");
    expect(hook).toContain("enqueueFieldPersistence('trips', async ()");
    expect(hook).toContain("enqueueFieldPersistence('drivers', async ()");
  });
});
