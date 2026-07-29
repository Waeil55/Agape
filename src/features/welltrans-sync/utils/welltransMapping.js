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

export const normalizeServiceDate = (trip = {}) => {
  const value = firstValue(trip, ['dateKey', 'serviceDate', 'tripDate', 'scheduledDate', 'pickupDate', 'date']);
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) return String(value).trim();
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Indiana/Indianapolis' });
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
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
};

export const calculateTripMileage = (trip = {}) => {
  const start = Number(firstValue(trip, ['pickupOdometer', 'startOdometer', 'startMileage']));
  const end = Number(firstValue(trip, ['dropoffOdometer', 'endOdometer', 'endMileage', 'odometer']));
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start && start > 0) return Number((end - start).toFixed(3));
  const distance = Number(firstValue(trip, ['actualDistance', 'distance', 'miles', 'totalMiles']));
  return Number.isFinite(distance) && distance >= 0 ? Number(distance.toFixed(3)) : null;
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
        : 0,
      signatureCaptured: false,
    },
    dropoff: {
      arrival: toClockTime(firstValue(trip, ['dropoffArrival', 'arrivalDropoffTime', 'completedAt'])),
      departure: toClockTime(firstValue(trip, ['dropoffDeparture', 'departedDropoffTime', 'arrivalDropoffTime', 'completedAt'])),
      mileage: Number.isFinite(Number(firstValue(trip, ['dropoffOdometer', 'endOdometer', 'endMileage', 'odometer'])))
        ? Number(firstValue(trip, ['dropoffOdometer', 'endOdometer', 'endMileage', 'odometer']))
        : mileage,
      signatureCaptured,
    },
  };
};

export const validateTripForWellTrans = (trip = {}) => {
  const errors = [];
  const payload = (() => { try { return buildWellTransPayload(trip); } catch (error) { errors.push(error.message); return null; } })();
  if (!['completed', 'complete'].includes(String(trip.status || '').trim().toLowerCase()) && !trip.completedAt) errors.push('Trip is not completed');
  if (payload && !payload.pickup.arrival) errors.push('Pickup arrival is missing');
  if (payload && !payload.serviceDate) errors.push('Service date is missing');
  if (payload && !isOperationalAssignment(payload.driver) && !trip.driverId) errors.push('A valid assigned driver is missing');
  if (payload && !payload.pickup.departure) errors.push('Pickup departure is missing');
  if (payload && !payload.dropoff.arrival) errors.push('Dropoff arrival is missing');
  if (payload && payload.dropoff.mileage === null) errors.push('Mileage or valid odometer readings are missing');
  return { valid: errors.length === 0, errors, payload };
};

export const calculateSyncHealthScore = (completedTripsCount = 0, successfulCount = 0, failedCount = 0) => {
  const totalAttempted = successfulCount + failedCount;
  if (totalAttempted === 0) return completedTripsCount > 0 ? 100 : 100;
  return Math.round((successfulCount / totalAttempted) * 100);
};

