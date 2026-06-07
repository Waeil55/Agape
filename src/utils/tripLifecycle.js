// Agape Care — Trip Lifecycle (Tasks 5 & 6)
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { emitSystemEvent, SYSTEM_EVENT_TYPES } from '../services/firestoreEventEngine';
import { COLLECTIONS, TRIP_STATUS } from '../config/firestoreSchema';

export const normalizeTripStatus = (status) => {
  const s = String(status || '').trim().toLowerCase().replace(/\s+/g, '_');
  switch (s) {
    case 'pending': case 'unassigned': return TRIP_STATUS.PENDING;
    case 'assigned': return TRIP_STATUS.ASSIGNED;
    case 'accepted': case 'acknowledged': return TRIP_STATUS.ACCEPTED;
    case 'in_progress': case 'in progress': case 'en_route': case 'en route':
    case 'at_pickup': case 'at pickup': case 'navigating_pickup': case 'in_transit':
    case 'navigating_dropoff': case 'at_dropoff': case 'arrived':
    case 'in_mission': return TRIP_STATUS.IN_PROGRESS;
    case 'completed': case 'done': return TRIP_STATUS.COMPLETED;
    case 'cancelled': case 'canceled': case 'no_show': case 'no show': case 'rerouted':
      return TRIP_STATUS.CANCELLED;
    default: return TRIP_STATUS.PENDING;
  }
};

export const updateTripStatusInFirestore = async (tripId, newStatus, driverId = null, extraData = {}) => {
  if (!tripId) return false;
  try {
    const normalized = normalizeTripStatus(newStatus);
    const updates = {
      status: normalized,
      updatedAtLocal: new Date().toISOString(),
      ...extraData,
    };
    if (driverId) updates.driverId = driverId;
    if (normalized === TRIP_STATUS.ASSIGNED) updates.assignedAt = serverTimestamp();
    if (normalized === TRIP_STATUS.ACCEPTED) updates.acceptedAt = serverTimestamp();
    if (normalized === TRIP_STATUS.COMPLETED) updates.completedAt = serverTimestamp();

    // Write to trips collection (primary real-time source)
    await setDoc(doc(db, COLLECTIONS.TRIPS, tripId), updates, { merge: true });
    // Write to tripLedger (backup)
    setDoc(doc(db, COLLECTIONS.TRIP_LEDGER, tripId), updates, { merge: true }).catch(() => {});
    // Write to driverTripProgress (workflow state)
    if (driverId) {
      setDoc(doc(db, COLLECTIONS.DRIVER_TRIP_PROGRESS, tripId), {
        ...updates, tripId, driverId,
      }, { merge: true }).catch(() => {});
    }

    const eventType =
      normalized === TRIP_STATUS.ASSIGNED ? SYSTEM_EVENT_TYPES.TRIP_ASSIGNED :
      normalized === TRIP_STATUS.CANCELLED ? SYSTEM_EVENT_TYPES.TRIP_CANCELLED :
      SYSTEM_EVENT_TYPES.TRIP_UPDATED;
    emitSystemEvent(eventType, { tripId, status: normalized, driverId });
    return true;
  } catch (err) {
    console.error('[TripLifecycle] updateTripStatus failed:', err);
    return false;
  }
};
