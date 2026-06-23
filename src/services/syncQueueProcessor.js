import { db, doc, setDoc, serverTimestamp, deleteDoc } from '../config/firebase';
import { getPendingSyncOperations, completeSyncOperation, failSyncOperation } from '../utils/localDB';

const PROCESS_INTERVAL_MS = 30000;
const RETRY_DELAY_MS = 5000;

class SyncQueueProcessor {
  constructor() {
    this._timer = null;
    this._processing = false;
    this._started = false;
    this._onProcess = null;
  }

  start() {
    if (this._started) return;
    this._started = true;

    this._processQueue();

    this._timer = setInterval(() => {
      if (navigator.onLine && !this._processing) {
        this._processQueue();
      }
    }, PROCESS_INTERVAL_MS);

    window.addEventListener('online', () => {
      if (!this._processing) {
        setTimeout(() => this._processQueue(), RETRY_DELAY_MS);
      }
    });
  }

  stop() {
    this._started = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  onProcess(callback) {
    this._onProcess = callback;
  }

  async _processQueue() {
    if (this._processing || !navigator.onLine) return;
    this._processing = true;

    try {
      const pending = await getPendingSyncOperations();
      if (pending.length === 0) return;

      for (const op of pending) {
        if (!navigator.onLine) break;

        if (op.nextRetryAt && new Date(op.nextRetryAt) > new Date()) continue;

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
        const ref = op.collection
          ? doc(db, op.collection, op.docId || op.field)
          : doc(db, 'systemConfig', 'syncQueueMeta');
        await setDoc(ref, {
          [op.field]: op.value,
          updatedAt: serverTimestamp(),
          updatedAtLocal: new Date().toISOString(),
        }, { merge: true });
        break;
      }
      case 'setDoc': {
        await setDoc(doc(db, op.collection, op.docId), {
          ...op.data,
          syncedAt: serverTimestamp(),
          syncedAtLocal: new Date().toISOString(),
        }, { merge: true });
        break;
      }
      case 'deleteDoc': {
        await deleteDoc(doc(db, op.collection, op.docId));
        break;
      }
      default:
        console.warn(`[SyncQueueProcessor] Unknown operation type: ${op.type}`, op);
    }
  }
}

export const syncQueueProcessor = new SyncQueueProcessor();
export default syncQueueProcessor;
