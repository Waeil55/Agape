// Agape Care — Real-Time Event Engine (Task 2)
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export const SYSTEM_EVENT_TYPES = {
  TRIP_CREATED: 'trip_created',
  TRIP_ASSIGNED: 'trip_assigned',
  TRIP_UPDATED: 'trip_updated',
  TRIP_CANCELLED: 'trip_cancelled',
  DRIVER_STATUS_CHANGED: 'driver_status_changed',
  LOCATION_UPDATED: 'location_updated',
  HEARTBEAT: 'heartbeat',
  SESSION_STARTED: 'session_started',
  SESSION_INVALIDATED: 'session_invalidated',
  FRAUD_DETECTED: 'fraud_detected',
};

export async function emitSystemEvent(type, payload = {}, actorId = null) {
  try {
    await addDoc(collection(db, 'system_events'), {
      type,
      payload,
      actorId: actorId || payload?.driverId || null,
      timestamp: serverTimestamp(),
      timestampLocal: new Date().toISOString(),
    });
  } catch (err) {
    // Non-blocking — event emission never throws
    console.warn('[EventEngine] emit failed:', err.message);
  }
}
