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

const DB_NAME = 'agape_fleet_os';
const DB_VERSION = 2;

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
  META: 'meta',              // Metadata: last sync time, schema version, etc.
};

let dbInstance = null;
let dbPromise = null;

/**
 * Initialize the IndexedDB database. Safe to call multiple times.
 */
export async function getDB() {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
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
      if (!db.objectStoreNames.contains('deadLetterQueue')) {
        db.createObjectStore('deadLetterQueue', { keyPath: 'id' });
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
export async function readAppData() {
  try {
    const db = await getDB();
    const data = await db.get(STORES.APP_DATA, 'current');
    return data || null;
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
export async function saveAppData(data) {
  try {
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

    // Save full snapshot
    tx.objectStore(STORES.APP_DATA).put(data, 'current');

    // Save individual collections for granular access
    if (data.trips) {
      const tripStore = tx.objectStore(STORES.TRIPS);
      for (const trip of data.trips) {
        if (trip?.id) tripStore.put(trip);
      }
    }
    if (data.trashedTrips) {
      const trashStore = tx.objectStore(STORES.TRASHED_TRIPS);
      for (const trip of data.trashedTrips) {
        if (trip?.id) trashStore.put(trip);
      }
    }
    if (data.drivers) {
      const driverStore = tx.objectStore(STORES.DRIVERS);
      for (const driver of data.drivers) {
        if (driver?.id) driverStore.put(driver);
      }
    }
    if (data.dispatchers) {
      const dispStore = tx.objectStore(STORES.DISPATCHERS);
      for (const disp of data.dispatchers) {
        if (disp?.id) dispStore.put(disp);
      }
    }
    if (data.vehicles) {
      const vehStore = tx.objectStore(STORES.VEHICLES);
      for (const veh of data.vehicles) {
        if (veh?.id) vehStore.put(veh);
      }
    }
    if (data.logs) {
      const logStore = tx.objectStore(STORES.LOGS);
      for (const log of data.logs) {
        if (log?.id) logStore.put(log);
      }
    }
    if (data.phoneNumbers) {
      tx.objectStore(STORES.PHONE_NUMBERS).put(data.phoneNumbers, 'current');
    }

    // Update sync timestamp
    tx.objectStore(STORES.META).put(
      { value: new Date().toISOString() },
      'lastSync'
    );

    await tx.done;
  } catch (err) {
    console.warn('[localDB] saveAppData failed:', err);
  }
}

/**
 * Save a specific field to IndexedDB (lightweight write).
 */
export async function saveField(field, value) {
  try {
    const db = await getDB();
    const storeMap = {
      trips: STORES.TRIPS,
      trashedTrips: STORES.TRASHED_TRIPS,
      drivers: STORES.DRIVERS,
      dispatchers: STORES.DISPATCHERS,
      vehicles: STORES.VEHICLES,
      logs: STORES.LOGS,
    };

    if (storeMap[field] && Array.isArray(value)) {
      const tx = db.transaction(storeMap[field], 'readwrite');
      const store = tx.objectStore(storeMap[field]);
      // Clear and repopulate
      await store.clear();
      for (const item of value) {
        if (item?.id) store.put(item);
      }
      await tx.done;
    } else if (field === 'phoneNumbers') {
      const db2 = await getDB();
      await db2.put(STORES.PHONE_NUMBERS, value, 'current');
    }

    // Update the full snapshot too
    const snapshot = await readAppData();
    if (snapshot) {
      snapshot[field] = value;
      snapshot._lastLocalWrite = new Date().toISOString();
      const db3 = await getDB();
      await db3.put(STORES.APP_DATA, snapshot, 'current');
    }
  } catch (err) {
    console.warn(`[localDB] saveField(${field}) failed:`, err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC QUEUE — Offline write retry with exponential backoff
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Queue a write operation for background sync.
 * Used when Firestore write fails (offline, permission error, etc.)
 */
export async function queueSyncOperation(operation) {
  try {
    const db = await getDB();
    await db.add(STORES.SYNC_QUEUE, {
      ...operation,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
      lastAttemptAt: null,
      nextRetryAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[localDB] queueSyncOperation failed:', err);
  }
}

/**
 * Get all pending sync operations, sorted by creation time.
 */
export async function getPendingSyncOperations() {
  try {
    const db = await getDB();
    const all = await db.getAllFromIndex(STORES.SYNC_QUEUE, 'status', 'pending');
    return all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } catch {
    return [];
  }
}

/**
 * Mark a sync operation as completed (remove from queue).
 */
export async function completeSyncOperation(id) {
  try {
    const db = await getDB();
    await db.delete(STORES.SYNC_QUEUE, id);
  } catch (err) {
    console.warn('[localDB] completeSyncOperation failed:', err);
  }
}

/**
 * Mark a sync operation as failed and schedule retry with exponential backoff.
 * Backoff: 5s → 15s → 45s → 2min → 5min → 15min (max)
 */
export async function failSyncOperation(id, error) {
  try {
    const db = await getDB();
    const op = await db.get(STORES.SYNC_QUEUE, id);
    if (!op) return;

    const attempts = op.attempts + 1;
    const backoffMs = Math.min(5000 * Math.pow(3, attempts - 1), 15 * 60 * 1000);
    const nextRetry = new Date(Date.now() + backoffMs).toISOString();

    await db.put(STORES.SYNC_QUEUE, {
      ...op,
      status: 'pending',
      attempts,
      error: error?.message || String(error),
      lastAttemptAt: new Date().toISOString(),
      nextRetryAt: nextRetry,
    });
  } catch (err) {
    console.warn('[localDB] failSyncOperation failed:', err);
  }
}

/**
 * Clear all pending sync operations (e.g. after a successful full sync).
 */
export async function clearSyncQueue() {
  try {
    const db = await getDB();
    await db.clear(STORES.SYNC_QUEUE);
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
    const allStores = [...Object.values(STORES), 'eventSourcing', 'retryQueue', 'deadLetterQueue'];
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
  queueSyncOperation,
  getPendingSyncOperations,
  completeSyncOperation,
  failSyncOperation,
  clearSyncQueue,
  clearAllLocalData,
  pruneOldTrips,
};
