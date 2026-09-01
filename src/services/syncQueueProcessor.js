import { db, doc, setDoc, serverTimestamp, deleteDoc } from '../config/firebase';
import {
  completeSyncOperation,
  deadLetterSyncOperation,
  failSyncOperation,
  getPendingSyncOperations,
  getSyncQueueStatus,
  normalizeSyncOwnership,
  syncOperationBelongsTo,
} from '../utils/localDB';

export const SYNC_QUEUE_PROCESS_INTERVAL_MS = 5000;
export const SYNC_QUEUE_ONLINE_DELAY_MS = 250;
const PERMANENT_FIREBASE_CODES = new Set([
  'already-exists', 'failed-precondition', 'invalid-argument', 'not-found',
  'out-of-range', 'permission-denied', 'unauthenticated', 'unimplemented',
]);

export class PermanentSyncError extends Error {
  constructor(message, code = 'invalid-sync-operation') {
    super(message);
    this.name = 'PermanentSyncError';
    this.code = code;
  }
}

export function isPermanentSyncFailure(error) {
  if (error instanceof PermanentSyncError) return true;
  const normalizedCode = String(error?.code || '').replace(/^firestore\//, '');
  return PERMANENT_FIREBASE_CODES.has(normalizedCode);
}

export class SyncQueueProcessor {
  constructor() {
    this._timer = null;
    this._onlineTimer = null;
    this._processing = false;
    this._started = false;
    this._onProcess = null;
    this._authContext = null;
    this._handleOnline = null;
  }

  setAuthContext(context) {
    this._authContext = context ? normalizeSyncOwnership(context) : null;
  }

  start() {
    if (this._started) return;
    this._started = true;
    void this.processNow();
    this._timer = setInterval(() => {
      if (this._started && navigator.onLine && !this._processing) void this.processNow();
    }, SYNC_QUEUE_PROCESS_INTERVAL_MS);
    this._handleOnline = () => {
      if (this._started && !this._processing) {
        this._onlineTimer = setTimeout(() => void this.processNow(), SYNC_QUEUE_ONLINE_DELAY_MS);
      }
    };
    window.addEventListener('online', this._handleOnline);
  }

  stop() {
    this._started = false;
    this._authContext = null;
    if (this._timer) clearInterval(this._timer);
    if (this._onlineTimer) clearTimeout(this._onlineTimer);
    this._timer = null;
    this._onlineTimer = null;
    if (this._handleOnline) window.removeEventListener('online', this._handleOnline);
    this._handleOnline = null;
  }

  onProcess(callback) {
    this._onProcess = callback;
  }

  async processNow() {
    if (!this._started || this._processing || !navigator.onLine || !this._authContext) return;
    const ownership = { ...this._authContext };
    const run = async (lock) => {
      if (lock === null) return;
      await this._processQueue(ownership);
    };
    if (navigator.locks?.request) {
      await navigator.locks.request(
        `agape-sync-queue:${ownership.tenantId}:${ownership.userId}`,
        { mode: 'exclusive', ifAvailable: true },
        run,
      );
      return;
    }
    await run(undefined);
  }

  async getStatus() {
    if (!this._authContext) {
      return { state: 'blocked', reason: 'verified_auth_context_required', pending: 0, deadLetter: 0, total: 0 };
    }
    const status = await getSyncQueueStatus(this._authContext);
    return {
      state: status.deadLetter > 0 ? 'attention_required' : status.pending > 0 ? 'syncing' : 'ready',
      ...status,
    };
  }

  async _processQueue(ownership) {
    if (this._processing) return;
    this._processing = true;
    try {
      const pending = await getPendingSyncOperations(ownership);
      for (const operation of pending) {
        if (!navigator.onLine || !this._authContext || !syncOperationBelongsTo(this._authContext, ownership)) break;
        try {
          normalizeSyncOwnership(operation);
        } catch (error) {
          const permanentError = new PermanentSyncError(error.message, 'invalid-ownership');
          await deadLetterSyncOperation(operation.id, permanentError, 'invalid_ownership');
          this._onProcess?.({ type: 'blocked', op: operation, error: permanentError.message });
          continue;
        }
        if (!syncOperationBelongsTo(operation, ownership)) continue;
        if (operation.nextRetryAt) {
          const retryAt = operation.nextRetryAt?.toDate
            ? operation.nextRetryAt.toDate()
            : new Date(operation.nextRetryAt);
          if (!Number.isNaN(retryAt.getTime()) && retryAt > new Date()) continue;
        }
        try {
          await this._executeOperation(operation);
          await completeSyncOperation(operation.id);
          this._onProcess?.({ type: 'completed', op: operation });
        } catch (error) {
          if (isPermanentSyncFailure(error)) {
            await deadLetterSyncOperation(operation.id, error, 'permanent_validation_or_permission');
            this._onProcess?.({ type: 'blocked', op: operation, error: error.message });
          } else {
            await failSyncOperation(operation.id, error);
            this._onProcess?.({ type: 'failed', op: operation, error: error.message });
          }
        }
      }
    } catch (error) {
      console.error('[SyncQueueProcessor] Processing failed:', error);
    } finally {
      this._processing = false;
    }
  }

  async _executeOperation(operation) {
    switch (operation.type) {
      case 'setField': {
        const documentId = operation.docId ?? operation.field;
        if (!documentId || !operation.field) throw new PermanentSyncError('setField requires docId (or field) and field');
        const reference = operation.collection
          ? doc(db, operation.collection, documentId)
          : doc(db, 'systemConfig', documentId);
        await setDoc(reference, {
          [operation.field]: operation.value,
          updatedAt: serverTimestamp(),
          updatedAtLocal: new Date().toISOString(),
        }, { merge: true });
        return;
      }
      case 'setDoc':
        if (!operation.collection || !operation.docId || !operation.data || typeof operation.data !== 'object') {
          throw new PermanentSyncError('setDoc requires collection, docId, and data');
        }
        {
          const operationData = { ...operation.data };
          if (operation.collection === 'logs' && !operationData.timestamp) {
            operationData.timestamp = serverTimestamp();
          }
          await setDoc(doc(db, operation.collection, operation.docId), {
            ...operationData,
            syncedAt: serverTimestamp(),
            syncedAtLocal: new Date().toISOString(),
          }, { merge: true });
          return;
        }
      case 'deleteDoc':
        if (!operation.collection || !operation.docId) throw new PermanentSyncError('deleteDoc requires collection and docId');
        await deleteDoc(doc(db, operation.collection, operation.docId));
        return;
      default:
        throw new PermanentSyncError(`Unknown sync operation type: ${operation.type}`);
    }
  }
}

export const syncQueueProcessor = new SyncQueueProcessor();
