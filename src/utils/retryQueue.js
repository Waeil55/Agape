/**
 * @deprecated This module is no longer used. The sync queue processor
 * (src/services/syncQueueProcessor.js) handles offline write retries.
 *
 * RetryQueue — Failed operations isolated, inspected, replayed
 *
 * What Google/Netflix/Uber use:
 * - Dead letter queue for permanently failed operations
 * - Retry with exponential backoff + jitter
 * - Operation inspection and manual replay
 * - Bulk replay of all dead letters
 * - Operation deduplication (don't retry the same op twice)
 *
 * Architecture:
 *   Failed op → Retry Queue (3 attempts) → Dead Letter Queue (inspect/replay)
 *   Retry: 5s → 15s → 45s → move to DLQ
 *   DLQ: persistent, inspectable, replayable
 */

import { db } from '../config/firebase';
import { doc, setDoc, serverTimestamp, deleteDoc } from '../config/firebase';
import { getDB } from './localDB';

const RETRY_STORE = 'retryQueue';
const DLQ_STORE = 'deadLetterQueue';
const MAX_RETRIES = 3;
const BACKOFF_BASE = 5000;
const BACKOFF_MULTIPLIER = 3;
const MAX_BACKOFF = 45000;
const TRIPS_COLLECTION = 'trips';
const TRASHED_TRIPS_COLLECTION = 'trashedTrips';

const sanitizeForFirestore = (value) => JSON.parse(JSON.stringify(value, (_key, item) => item === undefined ? null : item));

const removedIds = (nextRecords = [], previousRecords = []) => {
  const nextIds = new Set((nextRecords || []).filter((record) => record?.id).map((record) => String(record.id)));
  return (previousRecords || [])
    .filter((record) => record?.id && !nextIds.has(String(record.id)))
    .map((record) => String(record.id));
};

