import { resolveTripDriver, resolveTripDriverName } from '../../../utils/driverIdentity';

export const DEFAULT_WELLTRANS_FIELD_MAPPING = Object.freeze({
  tripId: 'Booking Id',
  pickupArrival: 'Arrival Time',
  pickupDeparture: 'Departure',
  dropoffArrival: 'Arrival Time',
  dropoffDeparture: 'Departure',
  mileage: 'Mileage/Od',
  signature: 'Signature Captured',
  driver: 'Driver',
  vehicle: 'Vehicle',
});

const firstValue = (source, keys) => keys.map((key) => source?.[key]).find((value) => value !== undefined && value !== null && value !== '');
const isOperationalAssignment = value => {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized
    && !normalized.includes('pending assignment')
    && !normalized.includes('medical transportation inc'));
};

export const resolveWellTransDriverName = (trip = {}, drivers = []) => {
  const resolved = resolveTripDriverName(trip, drivers);
  return isOperationalAssignment(resolved) ? resolved : '';
};

export const hydrateWellTransTrip = (trip = {}, drivers = []) => {
  const completedDriverName = resolveWellTransDriverName(trip, drivers);
  const authoritativeDriver = resolveTripDriver(trip, drivers);
  const completedVehicle = firstValue(trip, ['completedVehicle', 'vehicle', 'vehicleName'])
    || firstValue(authoritativeDriver, ['vehicle', 'vehicleName']);
  if (!completedDriverName && !completedVehicle) return trip;
  return {
    ...trip,
    ...(completedDriverName ? { completedDriverName } : {}),
    ...(completedVehicle ? { completedVehicle } : {}),
  };
};

export const normalizeServiceDate = (trip = {}) => {
  const value = firstValue(trip, ['dateKey', 'serviceDate', 'tripDate', 'scheduledDate', 'pickupDate', 'date']);
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) return String(value).trim();
  if (/^(\d{4})-(\d{1,2})-(\d{1,2})/.test(String(value).trim())) {
    const m = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  const us = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
  }
  let date;
  try {
    date = typeof value?.toDate === 'function'
      ? value.toDate()
      : (typeof value?.seconds === 'number' ? new Date(value.seconds * 1000) : new Date(value));
  } catch { return ''; }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const normalizeBookingId = (trip = {}) => {
  const value = String(firstValue(trip, ['bookingId', 'tripId', 'tripNumber', 'id']) || '').trim();
  return value.replace(/^TRIP-/i, '');
};

export const isWellTransCompletedTrip = (trip = {}) => {
  const states = [
    trip.status, trip.operationalStatus, trip.lifecycleStatus, trip.lifecycleStep,
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
  const disallowed = new Set([
    'cancelled', 'canceled', 'no show', 'no-show', 'noshow', 'rerouted',
    'assigned', 'accepted', 'en route', 'at pickup', 'at dropoff', 'arrived', 'pending',
  ]);
  if (states.some(state => disallowed.has(state))) return false;
  return states.some(state => ['completed', 'complete', 'done'].includes(state));
};

export const toClockTime = (value) => {
  if (!value) return '';
  if (/^\d{1,2}:\d{2}$/.test(String(value).trim())) return String(value).trim().padStart(5, '0');
  let date;
  try { date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value); } catch { return ''; }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/Indiana/Indianapolis',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const calculateTripMileage = (trip = {}) => {
  const start = Number(firstValue(trip, ['pickupOdometer', 'startOdometer', 'startMileage']));
  const end = Number(firstValue(trip, ['dropoffOdometer', 'endOdometer', 'endMileage', 'odometer']));
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start && start > 0) return Number((end - start).toFixed(3));
  const distance = Number(firstValue(trip, ['actualDistance', 'distance', 'miles', 'totalMiles']));
  return Number.isFinite(distance) && distance >= 0 ? Number(distance.toFixed(3)) : null;
};

export const calculateWellTransDraftMileage = (draft) => {
  if (!draft || typeof draft !== 'object') return null;
  if (draft._pickupOdometer === '' || draft._pickupOdometer == null
    || draft._dropoffOdometer === '' || draft._dropoffOdometer == null) return null;
  const pickup = Number(draft._pickupOdometer);
  const dropoff = Number(draft._dropoffOdometer);
  if (!Number.isFinite(pickup) || !Number.isFinite(dropoff)) return null;
  return Math.max(0, dropoff - pickup);
};

