const firstValue = (source, keys) => keys
  .map(key => source?.[key])
  .find(value => value !== undefined && value !== null && value !== '');

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
  if (/^(\d{4})-(\d{1,2})-(\d{1,2})/.test(String(value).trim())) {
    const match = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }
  const usDate = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usDate) {
    const year = usDate[3].length === 2 ? `20${usDate[3]}` : usDate[3];
    return `${year}-${String(usDate[1]).padStart(2, '0')}-${String(usDate[2]).padStart(2, '0')}`;
  }
  const date = value?.toDate?.()
    || (typeof value?.seconds === 'number' ? new Date(value.seconds * 1000) : null)
    || new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const normalizeBookingId = (trip = {}) => {
  const value = String(firstValue(trip, ['bookingId', 'tripId', 'tripNumber', 'id']) || '').trim();
  return value.replace(/^TRIP-/i, '');
};

export const toClockTime = value => {
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
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start && start > 0) {
    return Number((end - start).toFixed(3));
  }
  const distance = Number(firstValue(trip, ['actualDistance', 'distance', 'miles', 'totalMiles']));
  return Number.isFinite(distance) && distance >= 0 ? Number(distance.toFixed(3)) : null;
};

export const buildWellTransPayload = (trip = {}) => {
  const bookingId = normalizeBookingId(trip);
  if (!bookingId) throw new Error('Trip has no Booking ID');
  const mileage = calculateTripMileage(trip);
  const signatureCaptured = Boolean(firstValue(
    trip,
    ['signatureCaptured', 'paperSignatureConfirmed', 'signatureUrl', 'signature'],
  ));
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
      mileage: Number.isFinite(Number(firstValue(
        trip,
        ['dropoffOdometer', 'endOdometer', 'endMileage', 'odometer'],
      )))
        ? Number(firstValue(trip, ['dropoffOdometer', 'endOdometer', 'endMileage', 'odometer']))
        : mileage,
      signatureCaptured,
    },
  };
};

export const validateTripForWellTrans = (trip = {}) => {
  const errors = [];
  const payload = (() => {
    try {
      return buildWellTransPayload(trip);
    } catch (error) {
      errors.push(error.message);
      return null;
    }
  })();
  if (!['completed', 'complete'].includes(String(trip.status || '').trim().toLowerCase()) && !trip.completedAt) {
    errors.push('Trip is not completed');
  }
  if (payload && !payload.pickup.arrival) errors.push('Pickup arrival is missing');
  if (payload && !payload.serviceDate) errors.push('Service date is missing');
  if (payload && !isOperationalAssignment(payload.driver) && !trip.driverId) errors.push('A valid assigned driver is missing');
  if (payload && !payload.pickup.departure) errors.push('Pickup departure is missing');
  if (payload && !payload.dropoff.arrival) errors.push('Dropoff arrival is missing');
  if (payload && !payload.dropoff.departure) errors.push('Dropoff departure is missing');
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
