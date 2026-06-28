/**
 * @deprecated This module is no longer used. The sync queue processor
 * (src/services/syncQueueProcessor.js) handles offline write retries.
 *
 * BackgroundSyncManager — SW-integrated offline write queue with conflict detection
 *
 * What Google/Uber/Duolingo use:
 * - Service Worker Background Sync API for offline write queuing
 * - Conflict detection using version vectors (last-write-wins + user notification)
 * - Progress tracking with event-driven updates
 * - Automatic retry with adaptive exponential backoff
 * - Cross-session persistence (survives app close + reopen)
 *
 * Architecture:
 *   App writes → IndexedDB queue → SW processes when online → Firestore
 *   Conflict: compare version vectors → higher version wins → notify loser
 */

import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  deleteDoc,
} from '../config/firebase';
import { db } from '../config/firebase';
import {
  queueSyncOperation,
  getPendingSyncOperations,
  completeSyncOperation,
  failSyncOperation,
} from './localDB';

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
// VERSION VECTORS — Conflict detection between tabs/sessions
// ═══════════════════════════════════════════════════════════════════════════════

class VersionVector {
  constructor() {
    this._clocks = new Map(); // field → { clock: number, tabId: string }
    this._tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  getTabId() {
    return this._tabId;
  }

  increment(field) {
    const current = this._clocks.get(field) || { clock: 0, tabId: this._tabId };
    this._clocks.set(field, { clock: current.clock + 1, tabId: this._tabId });
    return current.clock + 1;
  }

  getClock(field) {
    return (this._clocks.get(field) || { clock: 0 }).clock;
  }

  getVector() {
    return Object.fromEntries(this._clocks);
  }

  merge(field, remoteClock, remoteTabId) {
    const local = this._clocks.get(field) || { clock: 0, tabId: this._tabId };
    if (remoteClock > local.clock ||
        (remoteClock === local.clock && remoteTabId > local.tabId)) {
      this._clocks.set(field, { clock: remoteClock, tabId: remoteTabId });
      return true; // Remote is newer
    }
    return false; // Local is newer or equal
  }

  export() {
    return {
      tabId: this._tabId,
      vector: Object.fromEntries(this._clocks),
    };
  }

  import(data) {
    if (data?.tabId) this._tabId = data.tabId;
    if (data?.vector) {
      for (const [field, info] of Object.entries(data.vector)) {
        this._clocks.set(field, info);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND SYNC MANAGER — Core class
// ═══════════════════════════════════════════════════════════════════════════════

class BackgroundSyncManager {
  constructor() {
    this._versionVector = new VersionVector();
    this._listeners = new Set();
    this._processing = false;
    this._started = false;
    this._retryTimer = null;
    this._conflictLog = []; // Recent conflicts for debugging
    this._stats = {
      totalQueued: 0,
      totalSynced: 0,
      totalFailed: 0,
      totalConflicts: 0,
      lastSyncAt: null,
      lastConflictAt: null,
      avgLatencyMs: 0,
      _latencies: [],
    };
  }

  /**
   * Start the background sync manager.
   */
  start() {
    if (this._started) return;
    this._started = true;
    // Process pending ops on startup
    this._processQueue();

    // Listen for SW sync messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_REQUEST' || event.data?.type === 'BACKGROUND_SYNC') {
          this._processQueue();
        }
      });
    }

    // Process queue when coming back online
    window.addEventListener('online', () => {
      this._processQueue();
      this._registerBackgroundSync();
    });

    // Periodic retry (every 30 seconds when online)
    this._retryTimer = setInterval(() => {
      if (navigator.onLine && !this._processing) {
        this._processQueue();
      }
    }, 30000);

    // Register SW background sync
    this._registerBackgroundSync();
  }

  stop() {
    this._started = false;
    if (this._retryTimer) {
      clearInterval(this._retryTimer);
      this._retryTimer = null;
    }
  }

  /**
   * Queue a write operation for background sync.
   * Returns an operation ID for tracking.
   */
  async queue(operation) {
    const opId = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clock = this._versionVector.increment(operation.field || 'general');

    const enrichedOp = {
      ...operation,
      id: opId,
      version: clock,
      tabId: this._versionVector.getTabId(),
      vector: this._versionVector.getVector(),
      queuedAt: new Date().toISOString(),
    };

    await queueSyncOperation(enrichedOp);
    this._stats.totalQueued++;
    this._notify({ type: 'queued', operation: enrichedOp });

    // Try to process immediately if online
    if (navigator.onLine) {
      this._processQueue();
    } else {
      // Register for SW background sync when network returns
      this._registerBackgroundSync();
    }

    return opId;
  }

  /**
   * Process all pending sync operations.
   */
  async _processQueue() {
    if (this._processing || !navigator.onLine) return;
    this._processing = true;
    this._notify({ type: 'sync-start' });

    try {
      const pending = await getPendingSyncOperations();
      if (pending.length === 0) {
        this._processing = false;
        return;
      }

      let synced = 0;
      let failed = 0;
      let conflicts = 0;

      for (const op of pending) {
        // Check if retry time has passed
        if (op.nextRetryAt && new Date(op.nextRetryAt) > new Date()) continue;

        try {
          // Conflict detection: check remote version before writing
          const hasConflict = await this._detectConflict(op);
          if (hasConflict) {
            conflicts++;
            await this._resolveConflict(op);
            continue;
          }

          // Execute the write
          const startTime = performance.now();
          await this._executeWrite(op);
          const latency = Math.round(performance.now() - startTime);

          // Record latency
          this._stats._latencies.push(latency);
          if (this._stats._latencies.length > 100) this._stats._latencies.shift();
          this._stats.avgLatencyMs = Math.round(
            this._stats._latencies.reduce((a, b) => a + b, 0) / this._stats._latencies.length
          );

          await completeSyncOperation(op.id);
          synced++;
        } catch (err) {
          await failSyncOperation(op.id, err);
          failed++;
        }
      }

      this._stats.totalSynced += synced;
      this._stats.totalFailed += failed;
      this._stats.totalConflicts += conflicts;
      this._stats.lastSyncAt = new Date().toISOString();

      this._notify({
        type: 'sync-complete',
        synced,
        failed,
        conflicts,
        total: pending.length,
        stats: { ...this._stats },
      });
    } catch (err) {
      console.error('[BackgroundSync] Queue processing failed:', err);
      this._notify({ type: 'sync-error', error: err.message });
    } finally {
      this._processing = false;
    }
  }

  /**
   * Detect if a remote write has conflicted with our local version.
   */
  async _detectConflict(op) {
    try {
      const ref = op.collection && op.docId
        ? doc(db, op.collection, op.docId)
        : op.collection
          ? doc(db, op.collection, op.field || 'meta')
          : null;
      if (!ref) return false;
      const remoteDoc = await getDoc(ref);
      if (!remoteDoc.exists()) return false;

      const remoteData = remoteDoc.data();
      const remoteVersion = remoteData?._version || 0;
      const localVersion = op.version || 0;

      if (remoteVersion > localVersion && op.field) {
        const remoteFieldVersion = remoteData?._fieldVersions?.[op.field] || 0;
        if (remoteFieldVersion > localVersion) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Resolve a conflict by applying the winning version.
   */
  async _resolveConflict(op) {
    const conflict = {
      operationId: op.id,
      field: op.field,
      queuedAt: op.queuedAt,
      resolvedAt: new Date().toISOString(),
      strategy: 'last-write-wins',
    };

    this._conflictLog.push(conflict);
    if (this._conflictLog.length > 50) this._conflictLog.shift();

    this._stats.lastConflictAt = conflict.resolvedAt;
    this._notify({ type: 'conflict', conflict });

    // Remove from queue (remote wins)
    await completeSyncOperation(op.id);
  }

  /**
   * Execute a write operation against Firestore.
   */
  async _executeWrite(op) {
    if (op.type === 'setField') {
      const ref = op.collection && op.docId
        ? doc(db, op.collection, op.docId)
        : doc(db, 'systemConfig', 'syncQueueMeta');
      await setDoc(ref, {
        [op.field]: op.value,
        updatedAt: serverTimestamp(),
        updatedField: op.field,
        updatedAtLocal: new Date().toISOString(),
        _version: op.version,
        _fieldVersions: { [op.field]: op.version },
        _tabId: op.tabId,
      }, { merge: true });
    } else if (op.type === 'setMirroredTrips') {
      const field = op.field === 'trashedTrips' ? 'trashedTrips' : 'trips';
      const rootCollection = field === 'trashedTrips' ? TRASHED_TRIPS_COLLECTION : TRIPS_COLLECTION;
      const value = op.value || [];
      await syncRootTripCollection(rootCollection, value, op.previous || []);
    } else if (op.type === 'setTripsBatch') {
      const trips = op.trips || [];
      const trashedTrips = op.trashedTrips || [];
      await Promise.all([
        syncRootTripCollection(TRIPS_COLLECTION, trips, op.previousTrips || []),
        syncRootTripCollection(TRASHED_TRIPS_COLLECTION, trashedTrips, op.previousTrashedTrips || []),
      ]);
    } else if (op.type === 'setDoc') {
      await setDoc(doc(db, op.collection, op.docId), {
        ...op.data,
        updatedAt: serverTimestamp(),
        updatedAtLocal: new Date().toISOString(),
      }, { merge: true });
    }
  }

  /**
   * Register for Service Worker Background Sync.
   */
  async _registerBackgroundSync() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.sync) {
        await reg.sync.register('agape-background-sync');
      }
    } catch {
      // SyncManager not supported or SW not ready
    }
  }

  /**
   * Get current sync statistics.
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Get pending operations count.
   */
  async getPendingCount() {
    const pending = await getPendingSyncOperations();
    return pending.length;
  }

  /**
   * Get conflict log.
   */
  getConflictLog() {
    return [...this._conflictLog];
  }

  /**
   * Get version vector for a field.
   */
  getVersion(field) {
    return this._versionVector.getClock(field);
  }

  /**
   * Subscribe to sync events.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  }
}

export const backgroundSync = new BackgroundSyncManager();
export default backgroundSync;
