import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('offline application data contract', () => {
  it('restores the last local fleet snapshot before realtime Firebase reconnects', () => {
    const hook = readFileSync(new URL('../hooks/useFirestoreAppData.js', import.meta.url), 'utf8');
    expect(hook).toContain("readAppData(activeTenantId, auth.currentUser?.uid || '').then");
    expect(hook).toContain('mergeUnresolvedCachedFields(');
    expect(hook).toContain("remoteFieldsReceived.add('trips')");
    expect(hook).not.toContain('remoteSnapshotReceived');
    expect(hook).not.toContain('loadingTimeoutId');
    expect(hook).toContain('persistLocalSnapshot(');
    expect(hook).toContain('saveRecordWithSyncOperations');
    expect(hook).toContain('syncQueueProcessor.processNow');
  });

  it('queues offline trip progress and driver state writes for reconnect', () => {
    const hook = readFileSync(new URL('../hooks/useFirestoreAppData.js', import.meta.url), 'utf8');
    expect(hook).toContain("collection: DRIVER_TRIP_PROGRESS_COLLECTION");
    expect(hook).toContain("collection: DRIVER_PROFILE_COLLECTION");
    expect(hook).toContain("type: 'setDoc'");
  });
});
