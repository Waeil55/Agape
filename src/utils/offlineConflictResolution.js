/**
 * Offline Conflict Resolution
 * 
 * Big companies handle offline conflicts with strategies like:
 * - Last-write-wins (simple)
 * - Operational transforms (complex)
 * - CRDT (most robust)
 * 
 * This module implements last-write-wins with conflict detection.
 */

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from '../config/firebase';
import { db } from '../config/firebase';

/**
 * Compare two timestamps and determine which is newer
 */
export function isNewerTimestamp(timestamp1, timestamp2) {
  const t1 = typeof timestamp1 === 'object' && timestamp1?.toMillis ? timestamp1.toMillis() : Date.parse(timestamp1 || 0);
  const t2 = typeof timestamp2 === 'object' && timestamp2?.toMillis ? timestamp2.toMillis() : Date.parse(timestamp2 || 0);
  return t1 > t2;
}

/**
 * Merge two document versions, preferring newer fields
 */
export function mergeDocumentVersions(localDoc, remoteDoc) {
  if (!localDoc) return remoteDoc;
  if (!remoteDoc) return localDoc;

  const merged = { ...remoteDoc };

  for (const [key, localValue] of Object.entries(localDoc)) {
    if (key === 'updatedAt' || key === 'updatedAtLocal' || key === 'serverTimestamp') {
      continue;
    }

    const remoteValue = remoteDoc[key];

    if (remoteValue === undefined || remoteValue === null) {
      merged[key] = localValue;
      continue;
    }

    if (localValue === undefined || localValue === null) {
      continue;
    }

    if (typeof localValue === 'object' && !Array.isArray(localValue) &&
        typeof remoteValue === 'object' && !Array.isArray(remoteValue)) {
      merged[key] = mergeDocumentVersions(localValue, remoteValue);
    }
  }

  return merged;
}

/**
 * Write with conflict resolution (last-write-wins)
 */
export async function writeWithConflictResolution(collectionPath, docId, data, options = {}) {
  const { forceOverwrite = false, mergeStrategy = 'last-write-wins' } = options;
  const docRef = doc(db, collectionPath, docId);

  try {
    const remoteSnap = await getDoc(docRef);

    if (!remoteSnap.exists() || forceOverwrite) {
      await setDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
        updatedAtLocal: new Date().toISOString(),
      }, { merge: true });
      return { written: true, conflict: false };
    }

    const remoteData = remoteSnap.data();
    const localTimestamp = data.updatedAtLocal || data.updatedAt;
    const remoteTimestamp = remoteData.updatedAtLocal || remoteData.updatedAt;

    if (mergeStrategy === 'last-write-wins') {
      if (isNewerTimestamp(localTimestamp, remoteTimestamp)) {
        await setDoc(docRef, {
          ...data,
          updatedAt: serverTimestamp(),
          updatedAtLocal: new Date().toISOString(),
          conflictResolvedAt: new Date().toISOString(),
          previousVersion: remoteTimestamp,
        }, { merge: true });
        return { written: true, conflict: true, resolution: 'local-wins' };
      } else {
        return { written: false, conflict: true, resolution: 'remote-wins', remoteData };
      }
    }

    if (mergeStrategy === 'merge') {
      const merged = mergeDocumentVersions(data, remoteData);
      await setDoc(docRef, {
        ...merged,
        updatedAt: serverTimestamp(),
        updatedAtLocal: new Date().toISOString(),
        conflictResolvedAt: new Date().toISOString(),
      }, { merge: true });
      return { written: true, conflict: true, resolution: 'merged' };
    }

    return { written: false, conflict: false, error: 'Unknown merge strategy' };
  } catch (err) {
    console.error('Conflict resolution error:', err);
    throw err;
  }
}

/**
 * Queue operations for offline execution
 */
export class OfflineQueue {
  constructor(storageKey = 'agape_offline_queue') {
    this.storageKey = storageKey;
    this.queue = this.loadQueue();
  }

  loadQueue() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  saveQueue() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (err) {
      console.error('Failed to save offline queue:', err);
    }
  }

  enqueue(operation) {
    this.queue.push({
      ...operation,
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
    });
    this.saveQueue();
  }

  dequeue() {
    const operation = this.queue.shift();
    this.saveQueue();
    return operation;
  }

  peek() {
    return this.queue[0];
  }

  size() {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
    this.saveQueue();
  }

  async processQueue(processor) {
    const results = [];
    let operation = this.dequeue();

    while (operation) {
      try {
        const result = await processor(operation);
        results.push({ operation, result, success: true });
      } catch (err) {
        results.push({ operation, error: err.message, success: false });
        this.queue.unshift(operation);
        this.saveQueue();
        break;
      }
      operation = this.dequeue();
    }

    return results;
  }
}

export const offlineQueue = new OfflineQueue();

export default {
  writeWithConflictResolution,
  mergeDocumentVersions,
  isNewerTimestamp,
  OfflineQueue,
  offlineQueue,
};
