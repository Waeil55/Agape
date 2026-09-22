/**
 * IndexedDB Data Layer — Enterprise-Grade Local Persistence
 *
 * What Google Maps, Uber, DoorDash do:
 * - Store all data in IndexedDB for instant startup (<10ms)
 * - Write-through: write to local DB + cloud simultaneously
 * - Background sync queue: offline writes retried with exponential backoff
 * - Data survives SW cache clears (only cleared by explicit "Clear Browsing Data")
 *
 * Architecture:
 *   IndexedDB (instant local) ←→ Firestore (cloud source of truth)
 *   On startup: read IndexedDB first, then sync from Firestore in background
 *   On write: write to IndexedDB + Firestore simultaneously
 *   On offline write: queue in IndexedDB, retry when online
 */

import { openDB } from 'idb';
import { localCalendarYmd } from './tripDate';
import { DEFAULT_TENANT_ID, normalizeTenantId } from './tenantScope';
import { sanitizeFirestorePayload } from './firestorePayload';

const DB_NAME = 'agape_fleet_os';
const DB_VERSION = 3;

// Object stores
const STORES = {
  APP_DATA: 'appData',       // Single record: the full app state snapshot
  TRIPS: 'trips',            // Individual trip records for granular access
  TRASHED_TRIPS: 'trashedTrips',
  DRIVERS: 'drivers',
  DISPATCHERS: 'dispatchers',
  VEHICLES: 'vehicles',
  LOGS: 'logs',
  PHONE_NUMBERS: 'phoneNumbers',
  SYNC_QUEUE: 'syncQueue',   // Pending writes for background retry
  DEAD_LETTER_QUEUE: 'deadLetterQueue',
  META: 'meta',              // Metadata: last sync time, schema version, etc.
};

const snapshotKey = (tenantId = DEFAULT_TENANT_ID) => `tenant::${normalizeTenantId(tenantId)}`;

const notifySyncQueueChanged = () => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('agape:sync-queue-changed'));
  }
};

const OUTBOX_COLLECTION_FIELDS = Object.freeze({
  trips: 'trips',
  driverTripProgress: 'trips',
  driverProfiles: 'drivers',
  dispatcherProfiles: 'dispatchers',
  fleetVehicles: 'vehicles',
  logs: 'logs',
});

const applyPendingWrite = (snapshot, write, type = 'setDoc') => {
  const collectionName = String(write?.collection || '');
  const docId = String(write?.docId || '').trim();
  if (!collectionName || !docId) return snapshot;
  if (collectionName === 'systemConfig' && docId === 'phoneNumbers' && type !== 'deleteDoc') {
    return { ...snapshot, phoneNumbers: { ...(snapshot.phoneNumbers || {}), ...(write.data || {}) } };
  }
  const field = OUTBOX_COLLECTION_FIELDS[collectionName];
  if (!field) return snapshot;
  const writeData = { ...(write.data || {}) };
  if (collectionName === 'driverTripProgress') delete writeData.tripId;
  const records = Array.isArray(snapshot[field]) ? snapshot[field] : [];
  if (type === 'deleteDoc') {
    return { ...snapshot, [field]: records.filter((record) => String(record?.id || '') !== docId) };
  }
  const index = records.findIndex((record) => String(record?.id || '') === docId);
  const current = index >= 0 ? records[index] : { id: docId };
  const nextRecord = { ...current, ...writeData, id: docId };
  const nextRecords = index >= 0
    ? records.map((record, recordIndex) => recordIndex === index ? nextRecord : record)
    : [nextRecord, ...records];
  return { ...snapshot, [field]: nextRecords };
};

export function applyPendingSyncOperationsToAppData(snapshot = {}, operations = [], ownership) {
  const normalizedOwnership = normalizeSyncOwnership(ownership);
  return [...(operations || [])]
    .filter((operation) => operation?.status === 'pending' && syncOperationBelongsTo(operation, normalizedOwnership))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .reduce((nextSnapshot, operation) => {
      if (operation.type === 'setDocs') {
        return (operation.writes || []).reduce(
          (current, write) => applyPendingWrite(current, write, 'setDoc'),
          nextSnapshot,
        );
      }
      if (operation.type === 'setDoc' || operation.type === 'deleteDoc') {
        return applyPendingWrite(nextSnapshot, operation, operation.type);
      }
      return nextSnapshot;
    }, snapshot || {});
}