const clockMinutes = value => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

const followsOnSameServiceLeg = (earlier, later) => {
  const from = clockMinutes(earlier);
  const to = clockMinutes(later);
  if (from === null || to === null) return true;
  if (to >= from) return true;
  return from >= (18 * 60) && to <= (6 * 60);
};

export const validateWellTransTimeline = payload => {
  if (!payload) return [];
  const errors = [];
  if (!followsOnSameServiceLeg(payload.pickup?.arrival, payload.pickup?.departure)) {
    errors.push(`Pickup departure ${payload.pickup.departure} precedes pickup arrival ${payload.pickup.arrival}`);
  }
  if (!followsOnSameServiceLeg(payload.pickup?.departure, payload.dropoff?.arrival)) {
    errors.push(`Dropoff arrival ${payload.dropoff.arrival} precedes pickup departure ${payload.pickup.departure}`);
  }
  if (!followsOnSameServiceLeg(payload.dropoff?.arrival, payload.dropoff?.departure)) {
    errors.push(`Dropoff departure ${payload.dropoff.departure} precedes dropoff arrival ${payload.dropoff.arrival}`);
  }
  return errors;
};

export const buildWellTransPayload = (trip = {}) => {
  const bookingId = normalizeBookingId(trip);
  if (!bookingId) throw new Error('Trip has no Booking ID');
  const mileage = calculateTripMileage(trip);
  const signatureCaptured = Boolean(firstValue(trip, ['signatureCaptured', 'paperSignatureConfirmed', 'signatureUrl', 'signature']));

  const rawPickupOdo = firstValue(trip, ['pickupOdometer', 'startOdometer', 'startMileage', 'pickupMileage', 'startOdo']);
  const rawDropoffOdo = firstValue(trip, ['dropoffOdometer', 'endOdometer', 'endMileage', 'odometer', 'dropoffMileage', 'endOdo']);
  const pickupMileage = Number.isFinite(Number(rawPickupOdo)) && Number(rawPickupOdo) > 0
    ? Number(rawPickupOdo)
    : null;
  const dropoffMileage = Number.isFinite(Number(rawDropoffOdo)) && Number(rawDropoffOdo) > 0
    ? Number(rawDropoffOdo)
    : mileage;

  // Only recorded workflow events are broker evidence. Scheduled `time` and
  // `startTime` fields must never be promoted into actual portal timestamps.
  const pickupArrivalValue = firstValue(trip, [
    'pickupArrival', 'arrivalTime', 'arrivedPickupTime', 'pickupArrivalTime', 'actualPickupTime',
  ]);
  const pickupDepartureValue = firstValue(trip, [
    'pickupDeparture', 'departedPickupTime', 'departureTime', 'pickupDepartureTime', 'departedTime',
  ]);

  return {
    bookingId,
    tripId: String(trip.id || bookingId),
    serviceDate: normalizeServiceDate(trip),
    driver: firstValue(trip, ['completedDriverName', 'driverName', 'driver']) || '',
    vehicle: firstValue(trip, ['completedVehicle', 'vehicle', 'vehicleName']) || '',
    pickup: {
      arrival: toClockTime(pickupArrivalValue),
      departure: toClockTime(pickupDepartureValue),
      mileage: pickupMileage,
      signatureCaptured: false,
    },
    dropoff: {
      arrival: toClockTime(firstValue(trip, ['dropoffArrival', 'arrivalDropoffTime', 'completedAt'])),
      departure: toClockTime(firstValue(
        trip,
        ['dropoffDeparture', 'departedDropoffTime', 'dropoffArrival', 'arrivalDropoffTime', 'completedAt'],
      )),
      mileage: dropoffMileage,
      signatureCaptured,
    },
  };
};

