import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMock = vi.hoisted(() => ({
  db: {},
  deleteDoc: vi.fn(),
  doc: vi.fn((_db, collectionName, docId) => `${collectionName}/${docId}`),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  setDoc: vi.fn(),
}));

const localDBMock = vi.hoisted(() => {
  const normalizeSyncOwnership = vi.fn((value = {}) => {
    const tenantId = typeof value.tenantId === 'string' ? value.tenantId.trim() : '';
    const userId = typeof value.userId === 'string' ? value.userId.trim() : '';
    if (!tenantId || !userId) throw new TypeError('ownership required');
    return { tenantId, userId };
  });
  return {
    completeSyncOperation: vi.fn(),
    deadLetterSyncOperation: vi.fn(),
    failSyncOperation: vi.fn(),
    getPendingSyncOperations: vi.fn(),
    getSyncQueueStatus: vi.fn(),
    normalizeSyncOwnership,
    syncOperationBelongsTo: vi.fn((operation, ownership) => {
      try {
        const actual = normalizeSyncOwnership(operation);
        const expected = normalizeSyncOwnership(ownership);
        return actual.tenantId === expected.tenantId && actual.userId === expected.userId;
      } catch {
        return false;
      }
    }),
  };
});

vi.mock('../config/firebase', () => firebaseMock);
vi.mock('../utils/localDB', () => localDBMock);

import {
  isPermanentSyncFailure,
  PermanentSyncError,
  SYNC_QUEUE_ONLINE_DELAY_MS,
  SYNC_QUEUE_PROCESS_INTERVAL_MS,
  SyncQueueProcessor,
} from './syncQueueProcessor';

const OWNER = Object.freeze({ tenantId: 'agape-care', userId: 'user-1' });

function operation(overrides = {}) {
  return {
    id: 1,
    type: 'setDoc',
    collection: 'trips',
    docId: 'trip-1',
    data: { status: 'Completed' },
    status: 'pending',
    nextRetryAt: '2000-01-01T00:00:00.000Z',
    ...OWNER,
    ...overrides,
  };
}

function startedProcessor() {
  const processor = new SyncQueueProcessor();
  processor._started = true;
  return processor;
}

function authenticatedStartedProcessor() {
  const processor = new SyncQueueProcessor();
  processor.setAuthContext(OWNER);
  processor._started = true;
  return processor;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  localDBMock.getPendingSyncOperations.mockResolvedValue([]);
  localDBMock.getSyncQueueStatus.mockResolvedValue({
    pending: 0,
    deadLetter: 0,
    total: 0,
    oldestPendingAt: null,
    lastDeadLetterAt: null,
  });
});

