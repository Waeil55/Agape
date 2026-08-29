const normalized = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const parseOptionalReportNumber = (value, { blankAsZero = false } = {}) => {
  if (value === undefined || value === null || String(value).trim() === '') return blankAsZero ? 0 : null;
  const parsed = Number.parseFloat(String(value).replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const tripImportMatchKey = trip => {
  const bookingId = String(trip?.bookingId || '').trim();
  if (bookingId && !/^(BK-\d+-\d+|TRP-\d+|TRIP-\d{10,}-\d+)$/i.test(bookingId)) return `booking::${bookingId}`;
  return ['patient', 'date', 'time', 'pickup', 'dropoff'].map(field => normalized(trip?.[field])).join('|');
};

export const unmatchedOverrideReportBookingIds = (incomingTrips = [], activeTrips = [], archivedTrips = []) => {
  const existingKeys = new Set([...activeTrips, ...archivedTrips].map(tripImportMatchKey));
  return incomingTrips
    .filter(trip => trip?.reportOverridePatch)
    .filter(trip => !existingKeys.has(tripImportMatchKey(trip)))
    .map(trip => String(trip?.bookingId || '').trim())
    .filter(Boolean);
};

export const isReviewableImportedTrip = (trip, { report = false } = {}) => {
  const hasOperationalIdentity = (trip?.patient && trip.patient !== 'Unknown') || trip?.pickup || trip?.dropoff;
  const hasOverrideReportData = report
    && Boolean(String(trip?.bookingId || '').trim())
    && [trip?.originalTripCost, trip?.unloadedMileageMiles, trip?.overrideWaitingHours]
      .some(value => value !== null && value !== undefined);
  return Boolean(hasOperationalIdentity || hasOverrideReportData);
};
