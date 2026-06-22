import { isCorruptedTripRecord } from './tripIntegrity';

const ACTIVE_DRIVER_STATUSES = new Set([
  'assigned',
  'accepted',
  'in mission',
  'in progress',
  'navigating pickup',
  'at pickup',
  'in transit',
  'navigating dropoff',
  'at dropoff',
  'arrived',
]);

const TERMINAL_STATUSES = new Set([
  'completed',
  'cancelled',
  'canceled',
  'no show',
  'no_show',
  'rerouted',
]);

export const normalizeTripStatus = (status) => String(status || '').trim().toLowerCase();

export const getTripLifecycleStatus = (trip = {}) => {
  const status = normalizeTripStatus(trip.status);
  if (status === 'completed') return 'completed';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'no show' || status === 'no_show') return 'no_show';
  if (status === 'rerouted') return 'rerouted';
  if (status === 'accepted') return 'accepted';
  if (ACTIVE_DRIVER_STATUSES.has(status)) return 'in_progress';
  if (trip.driverId || trip.driverEmail || status === 'assigned') return 'assigned';
  return 'pending';
};

export const getTripLifecycleStep = (trip = {}) => {
  const status = normalizeTripStatus(trip.status);
  if (TERMINAL_STATUSES.has(status) || trip.completedAt) return 'completed';
  if (trip.arrivalDropoffTime || status === 'at dropoff' || status === 'arrived') return 'arrived_dropoff';
  if (status === 'navigating dropoff') return 'navigating_dropoff';
  if (trip.departedPickupTime || trip.paperSignatureConfirmed || trip.unableToSign || status === 'in transit') return 'picked_up';
  if (trip.arrivalTime || trip.pickupOdometer || status === 'at pickup') return 'arrived_pickup';
  if (status === 'navigating pickup') return 'navigating_pickup';
  if (trip.startedAt || ACTIVE_DRIVER_STATUSES.has(status)) return 'accepted';
  if (trip.driverId || trip.driverEmail) return 'assigned';
  return 'created';
};

export const isOperationalTrip = (trip = {}) => {
  if (isCorruptedTripRecord(trip)) return false;
  const status = normalizeTripStatus(trip.status);
  if (status === 'archived') return false;
  if (trip.archiveState === 'archived') return false;
  return true;
};

export const buildOperationalTripRecord = (trip = {}) => {
  const lifecycleStatus = getTripLifecycleStatus(trip);
  const lifecycleStep = getTripLifecycleStep(trip);
  const id = String(trip.id || trip.bookingId || '');
  return {
    ...trip,
    id,
    lifecycleStatus,
    lifecycleStep,
    operationalStatus: lifecycleStatus,
    assignmentId: trip.assignmentId || null,
    driverId: trip.driverId || null,
    driverEmail: trip.driverEmail || null,
    driverName: trip.driverName || null,
    scheduleDate: trip.date || trip.scheduleDate || null,
    updatedAtLocal: trip.updatedAtLocal || new Date().toISOString(),
  };
};

export const mergeTripCollections = (baseTrips = [], liveTrips = [], progressByTrip = {}) => {
  const byId = new Map();
  (baseTrips || []).filter(Boolean).forEach((trip) => {
    if (!trip.id) return;
    byId.set(String(trip.id), trip);
  });
  (liveTrips || []).filter(Boolean).forEach((trip) => {
    if (!trip.id || !isOperationalTrip(trip)) return;
    const id = String(trip.id);
    byId.set(id, {
      ...(byId.get(id) || {}),
      ...trip,
    });
  });
  return [...byId.values()].map((trip) => {
    const progress = progressByTrip?.[trip.id];
    return progress ? { ...trip, ...progress } : trip;
  });
};
