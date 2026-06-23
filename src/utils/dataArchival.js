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
  const sourceCollection = `trips/${dateKey}`;
  const archiveCollection = `archivedTrips/${dateKey}`;
  
  try {
    const snapshot = await getDocsFromServer(collection(db, sourceCollection));
    
    if (snapshot.empty) {
      return { archived: 0, errors: 0 };
    }
    
    const batch = writeBatch(db);
    let count = 0;
    
    snapshot.forEach(docSnap => {
      const archiveRef = doc(db, archiveCollection, docSnap.id);
      batch.set(archiveRef, {
        ...docSnap.data(),
        archivedAt: serverTimestamp(),
        originalDateKey: dateKey,
      });
      
      batch.delete(docSnap.ref);
      count++;
    });
    
    await batch.commit();
    
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
      const snapshot = await getDocsFromServer(collection(db, `archivedTrips/${dateKey}`));
      
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
        const activeSnap = await getDocsFromServer(collection(db, `trips/${dateKey}`));
        totalActiveTrips += activeSnap.size;
      } catch (err) {
        // Collection might not exist
      }
      
      try {
        const archiveSnap = await getDocsFromServer(collection(db, `archivedTrips/${dateKey}`));
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
