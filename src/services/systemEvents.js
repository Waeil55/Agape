import { addDoc, collection, serverTimestamp } from '../config/firebase';
import { db, auth } from '../config/firebase';

export async function emitSystemEvent(event = {}) {
  try {
    await addDoc(collection(db, 'system_events'), {
      ...event,
      actorUserId: event.actorUserId || auth.currentUser?.uid || auth.currentUser?.email || 'system',
      actorEmail: event.actorEmail || auth.currentUser?.email || '',
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString(),
    });
  } catch (err) {
    console.error('System event write failed:', err);
  }
}

export function buildFraudEvent({ driverId, activeTrip, fraudResult, locationSample, driverName = '' }) {
  return {
    type: 'fraud_flagged',
    aggregateType: 'driver',
    aggregateId: driverId,
    driverId,
    tripId: activeTrip?.id || null,
    severity: fraudResult.highestSeverity || 'warning',
    title: 'Driver fraud signal detected',
    message: `${driverName || 'Driver'} triggered ${fraudResult.flagTypes?.join(', ') || 'fraud'} signal(s).`,
    payload: {
      fraud: fraudResult,
      location: locationSample,
      trip: activeTrip ? {
        id: activeTrip.id,
        patient: activeTrip.patient || '',
        status: activeTrip.status || '',
        pickup: activeTrip.pickup || '',
        dropoff: activeTrip.dropoff || '',
      } : null,
    },
  };
}
