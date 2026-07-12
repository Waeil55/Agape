import {
  db,
  collection,
  doc,
  writeBatch,
  serverTimestamp,
} from '../config/firebase';
import {
  FIRESTORE_COLLECTIONS,
  SYSTEM_EVENT_TYPES,
} from '../config/firestoreSchema';

export { SYSTEM_EVENT_TYPES };

const TERMINAL_CANCEL_STATUSES = new Set(['cancelled', 'canceled']);
const ASSIGNED_STATUSES = new Set(['assigned', 'in mission']);

const sanitizeForEvent = (value) => JSON.parse(JSON.stringify(value ?? null, (_key, item) => (
  item === undefined ? null : item
)));

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const getCompanyDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getActor = (actor = {}) => ({
  actorUserId: actor.userId || actor.uid || actor.email || 'system',
  actorRole: actor.role || 'system',
});

export function buildSystemEvent({
  type,
  aggregateType,
  aggregateId,
  tripId = null,
  driverId = null,
  assignmentId = null,
  actor = {},
  severity = 'info',
  payload = {},
}) {
  const actorFields = getActor(actor);
  return {
    type,
    aggregateType,
    aggregateId,
    tripId,
    driverId,
    assignmentId,
    ...actorFields,
    severity,
    payload: sanitizeForEvent(payload),
    companyDate: getCompanyDate(),
    createdAt: serverTimestamp(),
  };
}

export async function emitSystemEvents(events = []) {
  const cleanEvents = events.filter(Boolean);
  if (cleanEvents.length === 0) return true;

  let allSucceeded = true;

  for (let i = 0; i < cleanEvents.length; i += 450) {
    try {
      const batch = writeBatch(db);
      cleanEvents.slice(i, i + 450).forEach((event) => {
        const eventRef = doc(collection(db, FIRESTORE_COLLECTIONS.SYSTEM_EVENTS));
        batch.set(eventRef, buildSystemEvent(event));
      });
      await batch.commit();
    } catch (err) {
      console.error('[FirestoreEventEngine] batch commit failed:', err);
      allSucceeded = false;
    }
  }

  return allSucceeded;
}

export async function emitSystemEvent(event) {
  return emitSystemEvents([event]);
}

export function getTripEventType(beforeTrip, afterTrip) {
  if (!beforeTrip && afterTrip) return SYSTEM_EVENT_TYPES.TRIP_CREATED;

  const beforeStatus = normalizeText(beforeTrip?.status);
  const afterStatus = normalizeText(afterTrip?.status);

  if (beforeStatus !== afterStatus) {
    if (TERMINAL_CANCEL_STATUSES.has(afterStatus)) return SYSTEM_EVENT_TYPES.TRIP_CANCELLED;
    if (ASSIGNED_STATUSES.has(afterStatus) || (!beforeTrip?.driverId && afterTrip?.driverId)) {
      return SYSTEM_EVENT_TYPES.TRIP_ASSIGNED;
    }
  }

  if (beforeTrip?.driverId !== afterTrip?.driverId && afterTrip?.driverId) {
    return SYSTEM_EVENT_TYPES.TRIP_ASSIGNED;
  }

  return SYSTEM_EVENT_TYPES.TRIP_UPDATED;
}

export function getDriverEventType(_beforeDriver, _afterDriver) {
  return SYSTEM_EVENT_TYPES.DRIVER_STATUS_CHANGED;
}

export function buildTripEvents(beforeTrips = [], afterTrips = [], actor = {}) {
  const beforeById = new Map((beforeTrips || []).filter(Boolean).map((trip) => [String(trip.id), trip]));
  const afterById = new Map((afterTrips || []).filter(Boolean).map((trip) => [String(trip.id), trip]));
  const events = [];

  afterById.forEach((afterTrip, tripId) => {
    const beforeTrip = beforeById.get(tripId);
    if (beforeTrip && JSON.stringify(sanitizeForEvent(beforeTrip)) === JSON.stringify(sanitizeForEvent(afterTrip))) return;

    const eventType = getTripEventType(beforeTrip, afterTrip);
    events.push({
      type: eventType,
      aggregateType: 'trip',
      aggregateId: tripId,
      tripId,
      driverId: afterTrip.driverId ?? beforeTrip?.driverId ?? null,
      assignmentId: afterTrip.assignmentId ?? beforeTrip?.assignmentId ?? null,
      actor,
      severity: eventType === SYSTEM_EVENT_TYPES.TRIP_CANCELLED ? 'warning' : 'info',
      payload: {
        before: beforeTrip || null,
        after: afterTrip,
        changedFields: beforeTrip ? getChangedFields(beforeTrip, afterTrip) : Object.keys(afterTrip || {}),
      },
    });
  });

  return events;
}

export function buildDriverEvents(beforeDrivers = [], afterDrivers = [], actor = {}) {
  const beforeById = new Map((beforeDrivers || []).filter(Boolean).map((driver) => [String(driver.id), driver]));
  const events = [];

  (afterDrivers || []).filter(Boolean).forEach((afterDriver) => {
    const driverId = String(afterDriver.id || '');
    if (!driverId) return;
    const beforeDriver = beforeById.get(driverId);
    if (beforeDriver && JSON.stringify(sanitizeForEvent(beforeDriver)) === JSON.stringify(sanitizeForEvent(afterDriver))) return;

    events.push({
      type: getDriverEventType(beforeDriver, afterDriver),
      aggregateType: 'driver',
      aggregateId: driverId,
      driverId,
      actor,
      severity: 'info',
      payload: {
        before: beforeDriver || null,
        after: afterDriver,
        changedFields: beforeDriver ? getChangedFields(beforeDriver, afterDriver) : Object.keys(afterDriver || {}),
      },
    });
  });

  return events;
}

export function buildLocationEvent(driverId, location = {}, actor = {}) {
  const eventLocation = { ...location };
  delete eventLocation.receivedAt;
  return {
    type: SYSTEM_EVENT_TYPES.LOCATION_UPDATED,
    aggregateType: 'location',
    aggregateId: driverId,
    driverId,
    tripId: location.tripId || null,
    assignmentId: location.assignmentId || null,
    actor,
    severity: location.fraudSignals?.speedAnomaly || location.fraudSignals?.teleport ? 'warning' : 'info',
    payload: { location: eventLocation },
  };
}

export function getChangedFields(before = {}, after = {}) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...fields].filter((field) => (
    JSON.stringify(sanitizeForEvent(before?.[field])) !== JSON.stringify(sanitizeForEvent(after?.[field]))
  ));
}