export function normalizeSyncOwnership(value = {}) {
  const tenantId = typeof value.tenantId === 'string' ? value.tenantId.trim().toLowerCase() : '';
  const userId = typeof value.userId === 'string' ? value.userId.trim() : '';
  if (!tenantId) throw new TypeError('tenantId is required for queued sync operations');
  if (!userId) throw new TypeError('userId is required for queued sync operations');
  return { tenantId: normalizeTenantId(tenantId), userId };
}

export function syncOperationBelongsTo(operation, ownership) {
  try {
    const actual = normalizeSyncOwnership(operation);
    const expected = normalizeSyncOwnership(ownership);
    return actual.tenantId === expected.tenantId && actual.userId === expected.userId;
  } catch {
    return false;
  }
}

let dbInstance = null;
let dbPromise = null;

/**
 * Initialize the IndexedDB database. Safe to call multiple times.
 */
export async function getDB() {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create object stores
      if (!db.objectStoreNames.contains(STORES.APP_DATA)) {
        db.createObjectStore(STORES.APP_DATA);
      }
      if (!db.objectStoreNames.contains(STORES.TRIPS)) {
        db.createObjectStore(STORES.TRIPS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.TRASHED_TRIPS)) {
        db.createObjectStore(STORES.TRASHED_TRIPS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.DRIVERS)) {
        db.createObjectStore(STORES.DRIVERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.DISPATCHERS)) {
        db.createObjectStore(STORES.DISPATCHERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.VEHICLES)) {
        db.createObjectStore(STORES.VEHICLES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.LOGS)) {
        db.createObjectStore(STORES.LOGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.PHONE_NUMBERS)) {
        db.createObjectStore(STORES.PHONE_NUMBERS);
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        syncStore.createIndex('status', 'status');
        syncStore.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META);
      }
      // Enterprise stores
      if (!db.objectStoreNames.contains('eventSourcing')) {
        db.createObjectStore('eventSourcing', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('retryQueue')) {
        db.createObjectStore('retryQueue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.DEAD_LETTER_QUEUE)) {
        db.createObjectStore(STORES.DEAD_LETTER_QUEUE, { keyPath: 'id' });
      }
    },
  });

  try {
    dbInstance = await dbPromise;
    return dbInstance;
  } catch (err) {
    dbPromise = null;
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// READ OPERATIONS — Instant local reads
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read the full app state snapshot from IndexedDB.
 * Returns null if nothing stored (first visit).
 */
export async function readAppData(tenantId = DEFAULT_TENANT_ID, userId = '') {
  try {
    const db = await getDB();
    const data = await db.get(STORES.APP_DATA, snapshotKey(tenantId))
      || await db.get(STORES.APP_DATA, 'current');
    if (!userId) return data || null;
    const pending = await db.getAllFromIndex(STORES.SYNC_QUEUE, 'status', 'pending');
    if (!data && pending.length === 0) return null;
    return applyPendingSyncOperationsToAppData(data || {}, pending, {
      tenantId: normalizeTenantId(tenantId),
      userId,
    });
  } catch (err) {
    console.warn('[localDB] readAppData failed:', err);
    return null;
  }
}

/**
 * Read all trips from IndexedDB.
 */
export async function readTrips() {
  try {
    const db = await getDB();
    return await db.getAll(STORES.TRIPS);
  } catch {
    return [];
  }
}

/**
 * Read all trashed trips from IndexedDB.
 */
export async function readTrashedTrips() {
  try {
    const db = await getDB();
    return await db.getAll(STORES.TRASHED_TRIPS);
  } catch {
    return [];
  }
}

/**
 * Read all drivers from IndexedDB.
 */
export async function readDrivers() {
  try {
    const db = await getDB();
    return await db.getAll(STORES.DRIVERS);
  } catch {
    return [];
  }
}

/**
 * Read all dispatchers from IndexedDB.
 */
export async function readDispatchers() {
  try {
    const db = await getDB();
    return await db.getAll(STORES.DISPATCHERS);
  } catch {
    return [];
  }
}

/**
 * Read all vehicles from IndexedDB.
 */
export async function readVehicles() {
  try {
    const db = await getDB();
    return await db.getAll(STORES.VEHICLES);
  } catch {
    return [];
  }
}

/**
 * Read phone numbers from IndexedDB.
 */
export async function readPhoneNumbers() {
  try {
    const db = await getDB();
    return await db.get(STORES.PHONE_NUMBERS, 'current') || null;
  } catch {
    return null;
  }
}

/**
 * Read the last sync timestamp.
 */
export async function readLastSyncTime() {
  try {
    const db = await getDB();
    const meta = await db.get(STORES.META, 'lastSync');
    return meta?.value || null;
  } catch {
    return null;
  }
}

/**
 * Read all pending sync operations.
 */
export async function readSyncQueue() {
  try {
    const db = await getDB();
    return await db.getAll(STORES.SYNC_QUEUE);
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE OPERATIONS — Write-through to IndexedDB
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Save the full app state snapshot to IndexedDB.
 * This is the primary local persistence method.
 */
export async function saveAppData(data, { tenantId = DEFAULT_TENANT_ID } = {}) {
  const activeTenantId = normalizeTenantId(tenantId);
  const db = await getDB();
  const tx = db.transaction([
      STORES.APP_DATA,
      STORES.TRIPS,
      STORES.TRASHED_TRIPS,
      STORES.DRIVERS,
      STORES.DISPATCHERS,
      STORES.VEHICLES,
      STORES.LOGS,
      STORES.PHONE_NUMBERS,
      STORES.META,
  ], 'readwrite');

  // Tenant-keyed snapshots prevent one signed-in organization from reading
  // another organization's last local view on a shared device.
  await tx.objectStore(STORES.APP_DATA).put(data, snapshotKey(activeTenantId));

    // Save individual collections for granular access
    if (data.trips) {
      const tripStore = tx.objectStore(STORES.TRIPS);
      for (const trip of data.trips) {
        if (trip?.id) await tripStore.put(trip);
      }
    }
    if (data.trashedTrips) {
      const trashStore = tx.objectStore(STORES.TRASHED_TRIPS);
      for (const trip of data.trashedTrips) {
        if (trip?.id) await trashStore.put(trip);
      }
    }
    if (data.drivers) {
      const driverStore = tx.objectStore(STORES.DRIVERS);
      for (const driver of data.drivers) {
        if (driver?.id) await driverStore.put(driver);
      }
    }
    if (data.dispatchers) {
      const dispStore = tx.objectStore(STORES.DISPATCHERS);
      for (const disp of data.dispatchers) {
        if (disp?.id) await dispStore.put(disp);
      }
    }
    if (data.vehicles) {
      const vehStore = tx.objectStore(STORES.VEHICLES);
      for (const veh of data.vehicles) {
        if (veh?.id) await vehStore.put(veh);
      }
    }
    if (data.logs) {
      const logStore = tx.objectStore(STORES.LOGS);
      for (const log of data.logs) {
        if (log?.id) await logStore.put(log);
      }
    }
    if (data.phoneNumbers) {
      await tx.objectStore(STORES.PHONE_NUMBERS).put(data.phoneNumbers, 'current');
    }

    // Update sync timestamp
    await tx.objectStore(STORES.META).put(
      { value: new Date().toISOString() },
      `lastSync::${activeTenantId}`
    );

  await tx.done;
}

/**
 * Save a specific field to IndexedDB (lightweight write).
 */
export async function saveField(field, value, { previousValue, tenantId = DEFAULT_TENANT_ID } = {}) {
  const activeTenantId = normalizeTenantId(tenantId);
  const db = await getDB();
  const storeMap = {
      trips: STORES.TRIPS,
      trashedTrips: STORES.TRASHED_TRIPS,
      drivers: STORES.DRIVERS,
      dispatchers: STORES.DISPATCHERS,
      vehicles: STORES.VEHICLES,
      logs: STORES.LOGS,
  };
  const granularStore = storeMap[field];
  const stores = [STORES.APP_DATA];
  if (granularStore) stores.push(granularStore);
  if (field === 'phoneNumbers') stores.push(STORES.PHONE_NUMBERS);

  const existingSnapshot = (typeof db.get === 'function'
    ? await db.get(STORES.APP_DATA, snapshotKey(activeTenantId))
      || await db.get(STORES.APP_DATA, 'current')
    : null)
    || {};
  const priorRecords = Array.isArray(previousValue)
    ? previousValue
    : (granularStore ? await db.getAll(granularStore) : []);
  const tx = db.transaction([...new Set(stores)], 'readwrite');

  if (granularStore && Array.isArray(value)) {
    const store = tx.objectStore(granularStore);
    const nextIds = new Set(value.filter((item) => item?.id).map((item) => String(item.id)));
    for (const item of value) {
      if (item?.id) await store.put(item);
    }
    for (const item of priorRecords) {
      if (item?.id && !nextIds.has(String(item.id))) await store.delete(item.id);
    }
  } else if (field === 'phoneNumbers') {
    await tx.objectStore(STORES.PHONE_NUMBERS).put(value, 'current');
  }

  await tx.objectStore(STORES.APP_DATA).put({
    ...existingSnapshot,
    [field]: value,
    _lastLocalWrite: new Date().toISOString(),
  }, snapshotKey(activeTenantId));
  await tx.done;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC QUEUE — Offline write retry with exponential backoff
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Queue a write operation for background sync.
 * Used when Firestore write fails (offline, permission error, etc.)
 */
export async function queueSyncOperation(operation) {
  const ownership = normalizeSyncOwnership(operation);
  const safeOperation = sanitizeFirestorePayload(operation);
  const db = await getDB();
  const id = await db.add(STORES.SYNC_QUEUE, {
      ...safeOperation,
      ...ownership,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
      lastAttemptAt: null,
      nextRetryAt: new Date().toISOString(),
  });
  notifySyncQueueChanged();
  return id;
}

/**
 * Get all pending sync operations, sorted by creation time.
 */
export async function getPendingSyncOperations(ownership) {
  const normalizedOwnership = normalizeSyncOwnership(ownership);
  const db = await getDB();
  const all = await db.getAllFromIndex(STORES.SYNC_QUEUE, 'status', 'pending');
  return all
    .filter((operation) => {
      try {
        return syncOperationBelongsTo(operation, normalizedOwnership)
          || !normalizeSyncOwnership(operation);
      } catch {
        // Return legacy ownerless entries only so the processor can move them
        // to the dead-letter store without ever sending them to Firebase.
        return true;
      }
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Mark a sync operation as completed (remove from queue).
 */
export async function completeSyncOperation(id, resolution = 'synced_after_payload_repair') {
  const db = await getDB();
  const tx = db.transaction([STORES.SYNC_QUEUE, STORES.DEAD_LETTER_QUEUE], 'readwrite');
  const recoveredRecord = await tx.objectStore(STORES.DEAD_LETTER_QUEUE).get(id);
  await tx.objectStore(STORES.SYNC_QUEUE).delete(id);
  if (recoveredRecord?.status === 'retrying') {
    await tx.objectStore(STORES.DEAD_LETTER_QUEUE).put({
      ...recoveredRecord,
      status: resolution === 'superseded_by_newer_server_record' ? 'superseded' : 'recovered',
      resolvedAt: new Date().toISOString(),
      resolution,
    });
  }
  await tx.done;
  notifySyncQueueChanged();
}

/**
 * Mark a sync operation as failed and schedule retry with exponential backoff.
 * Backoff: 5s → 15s → 45s → 2min → 5min → 15min (max)
 */
export async function failSyncOperation(id, error) {
  const db = await getDB();
  const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
  const store = tx.objectStore(STORES.SYNC_QUEUE);
  const op = await store.get(id);
  if (!op) return;

    const attempts = op.attempts + 1;
    const backoffMs = Math.min(5000 * Math.pow(3, attempts - 1), 15 * 60 * 1000);
    const nextRetry = new Date(Date.now() + backoffMs).toISOString();

  await store.put({
      ...op,
      status: 'pending',
      attempts,
      error: error?.message || String(error),
      lastAttemptAt: new Date().toISOString(),
      nextRetryAt: nextRetry,
  });
  await tx.done;
  notifySyncQueueChanged();
}

export async function deadLetterSyncOperation(id, error, reason = 'permanent_failure') {
  const db = await getDB();
  const tx = db.transaction([STORES.SYNC_QUEUE, STORES.DEAD_LETTER_QUEUE], 'readwrite');
  const queueStore = tx.objectStore(STORES.SYNC_QUEUE);
  const operation = await queueStore.get(id);
  if (!operation) return;
  await tx.objectStore(STORES.DEAD_LETTER_QUEUE).put({
    ...operation,
    status: 'dead_letter',
    deadLetterReason: reason,
    error: error?.message || String(error),
    errorCode: error?.code || 'unknown',
    failedAt: new Date().toISOString(),
  });
  await queueStore.delete(id);
  await tx.done;
  notifySyncQueueChanged();
}

export function isRepairableDeadLetterOperation(operation = {}) {
  // The reported historical failure was a single-document merge. Multi-write
  // batches need document-by-document reconciliation and must remain blocked
  // instead of risking a partial or stale workflow replay.
  if (operation.type !== 'setDoc') return false;
  if (operation.status !== 'dead_letter') return false;
  if (Number(operation.recoveryAttempts || 0) >= 1) return false;
  const code = String(operation.errorCode || '').replace(/^firestore\//, '').toLowerCase();
  const message = String(operation.error || '').toLowerCase();
  // A stale-token/App Check race used to dead-letter valid writes as
  // permission failures. They are idempotent merges guarded by the
  // newer-server-record check on replay, so give each one a single recovery.
  if (code === 'permission-denied' || code === 'unauthenticated') return true;
  return code === 'invalid-argument'
    && message.includes('unsupported field value: undefined');
}

/**
 * Recover only the historical Firestore-undefined failure that the current
 * payload sanitizer can deterministically repair. The original dead-letter
 * record remains as a local audit entry while its idempotent merge is retried.
 * Other validation, ownership, deletion, and permission failures stay blocked.
 */
export async function restoreRepairableDeadLetterSyncOperations(ownership) {
  const normalizedOwnership = normalizeSyncOwnership(ownership);
  const db = await getDB();
  const deadLetters = await db.getAll(STORES.DEAD_LETTER_QUEUE);
  const repairable = deadLetters.filter((operation) => (
    syncOperationBelongsTo(operation, normalizedOwnership)
    && isRepairableDeadLetterOperation(operation)
  ));
  if (repairable.length === 0) return 0;

  const tx = db.transaction([STORES.SYNC_QUEUE, STORES.DEAD_LETTER_QUEUE], 'readwrite');
  const queueStore = tx.objectStore(STORES.SYNC_QUEUE);
  const deadLetterStore = tx.objectStore(STORES.DEAD_LETTER_QUEUE);
  const recoveredAt = new Date().toISOString();
  for (const operation of repairable) {
    const safeOperation = sanitizeFirestorePayload(operation);
    const queuedOperation = { ...safeOperation };
    delete queuedOperation.error;
    delete queuedOperation.errorCode;
    delete queuedOperation.deadLetterReason;
    delete queuedOperation.failedAt;
    queuedOperation.status = 'pending';
    queuedOperation.attempts = 0;
    queuedOperation.lastAttemptAt = null;
    queuedOperation.nextRetryAt = recoveredAt;
    queuedOperation.recoveredFromDeadLetter = true;
    queuedOperation.recoveryAttempts = Number(operation.recoveryAttempts || 0) + 1;
    queuedOperation.recoveredAt = recoveredAt;
    await queueStore.put(queuedOperation);
    await deadLetterStore.put({
      ...operation,
      status: 'retrying',
      recoveryAttempts: queuedOperation.recoveryAttempts,
      recoveryStartedAt: recoveredAt,
    });
  }
  await tx.done;
  notifySyncQueueChanged();
  return repairable.length;
}

export async function getSyncQueueStatus(ownership) {
  const normalizedOwnership = normalizeSyncOwnership(ownership);
  const db = await getDB();
  const [queued, deadLetters] = await Promise.all([
    db.getAll(STORES.SYNC_QUEUE),
    db.getAll(STORES.DEAD_LETTER_QUEUE),
  ]);
  const pending = queued.filter((op) => op.status === 'pending' && syncOperationBelongsTo(op, normalizedOwnership));
  const deadLetter = deadLetters.filter((op) => (
    op.status === 'dead_letter' && syncOperationBelongsTo(op, normalizedOwnership)
  ));
  const oldestPendingAt = pending
    .map((op) => op.createdAt).filter(Boolean).sort()[0] || null;
  const lastDeadLetterAt = deadLetter
    .map((op) => op.failedAt).filter(Boolean).sort().at(-1) || null;
  return {
    pending: pending.length,
    deadLetter: deadLetter.length,
    total: pending.length + deadLetter.length,
    oldestPendingAt,
    lastDeadLetterAt,
  };
}

export async function saveFieldWithSyncOperations(field, value, operations, ownership) {
  const normalizedOwnership = normalizeSyncOwnership(ownership);
  const storeMap = {
    trips: STORES.TRIPS,
    trashedTrips: STORES.TRASHED_TRIPS,
    drivers: STORES.DRIVERS,
    dispatchers: STORES.DISPATCHERS,
    vehicles: STORES.VEHICLES,
    logs: STORES.LOGS,
  };
  const granularStore = storeMap[field];
  const isPhoneNumbers = field === 'phoneNumbers';
  if ((!granularStore || !Array.isArray(value)) && !isPhoneNumbers) {
    throw new TypeError(`Atomic offline persistence is not supported for field: ${field}`);
  }
  const db = await getDB();
  const existingSnapshot = (typeof db.get === 'function'
    ? await db.get(STORES.APP_DATA, snapshotKey(normalizedOwnership.tenantId))
    : null) || {};
  const priorRecords = granularStore ? await db.getAll(granularStore) : [];
  const transactionStores = [STORES.APP_DATA, STORES.SYNC_QUEUE];
  if (granularStore) transactionStores.push(granularStore);
  if (isPhoneNumbers) transactionStores.push(STORES.PHONE_NUMBERS);
  const tx = db.transaction(transactionStores, 'readwrite');
  const recordStore = granularStore ? tx.objectStore(granularStore) : null;
  const queueStore = tx.objectStore(STORES.SYNC_QUEUE);
  const nextIds = new Set(Array.isArray(value) ? value.filter((item) => item?.id).map((item) => String(item.id)) : []);
  const queuedOperationIds = [];

  if (recordStore) {
    for (const item of value) {
      if (item?.id) await recordStore.put(item);
    }
    for (const item of priorRecords) {
      if (item?.id && !nextIds.has(String(item.id))) await recordStore.delete(item.id);
    }
  } else if (isPhoneNumbers) {
    await tx.objectStore(STORES.PHONE_NUMBERS).put(value, 'current');
  }
  for (const operation of operations || []) {
    const safeOperation = sanitizeFirestorePayload(operation);
    const operationOwnership = safeOperation.tenantId || safeOperation.userId
      ? normalizeSyncOwnership(safeOperation)
      : normalizedOwnership;
    if (operationOwnership.tenantId !== normalizedOwnership.tenantId
      || operationOwnership.userId !== normalizedOwnership.userId) {
      throw new TypeError('Queued operation ownership does not match the active session');
    }
    const id = await queueStore.add({
      ...safeOperation,
      ...normalizedOwnership,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
      lastAttemptAt: null,
      nextRetryAt: new Date().toISOString(),
    });
    queuedOperationIds.push(id);
  }
  await tx.objectStore(STORES.APP_DATA).put({
    ...existingSnapshot,
    [field]: value,
    _lastLocalWrite: new Date().toISOString(),
  }, snapshotKey(normalizedOwnership.tenantId));
  await tx.done;
  if (queuedOperationIds.length > 0) notifySyncQueueChanged();
  return { queuedOperationIds };
}

/**
 * Durably stage one changed record and its cloud mutations without cloning an
 * entire collection. Interactive trip/driver actions use this boundary so a
 * save remains proportional to the record being changed, even when the tenant
 * has a very large trip history. The outbox and local record are committed in
 * the same IndexedDB transaction; the realtime listener later refreshes the
 * full offline snapshot after Firebase confirms the mutation.
 */
export async function saveRecordWithSyncOperations(field, record, operations, ownership) {
  const normalizedOwnership = normalizeSyncOwnership(ownership);
  const storeMap = {
    trips: STORES.TRIPS,
    trashedTrips: STORES.TRASHED_TRIPS,
    drivers: STORES.DRIVERS,
    dispatchers: STORES.DISPATCHERS,
    vehicles: STORES.VEHICLES,
    logs: STORES.LOGS,
  };
  const granularStore = storeMap[field];
  const safeRecord = sanitizeFirestorePayload(record);
  const recordId = String(safeRecord?.id || '').trim();
  if (!granularStore || !recordId || !safeRecord || typeof safeRecord !== 'object' || Array.isArray(safeRecord)) {
    throw new TypeError(`Granular offline persistence requires one identified ${field} record`);
  }

  const safeOperations = (operations || []).map((operation) => {
    const safeOperation = sanitizeFirestorePayload(operation);
    const operationOwnership = safeOperation.tenantId || safeOperation.userId
      ? normalizeSyncOwnership(safeOperation)
      : normalizedOwnership;
    if (operationOwnership.tenantId !== normalizedOwnership.tenantId
      || operationOwnership.userId !== normalizedOwnership.userId) {
      throw new TypeError('Queued operation ownership does not match the active session');
    }
    return safeOperation;
  });
  if (safeOperations.length === 0) {
    throw new TypeError('Granular offline persistence requires at least one cloud operation');
  }

  const db = await getDB();
  const tx = db.transaction([granularStore, STORES.SYNC_QUEUE, STORES.META], 'readwrite');
  await tx.objectStore(granularStore).put({ ...safeRecord, id: recordId });
  const queueStore = tx.objectStore(STORES.SYNC_QUEUE);
  const queuedOperationIds = [];
  const createdAt = new Date().toISOString();

  for (const safeOperation of safeOperations) {
    const id = await queueStore.add({
      ...safeOperation,
      ...normalizedOwnership,
      status: 'pending',
      attempts: 0,
      createdAt,
      lastAttemptAt: null,
      nextRetryAt: createdAt,
    });
    queuedOperationIds.push(id);
  }

  await tx.objectStore(STORES.META).put(
    { value: createdAt, field, recordId },
    `lastLocalWrite::${normalizedOwnership.tenantId}`,
  );
  await tx.done;
  notifySyncQueueChanged();
  return { queuedOperationIds };
}

/**
 * Clear all pending sync operations (e.g. after a successful full sync).
 */
export async function clearSyncQueue() {
  try {
    const db = await getDB();
    await db.clear(STORES.SYNC_QUEUE);
    notifySyncQueueChanged();
  } catch (err) {
    console.warn('[localDB] clearSyncQueue failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP — Remove old data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clear all local data (used on logout or explicit data wipe).
 */
export async function clearAllLocalData() {
  try {
    const db = await getDB();
    const allStores = [...new Set([...Object.values(STORES), 'eventSourcing', 'retryQueue'])];
    const existingStores = allStores.filter(s => db.objectStoreNames.contains(s));
    const tx = db.transaction(existingStores, 'readwrite');
    for (const store of existingStores) {
      tx.objectStore(store).clear();
    }
    await tx.done;
  } catch (err) {
    console.warn('[localDB] clearAllLocalData failed:', err);
  }
}

/**
 * Remove trips older than N days from local store.
 */
export async function pruneOldTrips(daysToKeep = 90) {
  try {
    const db = await getDB();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const cutoffStr = localCalendarYmd(cutoff);

    const trips = await db.getAll(STORES.TRIPS);
    const tx = db.transaction(STORES.TRIPS, 'readwrite');
    const store = tx.objectStore(STORES.TRIPS);
    for (const trip of trips) {
      if (trip.date && trip.date < cutoffStr) {
        store.delete(trip.id);
      }
    }
    await tx.done;
  } catch (err) {
    console.warn('[localDB] pruneOldTrips failed:', err);
  }
}

export { STORES };
export default {
  getDB,
  readAppData,
  readTrips,
  readTrashedTrips,
  readDrivers,
  readDispatchers,
  readVehicles,
  readPhoneNumbers,
  readLastSyncTime,
  readSyncQueue,
  saveAppData,
  saveField,
  saveFieldWithSyncOperations,
  saveRecordWithSyncOperations,
  queueSyncOperation,
  getPendingSyncOperations,
  getSyncQueueStatus,
  completeSyncOperation,
  failSyncOperation,
  deadLetterSyncOperation,
  isRepairableDeadLetterOperation,
  restoreRepairableDeadLetterSyncOperations,
  normalizeSyncOwnership,
  syncOperationBelongsTo,
  clearSyncQueue,
  clearAllLocalData,
  pruneOldTrips,
};
