import { ASSIGNMENT_STATUSES } from '../config/firestoreSchema';
import { normalizeTenantId } from './tenantScope';

const hasAssignedDriver = (trip = {}) => Boolean(trip.driverId || trip.driverEmail);
const isTerminalTrip = (trip = {}) => ['completed', 'cancelled', 'canceled', 'no show', 'no_show']
  .includes(String(trip.status || trip.lifecycleStatus || '').trim().toLowerCase());
const safeIdPart = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
const assignmentIdForTrip = (trip = {}) => trip.assignmentId || `trip_${safeIdPart(trip.id)}_${safeIdPart(trip.driverId || trip.driverEmail)}`;

const snapshotForTrip = (trip = {}, status = trip.status || '') => ({
  patient: trip.patient || trip.clientName || '',
  time: trip.time || '',
  pickup: trip.pickup || '',
  dropoff: trip.dropoff || '',
  status,
});

export function buildAssignmentMutations(currentTrips = [], previousTrips = [], tenantId, now = new Date().toISOString()) {
  const previousById = new Map((previousTrips || []).filter((trip) => trip?.id).map((trip) => [String(trip.id), trip]));
  const assignmentsById = new Map();

  (currentTrips || [])
    .filter((trip) => trip?.id && hasAssignedDriver(trip) && !isTerminalTrip(trip))
    .forEach((trip) => {
      const assignmentId = assignmentIdForTrip(trip);
      const prior = previousById.get(String(trip.id));
      const isNewAssignment = !prior
        || isTerminalTrip(prior)
        || !hasAssignedDriver(prior)
        || assignmentIdForTrip(prior) !== assignmentId;
      const mutation = {
        id: assignmentId,
        tripId: String(trip.id),
        driverId: trip.driverId || null,
        driverEmail: String(trip.driverEmail || '').trim().toLowerCase() || null,
        driverName: trip.driverName || null,
        dispatcherId: trip.dispatcherId || null,
        priority: trip.priority || 'normal',
        updatedAtLocal: now,
        tenantId: normalizeTenantId(tenantId),
        tripSnapshot: snapshotForTrip(trip),
      };
      if (isNewAssignment) {
        mutation.status = trip.assignmentStatus || ASSIGNMENT_STATUSES.OFFERED;
        mutation.deliveryState = trip.assignmentSeenAt ? 'seen' : 'queued';
        mutation.offeredAtLocal = trip.assignedAt || trip.updatedAtLocal || now;
      } else {
        if (trip.assignmentStatus) mutation.status = trip.assignmentStatus;
        if (trip.assignmentSeenAt) mutation.deliveryState = 'seen';
      }
      assignmentsById.set(assignmentId, mutation);
    });

  (currentTrips || []).forEach((trip) => {
    const prior = previousById.get(String(trip?.id || ''));
    if (!prior?.id || !hasAssignedDriver(prior) || isTerminalTrip(prior)) return;
    const priorAssignmentId = assignmentIdForTrip(prior);
    const currentRemainsActive = hasAssignedDriver(trip) && !isTerminalTrip(trip);
    if (currentRemainsActive && assignmentIdForTrip(trip) === priorAssignmentId) return;
    assignmentsById.set(priorAssignmentId, {
      id: priorAssignmentId,
      tripId: String(prior.id),
      driverId: prior.driverId || null,
      driverEmail: String(prior.driverEmail || '').trim().toLowerCase() || null,
      driverName: prior.driverName || null,
      dispatcherId: prior.dispatcherId || null,
      status: ASSIGNMENT_STATUSES.CANCELLED,
      deliveryState: 'closed',
      updatedAtLocal: now,
      tenantId: normalizeTenantId(tenantId),
      tripSnapshot: snapshotForTrip(prior, trip.status || ''),
    });
  });

  return [...assignmentsById.values()];
}
