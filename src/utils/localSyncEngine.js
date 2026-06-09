import { openDB } from 'idb';

const DB_NAME = 'agape_fleet_os';
const DB_VERSION = 1;

/**
 * Initializes the Local-First IndexedDB engine.
 * This stores trips, drivers, and telemetry locally for 0ms latency access.
 */
export async function initLocalDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('drivers')) {
        db.createObjectStore('drivers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('telemetry')) {
        db.createObjectStore('telemetry', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

/**
 * Optimistic Write: Instantly writes to local DB, then queues for Firebase sync.
 */
export async function optimisticWrite(storeName, data) {
  const db = await initLocalDB();
  const tx = db.transaction([storeName, 'syncQueue'], 'readwrite');
  
  // Write to primary local store instantly
  await tx.objectStore(storeName).put(data);
  
  // Add to background sync queue
  await tx.objectStore('syncQueue').add({
    storeName,
    data,
    timestamp: Date.now(),
    status: 'pending'
  });
  
  await tx.done;
  // Note: Background sync worker should pick this up and push to Firebase.
  return data;
}

/**
 * Instant Read: Retrieves from Local-First cache immediately.
 */
export async function instantRead(storeName, id) {
  const db = await initLocalDB();
  return db.get(storeName, id);
}

export async function instantReadAll(storeName) {
  const db = await initLocalDB();
  return db.getAll(storeName);
}
