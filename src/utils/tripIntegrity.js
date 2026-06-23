const PLACEHOLDER_NAMES = new Set([
  '',
  '-',
  '--',
  '\u2014',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'unknown',
  'unnamed',
  'unnamed client',
  'client',
  'patient',
  'wc',
  'will call',
]);

const PLACEHOLDER_ADDRESSES = new Set([
  '',
  '-',
  '--',
  '\u2014',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
]);

const ROUTE_KEY_PATTERNS = [
  /::leg:/i,
  /^id:bk[:]/i,
  /^bk[:]/i,
  /^(bk|id|cmp)::/i,
  /\|(?:scheduled|unscheduled|will\s*call)\|/i,
];

export const textValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value?.toDate && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'object') {
    return [
      value.address,
      value.formattedAddress,
      value.label,
      value.name,
      value.street,
      value.line1,
    ].map(textValue).find(Boolean) || '';
  }
  return String(value).trim();
};

const normalized = (value) => textValue(value).toLowerCase().replace(/\s+/g, ' ').trim();

export const isRouteKeyIdentifier = (value) => {
  const text = textValue(value);
  return Boolean(text && ROUTE_KEY_PATTERNS.some((pattern) => pattern.test(text)));
};

export const hasRealTripPatient = (trip = {}) => {
  const patient = normalized(trip.patient || trip.patientName || trip.clientName || trip.memberName);
  return !PLACEHOLDER_NAMES.has(patient);
};

export const hasRealTripAddress = (trip = {}) => {
  const pickup = normalized(trip.pickup || trip.pickupAddress || trip.originAddress || trip.fromAddress || trip.origin);
  const dropoff = normalized(trip.dropoff || trip.dropoffAddress || trip.destinationAddress || trip.toAddress || trip.destination);
  return !PLACEHOLDER_ADDRESSES.has(pickup) || !PLACEHOLDER_ADDRESSES.has(dropoff);
};

export const hasTripServiceDate = (trip = {}) => Boolean(textValue(
  trip.date || trip.scheduleDate || trip.tripDate || trip.serviceDate || trip.appointmentDate
));

export const isCorruptedTripRecord = (trip = {}) => {
  if (!trip || typeof trip !== 'object') return true;
  if ([
    trip.id,
    trip.bookingId,
    trip.tripNumber,
    trip.tripId,
    trip.clientId,
  ].some(isRouteKeyIdentifier)) return true;
  
  // Uploaded trips are always valid
  if (trip.source === 'dispatch_upload' || trip.source === 'report_upload') return false;
  
  if (!hasRealTripPatient(trip)) return true;
  if (!hasRealTripAddress(trip)) return true;
  if (!hasTripServiceDate(trip)) return true;
  return false;
};

export const filterValidTripRecords = (trips = []) => (
  (Array.isArray(trips) ? trips : []).filter((trip) => !isCorruptedTripRecord(trip))
);
