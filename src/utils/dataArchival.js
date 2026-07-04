/**
 * Data Archival Strategy
 *
 * Big companies move old data to cold storage to keep hot collections small.
 * This module provides utilities for archiving old trips and telemetry.
 */

import {
  collection,
  query,
  where,
  getDocsFromServer,
  writeBatch,
  doc,
  serverTimestamp,
} from '../config/firebase';
import { db } from '../config/firebase';
import { formatDateKey, addDays } from './dateSharding';

export const ARCHIVE_AFTER_DAYS = 90;
export const DELETE_ARCHIVE_AFTER_DAYS = 365;

/**
 * Get date keys for trips that should be archived
 */
export function getArchivableDateKeys() {
  const today = new Date();
  const archiveDate = addDays(today, -ARCHIVE_AFTER_DAYS);
  const keys = [];

  for (let i = 0; i < 30; i++) {
    const date = addDays(archiveDate, -i);
    keys.push(formatDateKey(date));
  }

  return keys;
}

/**
 * Archive trips from a specific date to cold storage
 */
export async function archiveTripsForDate(dateKey) {
  try {
    const q = query(collection(db, 'trips'), where('dateKey', '==', dateKey));
    const snapshot = await getDocsFromServer(q);

    if (snapshot.empty) {
      return { archived: 0, errors: 0 };
    }

    const docs = snapshot.docs;
    const BATCH_LIMIT = 250; // 250 docs × 2 ops = 500 ops (Firestore limit)
    let count = 0;

    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);

      chunk.forEach(docSnap => {
        const archiveRef = doc(db, 'archivedTrips', docSnap.id);
        batch.set(archiveRef, {
          ...docSnap.data(),
          archivedAt: serverTimestamp(),
          originalDateKey: dateKey,
        });
        batch.delete(docSnap.ref);
      });

      await batch.commit();
      count += chunk.length;
    }

    console.log(`Archived ${count} trips for ${dateKey}`);
    return { archived: count, errors: 0 };
  } catch (err) {
    console.error(`Failed to archive trips for ${dateKey}:`, err);
    return { archived: 0, errors: 1, error: err.message };
  }
}

/**
 * Archive all old trips
 */
export async function archiveOldTrips() {
  const dateKeys = getArchivableDateKeys();
  const results = [];

  for (const dateKey of dateKeys) {
    const result = await archiveTripsForDate(dateKey);
    results.push({ dateKey, ...result });
  }

  const totalArchived = results.reduce((sum, r) => sum + r.archived, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

  console.log(`Archival complete: ${totalArchived} trips archived, ${totalErrors} errors`);
  return { totalArchived, totalErrors, results };
}

/**
 * Delete very old archived trips
 */
export async function deleteOldArchives() {
  const today = new Date();
  const deleteDate = addDays(today, -DELETE_ARCHIVE_AFTER_DAYS);
  const dateKeys = [];

  for (let i = 0; i < 30; i++) {
    const date = addDays(deleteDate, -i);
    dateKeys.push(formatDateKey(date));
  }

  const results = [];

  for (const dateKey of dateKeys) {
    try {
      const q = query(collection(db, 'archivedTrips'), where('originalDateKey', '==', dateKey));
      const snapshot = await getDocsFromServer(q);

      if (snapshot.empty) {
        results.push({ dateKey, deleted: 0 });
        continue;
      }

      const batch = writeBatch(db);
      let count = 0;

      snapshot.forEach(docSnap => {
        batch.delete(docSnap.ref);
        count++;
      });

      await batch.commit();
      results.push({ dateKey, deleted: count });
    } catch (err) {
      results.push({ dateKey, deleted: 0, error: err.message });
    }
  }

  return results;
}

/**
 * Get storage statistics
 */
export async function getStorageStats() {
  try {
    const today = new Date();
    const dateKeys = [];

    for (let i = 0; i < 30; i++) {
      const date = addDays(today, -i);
      dateKeys.push(formatDateKey(date));
    }

    let totalActiveTrips = 0;
    let totalArchivedTrips = 0;

    for (const dateKey of dateKeys) {
      try {
        const activeQ = query(collection(db, 'trips'), where('dateKey', '==', dateKey));
        const activeSnap = await getDocsFromServer(activeQ);
        totalActiveTrips += activeSnap.size;
      } catch (err) {
        // Collection might not exist
      }

      try {
        const archiveQ = query(collection(db, 'archivedTrips'), where('originalDateKey', '==', dateKey));
        const archiveSnap = await getDocsFromServer(archiveQ);
        totalArchivedTrips += archiveSnap.size;
      } catch (err) {
        // Collection might not exist
      }
    }

    return {
      activeTrips: totalActiveTrips,
      archivedTrips: totalArchivedTrips,
      dateRange: dateKeys[dateKeys.length - 1] + ' to ' + dateKeys[0],
    };
  } catch (err) {
    console.error('Failed to get storage stats:', err);
    return { error: err.message };
  }
}

export default {
  archiveOldTrips,
  deleteOldArchives,
  getStorageStats,
};
