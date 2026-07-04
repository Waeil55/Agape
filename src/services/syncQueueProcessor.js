import { db, doc, setDoc, serverTimestamp, deleteDoc } from '../config/firebase';
import { getPendingSyncOperations, completeSyncOperation, failSyncOperation } from '../utils/localDB';

const PROCESS_INTERVAL_MS = 30000;
const RETRY_DELAY_MS = 5000;

class SyncQueueProcessor {
  constructor() {
    this._timer = null;
    this._onlineTimer = null;
    this._processing = false;
    this._started = false;
    this._onProcess = null;
  }

  start() {
    if (this._started) return;
    this._started = true;

    this._processQueue();

    this._timer = setInterval(() => {
      if (this._started && navigator.onLine && !this._processing) {
        this._processQueue();
      }
    }, PROCESS_INTERVAL_MS);

    this._handleOnline = () => {
      if (this._started && !this._processing) {
        this._onlineTimer = setTimeout(() => this._processQueue(), RETRY_DELAY_MS);
      }
    };
    window.addEventListener('online', this._handleOnline);
  }

  stop() {
    this._started = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._onlineTimer) {
      clearTimeout(this._onlineTimer);
      this._onlineTimer = null;
    }
    if (this._handleOnline) {
      window.removeEventListener('online', this._handleOnline);
      this._handleOnline = null;
    }
  }

  onProcess(callback) {
    this._onProcess = callback;
  }

  async _processQueue() {
    if (!this._started || this._processing || !navigator.onLine) return;
    this._processing = true;

    try {
      const pending = await getPendingSyncOperations();
      if (pending.length === 0) return;

      for (const op of pending) {
        if (!navigator.onLine) break;

        if (op.nextRetryAt) {
          const retryAt = op.nextRetryAt?.toDate
            ? op.nextRetryAt.toDate()
            : new Date(op.nextRetryAt);
          if (retryAt > new Date()) continue;
        }

        try {
          await this._executeOperation(op);
          await completeSyncOperation(op.id);
          this._onProcess?.({ type: 'completed', op });
        } catch (err) {
          await failSyncOperation(op.id, err);
          this._onProcess?.({ type: 'failed', op, error: err.message });
        }
      }
    } catch (err) {
      console.error('[SyncQueueProcessor] Processing failed:', err);
    } finally {
      this._processing = false;
    }
  }

  async _executeOperation(op) {
    switch (op.type) {
      case 'setField': {
        const docId = op.docId ?? op.field;
        if (!docId) throw new Error('[SyncQueueProcessor] setField requires op.docId or op.field');
        const ref = op.collection
          ? doc(db, op.collection, docId)
          : doc(db, 'systemConfig', docId);
        await setDoc(ref, {
          [op.field]: op.value,
          updatedAt: serverTimestamp(),
          updatedAtLocal: new Date().toISOString(),
        }, { merge: true });
        break;
      }
      case 'setDoc': {
        if (!op.collection || !op.docId) throw new Error('[SyncQueueProcessor] setDoc missing collection or docId');
        await setDoc(doc(db, op.collection, op.docId), {
          ...op.data,
          syncedAt: serverTimestamp(),
          syncedAtLocal: new Date().toISOString(),
        }, { merge: true });
        break;
      }
      case 'deleteDoc': {
        if (!op.collection || !op.docId) throw new Error('[SyncQueueProcessor] deleteDoc missing collection or docId');
        await deleteDoc(doc(db, op.collection, op.docId));
        break;
      }
      default:
        throw new Error(`[SyncQueueProcessor] Unknown operation type: ${op.type}`);
    }
  }
}

export const syncQueueProcessor = new SyncQueueProcessor();
export default syncQueueProcessor;