describe('SyncQueueProcessor ownership and terminal failure handling', () => {
  it('retries queued global writes promptly after connectivity returns', () => {
    expect(SYNC_QUEUE_PROCESS_INTERVAL_MS).toBeLessThanOrEqual(5000);
    expect(SYNC_QUEUE_ONLINE_DELAY_MS).toBeLessThanOrEqual(250);
  });

  it('does not read or execute the queue without verified auth context', async () => {
    const processor = startedProcessor();

    await processor.processNow();

    expect(localDBMock.getPendingSyncOperations).not.toHaveBeenCalled();
    expect(firebaseMock.setDoc).not.toHaveBeenCalled();
    await expect(processor.getStatus()).resolves.toMatchObject({
      state: 'blocked',
      reason: 'verified_auth_context_required',
    });
  });

  it('executes only operations whose tenant and user both match current context', async () => {
    const processor = authenticatedStartedProcessor();
    localDBMock.getPendingSyncOperations.mockResolvedValue([
      operation({ id: 1, tenantId: 'different-tenant' }),
      operation({ id: 2 }),
    ]);

    await processor.processNow();

    expect(firebaseMock.setDoc).toHaveBeenCalledTimes(1);
    expect(firebaseMock.setDoc).toHaveBeenCalledWith(
      'trips/trip-1',
      expect.objectContaining({ status: 'Completed' }),
      { merge: true },
    );
    expect(localDBMock.completeSyncOperation).toHaveBeenCalledTimes(1);
    expect(localDBMock.completeSyncOperation).toHaveBeenCalledWith(2);
  });

  it('repairs undefined fields in an existing queued payload before replay', async () => {
    const processor = authenticatedStartedProcessor();
    localDBMock.getPendingSyncOperations.mockResolvedValue([
      operation({
        data: {
          status: 'Cancelled',
          cancellationReason: undefined,
          evidence: ['saved', undefined],
        },
      }),
    ]);

    await processor.processNow();

    expect(firebaseMock.setDoc).toHaveBeenCalledWith(
      'trips/trip-1',
      expect.objectContaining({
        status: 'Cancelled',
        evidence: ['saved', null],
      }),
      { merge: true },
    );
    const savedPayload = firebaseMock.setDoc.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(savedPayload, 'cancellationReason')).toBe(false);
    expect(localDBMock.completeSyncOperation).toHaveBeenCalledWith(1);
  });

  it('does not replay an outbox concurrently in another browser tab', async () => {
    const request = vi.fn(async (_name, _options, callback) => callback(null));
    vi.stubGlobal('navigator', { onLine: true, locks: { request } });
    const processor = authenticatedStartedProcessor();
    localDBMock.getPendingSyncOperations.mockResolvedValue([operation()]);

    await processor.processNow();

    expect(request).toHaveBeenCalledWith(
      'agape-sync-queue:agape-care:user-1',
      { mode: 'exclusive', ifAvailable: true },
      expect.any(Function),
    );
    expect(localDBMock.getPendingSyncOperations).not.toHaveBeenCalled();
    expect(firebaseMock.setDoc).not.toHaveBeenCalled();
  });

  it('dead-letters legacy ownerless operations without any Firebase call', async () => {
    const processor = authenticatedStartedProcessor();
    localDBMock.getPendingSyncOperations.mockResolvedValue([
      operation({ tenantId: undefined, userId: undefined }),
    ]);

    await processor.processNow();

    expect(firebaseMock.setDoc).not.toHaveBeenCalled();
    expect(localDBMock.deadLetterSyncOperation).toHaveBeenCalledWith(
      1,
      expect.any(PermanentSyncError),
      'invalid_ownership',
    );
  });

  it('dead-letters permanent permission failures instead of retrying forever', async () => {
    const processor = authenticatedStartedProcessor();
    const permissionError = Object.assign(new Error('Denied'), { code: 'permission-denied' });
    localDBMock.getPendingSyncOperations.mockResolvedValue([operation()]);
    firebaseMock.setDoc.mockRejectedValue(permissionError);

    await processor.processNow();

    expect(localDBMock.deadLetterSyncOperation).toHaveBeenCalledWith(
      1,
      permissionError,
      'permanent_validation_or_permission',
    );
    expect(localDBMock.failSyncOperation).not.toHaveBeenCalled();
  });

  it('keeps transient availability failures in the retry queue', async () => {
    const processor = authenticatedStartedProcessor();
    const transientError = Object.assign(new Error('Network unavailable'), { code: 'unavailable' });
    localDBMock.getPendingSyncOperations.mockResolvedValue([operation()]);
    firebaseMock.setDoc.mockRejectedValue(transientError);

    await processor.processNow();

    expect(localDBMock.failSyncOperation).toHaveBeenCalledWith(1, transientError);
    expect(localDBMock.deadLetterSyncOperation).not.toHaveBeenCalled();
  });

  it('classifies local validation and namespaced Firebase permission codes as permanent', () => {
    expect(isPermanentSyncFailure(new PermanentSyncError('Invalid payload'))).toBe(true);
    expect(isPermanentSyncFailure({ code: 'firestore/permission-denied' })).toBe(true);
    expect(isPermanentSyncFailure({ code: 'unavailable' })).toBe(false);
  });

  it('exposes owner-scoped pending and dead-letter status', async () => {
    const processor = authenticatedStartedProcessor();
    localDBMock.getSyncQueueStatus.mockResolvedValue({
      pending: 2,
      deadLetter: 1,
      total: 3,
      oldestPendingAt: '2026-08-11T10:00:00.000Z',
      lastDeadLetterAt: '2026-08-11T10:05:00.000Z',
    });

    await expect(processor.getStatus()).resolves.toMatchObject({
      state: 'attention_required',
      pending: 2,
      deadLetter: 1,
      total: 3,
    });
    expect(localDBMock.getSyncQueueStatus).toHaveBeenCalledWith(OWNER);
  });
});
