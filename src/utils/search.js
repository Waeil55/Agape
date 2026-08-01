const normalizeText = value => String(value ?? '').trim().toLowerCase();
const normalizePhone = value => String(value ?? '').replace(/\D/g, '');

export const PHONE_SEARCH_FIELDS = [
  'phone', 'phoneNumber', 'mobile', 'cell',
  'patientPhone', 'patientMobile', 'clientPhone', 'memberPhone', 'riderPhone',
  'pickupPhone', 'dropoffPhone', 'hospitalPhone', 'facilityPhone', 'contactPhone',
];

export const recordMatchesSearch = (record, query, fields = []) => {
  const textQuery = normalizeText(query);
  if (!textQuery) return true;
  const phoneQuery = normalizePhone(query);
  const values = [...fields, ...PHONE_SEARCH_FIELDS]
    .map(field => record?.[field])
    .filter(value => value !== undefined && value !== null);
  return values.some(value => {
    if (normalizeText(value).includes(textQuery)) return true;
    return phoneQuery.length >= 3 && normalizePhone(value).includes(phoneQuery);
  });
};

export const tripMatchesSearch = (trip, query, extraValues = []) => {
  if (!normalizeText(query)) return true;
  if (recordMatchesSearch(trip, query, [
    'patient', 'passenger', 'clientName', 'bookingId', 'tripId', 'id',
    'pickup', 'dropoff', 'driverName', 'completedDriverName',
    'vehicle', 'completedVehicle', 'notes', 'date',
  ])) return true;
  return extraValues.some(value => recordMatchesSearch({ value }, query, ['value']));
};

export { normalizePhone };