async function syncRootTripCollection(collectionName, nextRecords = [], previousRecords = []) {
  await Promise.all([
    ...(nextRecords || [])
      .filter((trip) => trip?.id)
      .map((trip) => setDoc(doc(db, collectionName, String(trip.id)), sanitizeForFirestore(trip), { merge: true })),
    ...removedIds(nextRecords, previousRecords).map((id) => deleteDoc(doc(db, collectionName, id))),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETRY QUEUE
// ═══════════════════════════════════════════════════════════════════════════════

class RetryQueue {
  constructor() {
    this._listeners = new Set();
    this._processing = false;
    this._started = false;
    this._retryTimer = null;
    this._onlineHandler = null;
    this._stats = {
      totalQueued: 0,
      totalRetried: 0,
      totalSucceeded: 0,
      totalDeadLettered: 0,
      totalReplayed: 0,
    };
  }

  /**
   * Start the retry queue processor.
   */
  start() {
    if (this._started) return;
    this._started = true;
    // Process on startup
    this._processQueue();

    // Process when coming back online
    this._onlineHandler = () => this._processQueue();
    window.addEventListener('online', this._onlineHandler);

    // Periodic retry check
    this._retryTimer = setInterval(() => {
      if (navigator.onLine && !this._processing) {
        this._processQueue();
      }
    }, 10000);
  }

  stop() {
    this._started = false;
    if (this._retryTimer) {
      clearInterval(this._retryTimer);
      this._retryTimer = null;
    }
    if (this._onlineHandler) {
      window.removeEventListener('online', this._onlineHandler);
      this._onlineHandler = null;
    }
  }

  /**
   * Add a failed operation to the retry queue.
   */
  async enqueue(operation, error = null) {
    const entry = {
      id: `retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      operation,
      error: error?.message || String(error),
      attempts: 0,
      maxRetries: MAX_RETRIES,
      createdAt: Date.now(),
      lastAttemptAt: null,
      nextRetryAt: Date.now(),
      status: 'pending',
    };

    try {
      const dbConn = await getDB();
      if (dbConn.objectStoreNames.contains(RETRY_STORE)) {
        await dbConn.put(RETRY_STORE, entry, entry.id);
      }
    } catch {
      // IndexedDB not available
    }

    this._stats.totalQueued++;
    this._notify({ type: 'enqueued', entry });
    return entry.id;
  }

  /**
   * Process pending retry operations.
   */
  async _processQueue() {
    if (this._processing || !navigator.onLine) return;
    this._processing = true;

    try {
      const pending = await this._getPending();
      for (const entry of pending) {
        if (Date.now() < entry.nextRetryAt) continue;

        entry.attempts++;
        entry.lastAttemptAt = Date.now();

        try {
          // Execute the operation
          await this._executeOperation(entry.operation);

          // Success — remove from queue
          await this._removeEntry(entry.id);
          this._stats.totalSucceeded++;
          this._notify({ type: 'succeeded', entry });
        } catch (err) {
          entry.error = err.message;

          if (entry.attempts >= entry.maxRetries) {
            // Max retries reached — move to dead letter queue
            await this._moveToDeadLetter(entry);
            this._stats.totalDeadLettered++;
            this._notify({ type: 'dead-lettered', entry });
          } else {
            // Schedule next retry with exponential backoff
            const backoff = Math.min(
              BACKOFF_BASE * Math.pow(BACKOFF_MULTIPLIER, entry.attempts - 1),
              MAX_BACKOFF
            );
            entry.nextRetryAt = Date.now() + backoff;
            entry.status = 'pending';

            try {
              const dbConn = await getDB();
              if (dbConn.objectStoreNames.contains(RETRY_STORE)) {
                await dbConn.put(RETRY_STORE, entry, entry.id);
              }
            } catch {}

            this._stats.totalRetried++;
            this._notify({ type: 'retry-scheduled', entry, nextRetryAt: entry.nextRetryAt });
          }
        }
      }
    } catch (err) {
      console.error('[RetryQueue] Processing failed:', err);
    } finally {
      this._processing = false;
    }
  }

  /**
   * Execute an operation.
   */
  async _executeOperation(operation) {
    if (operation.type === 'setDoc') {
      const { collection: coll, docId, data } = operation;
      await setDoc(doc(db, coll, docId), {
        ...data,
        retriedAt: serverTimestamp(),
      }, { merge: true });
    } else if (operation.type === 'setField') {
      const ref = operation.collection && operation.docId
        ? doc(db, operation.collection, operation.docId)
        : doc(db, 'trips', `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      await setDoc(ref, {
        [operation.field]: operation.value,
        updatedAt: serverTimestamp(),
        updatedAtLocal: new Date().toISOString(),
      }, { merge: true });
    } else if (operation.type === 'setMirroredTrips') {
      const field = operation.field === 'trashedTrips' ? 'trashedTrips' : 'trips';
      const rootCollection = field === 'trashedTrips' ? TRASHED_TRIPS_COLLECTION : TRIPS_COLLECTION;
      const value = operation.value || [];
      await syncRootTripCollection(rootCollection, value, operation.previous || []);
    } else if (operation.type === 'setTripsBatch') {
      const trips = operation.trips || [];
      const trashedTrips = operation.trashedTrips || [];
      await Promise.all([
        syncRootTripCollection(TRIPS_COLLECTION, trips, operation.previousTrips || []),
        syncRootTripCollection(TRASHED_TRIPS_COLLECTION, trashedTrips, operation.previousTrashedTrips || []),
      ]);
    }
  }

  /**
   * Move an operation to the dead letter queue.
   */
  async _moveToDeadLetter(entry) {
    const dlqEntry = {
      ...entry,
      status: 'dead',
      deadLetteredAt: Date.now(),
    };

    try {
      const dbConn = await getDB();
      if (dbConn.objectStoreNames.contains(DLQ_STORE)) {
        await dbConn.put(DLQ_STORE, dlqEntry, dlqEntry.id);
      }
      await this._removeEntry(entry.id);
    } catch {}
  }

  /**
   * Replay a dead letter operation.
   */
  async replayDeadLetter(entryId) {
    try {
      const dbConn = await getDB();
      if (!dbConn.objectStoreNames.contains(DLQ_STORE)) return false;

      const entry = await dbConn.get(DLQ_STORE, entryId);
      if (!entry) return false;

      // Try to execute again
      await this._executeOperation(entry.operation);

      // Success — remove from DLQ
      await dbConn.delete(DLQ_STORE, entryId);
      this._stats.totalReplayed++;
      this._notify({ type: 'replayed', entry });
      return true;
    } catch (err) {
      console.error('[RetryQueue] Replay failed:', err);
      return false;
    }
  }

  /**
   * Replay ALL dead letter operations.
   */
  async replayAllDeadLetters() {
    try {
      const dbConn = await getDB();
      if (!dbConn.objectStoreNames.contains(DLQ_STORE)) return 0;

      const entries = await dbConn.getAll(DLQ_STORE);
      let replayed = 0;

      for (const entry of entries) {
        try {
          await this._executeOperation(entry.operation);
          await dbConn.delete(DLQ_STORE, entry.id);
          replayed++;
        } catch {}
      }

      this._stats.totalReplayed += replayed;
      return replayed;
    } catch {
      return 0;
    }
  }

  /**
   * Get all dead letter entries.
   */
  async getDeadLetters() {
    try {
      const dbConn = await getDB();
      if (!dbConn.objectStoreNames.contains(DLQ_STORE)) return [];
      return await dbConn.getAll(DLQ_STORE);
    } catch {
      return [];
    }
  }

  /**
   * Get pending retry entries.
   */
  async _getPending() {
    try {
      const dbConn = await getDB();
      if (!dbConn.objectStoreNames.contains(RETRY_STORE)) return [];
      return await dbConn.getAll(RETRY_STORE);
    } catch {
      return [];
    }
  }

  /**
   * Remove an entry from the retry queue.
   */
  async _removeEntry(id) {
    try {
      const dbConn = await getDB();
      if (dbConn.objectStoreNames.contains(RETRY_STORE)) {
        await dbConn.delete(RETRY_STORE, id);
      }
    } catch {}
  }

  /**
   * Get retry queue statistics.
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Subscribe to retry queue events.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

export const retryQueue = new RetryQueue();
export default retryQueue;
