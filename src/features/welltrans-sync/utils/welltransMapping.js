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
  const assignedId = String(firstValue(trip, ['driverId', 'assignedDriverId']) || '').trim();
  const assignedEmail = String(firstValue(trip, ['driverEmail', 'assignedDriverEmail']) || '').trim().toLowerCase();
  const authoritativeDriver = drivers.find(driver =>
    (assignedId && String(driver?.id || '').trim() === assignedId)
    || (assignedEmail && String(driver?.email || '').trim().toLowerCase() === assignedEmail));
  const authoritativeName = firstValue(authoritativeDriver, ['name', 'displayName', 'fullName']);
  if (isOperationalAssignment(authoritativeName)) return String(authoritativeName).trim();
  const recordedName = firstValue(trip, ['completedDriverName', 'driverName', 'driver']);
  return isOperationalAssignment(recordedName) ? String(recordedName).trim() : '';
};

export const hydrateWellTransTrip = (trip = {}, drivers = []) => {
  const completedDriverName = resolveWellTransDriverName(trip, drivers);
  return completedDriverName ? { ...trip, completedDriverName } : trip;
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
  const date = value?.toDate?.() || (typeof value?.seconds === 'number' ? new Date(value.seconds * 1000) : null) || new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const normalizeBookingId = (trip = {}) => {
  const value = String(firstValue(trip, ['bookingId', 'tripId', 'tripNumber', 'id']) || '').trim();
  return value.replace(/^TRIP-/i, '');
};

export const toClockTime = (value) => {
  if (!value) return '';
  if (/^\d{1,2}:\d{2}$/.test(String(value).trim())) return String(value).trim().padStart(5, '0');
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return '';
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
  return {
    bookingId,
    tripId: String(trip.id || bookingId),
    serviceDate: normalizeServiceDate(trip),
    driver: firstValue(trip, ['completedDriverName', 'driverName', 'driver']) || '',
    vehicle: firstValue(trip, ['completedVehicle', 'vehicle', 'vehicleName']) || '',
    pickup: {
      arrival: toClockTime(firstValue(trip, ['pickupArrival', 'arrivalTime', 'arrivedPickupTime'])),
      departure: toClockTime(firstValue(trip, ['pickupDeparture', 'departedPickupTime', 'departureTime'])),
      mileage: Number.isFinite(Number(firstValue(trip, ['pickupOdometer', 'startOdometer', 'startMileage'])))
        ? Number(firstValue(trip, ['pickupOdometer', 'startOdometer', 'startMileage']))
        : null,
      signatureCaptured: false,
    },
    dropoff: {
      arrival: toClockTime(firstValue(trip, ['dropoffArrival', 'arrivalDropoffTime', 'completedAt'])),
      departure: toClockTime(firstValue(
        trip,
        ['dropoffDeparture', 'departedDropoffTime', 'dropoffArrival', 'arrivalDropoffTime', 'completedAt'],
      )),
      mileage: Number.isFinite(Number(firstValue(trip, ['dropoffOdometer', 'endOdometer', 'endMileage', 'odometer'])))
        ? Number(firstValue(trip, ['dropoffOdometer', 'endOdometer', 'endMileage', 'odometer']))
        : mileage,
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
  else if (!['completed', 'complete'].includes(String(trip.status || '').trim().toLowerCase()) && !trip.completedAt) errors.push('Trip is not completed');
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

export const calculateSyncHealthScore = (completedTripsCount = 0, successfulCount = 0, failedCount = 0) => {
  const totalAttempted = successfulCount + failedCount;
  if (totalAttempted === 0) return completedTripsCount > 0 ? 100 : 100;
  return Math.round((successfulCount / totalAttempted) * 100);
};

const COVERED_SYNC_STATUSES = new Set(['pending', 'processing', 'awaiting_review', 'completed']);

export const buildWellTransCoverage = (completedTrips = [], latestByTrip = new Map()) => {
  const trips = completedTrips.map(trip => {
    const validation = validateTripForWellTrans(trip);
    const log = latestByTrip.get(String(trip.id)) || latestByTrip.get(trip.id) || null;
    return {
      id: String(trip.id),
      bookingId: normalizeBookingId(trip),
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
  const verified = count('awaiting_review') + count('completed');
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
    failed,
    verified,
    missingCount: missing.length,
    blockedCount: blocked.length,
    coveragePercent: expected ? Math.round((verified / expected) * 100) : 100,
    coverageComplete,
    reviewReady: coverageComplete && staged > 0,
    missing,
    blocked,
    trips,
  };
};