export const validateTripForWellTrans = (trip = {}) => {
  const errors = [];
  const lifecycle = [
    trip.status, trip.operationalStatus, trip.lifecycleStatus, trip.lifecycleStep,
  ].map(value => String(value || '').trim().toLowerCase()).join(' ');
  const payload = (() => { try { return buildWellTransPayload(trip); } catch (error) { errors.push(error.message); return null; } })();
  if (/cancell?ed/.test(lifecycle)) errors.push('Trip is cancelled');
  else if (!isWellTransCompletedTrip(trip)) errors.push('Trip is not completed');
  if (payload && !payload.pickup.arrival) errors.push('Pickup arrival is missing');
  if (payload && !payload.serviceDate) errors.push('Service date is missing');
  if (payload && !isOperationalAssignment(payload.driver) && !trip.driverId) errors.push('A valid assigned driver is missing');
  if (payload && !payload.pickup.departure) errors.push('Pickup departure is missing');
  if (payload && !payload.dropoff.arrival) errors.push('Dropoff arrival is missing');
  if (payload && !payload.dropoff.departure) errors.push('Dropoff departure is missing');
  if (payload) errors.push(...validateWellTransTimeline(payload));
  if (payload && (!Number.isFinite(payload.pickup.mileage) || payload.pickup.mileage <= 0)) {
    errors.push('Pickup odometer is missing');
  }
  if (payload && (!Number.isFinite(payload.dropoff.mileage)
    || payload.dropoff.mileage < payload.pickup.mileage)) {
    errors.push('Dropoff odometer is missing or precedes pickup odometer');
  }
  if (payload && !payload.dropoff.signatureCaptured) errors.push('Captured rider signature is missing');
  return { valid: errors.length === 0, errors, payload };
};

export const calculateSyncHealthScore = (_completedTripsCount = 0, successfulCount = 0, failedCount = 0) => {
  const totalAttempted = successfulCount + failedCount;
  if (totalAttempted === 0) return 0;
  return Math.round((successfulCount / totalAttempted) * 100);
};

const COVERED_SYNC_STATUSES = new Set(['pending', 'processing', 'awaiting_review', 'completed']);

export const buildWellTransCoverage = (completedTrips = [], latestByTrip = new Map()) => {
  const trips = completedTrips.map(trip => {
    let validation;
    try { validation = validateTripForWellTrans(trip); } catch (error) {
      validation = { valid: false, errors: [`Unreadable source trip: ${error?.message || 'invalid record'}`] };
    }
    const tripId = (() => { try { return String(trip?.id || ''); } catch { return ''; } })();
    const log = latestByTrip.get(tripId) || latestByTrip.get(trip?.id) || null;
    return {
      id: tripId,
      bookingId: (() => { try { return normalizeBookingId(trip); } catch { return ''; } })(),
      valid: validation.valid,
      errors: validation.errors,
      status: log?.status || 'not_queued',
      log,
    };
  });
  const count = status => trips.filter(item => item.status === status).length;
  const blocked = trips.filter(item => !item.valid || item.status === 'failed');
  const missing = trips.filter(item =>
    item.valid && !COVERED_SYNC_STATUSES.has(item.status));
  const verifiedCompleted = trips.filter(item => item.status === 'completed'
    && item.log?.portalVerification?.verified === true).length;
  const unverifiedCompleted = trips.filter(item => item.status === 'completed'
    && item.log?.portalVerification?.verified !== true).length;
  const verified = count('awaiting_review') + verifiedCompleted;
  const expected = trips.length;
  const pending = count('pending');
  const processing = count('processing');
  const staged = count('awaiting_review');
  const completed = count('completed');
  const failed = count('failed');
  const coverageComplete = expected > 0
    && verified === expected
    && pending === 0
    && processing === 0
    && blocked.length === 0
    && missing.length === 0;
  return {
    expected,
    valid: trips.filter(item => item.valid).length,
    invalid: trips.filter(item => !item.valid).length,
    pending,
    processing,
    staged,
    completed,
    verifiedCompleted,
    unverifiedCompleted,
    failed,
    verified,
    missingCount: missing.length,
    blockedCount: blocked.length,
    coveragePercent: expected ? Math.round((verified / expected) * 100) : 0,
    coverageComplete,
    reviewReady: coverageComplete && staged > 0,
    missing,
    blocked,
    trips,
  };
};
