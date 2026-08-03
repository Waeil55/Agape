import { timeToMinutes, tripCalendarDateKey } from './tripDate';

const COMPLETION_FIELDS = [
  'completedAt',
  'arrivalDropoffTime',
  'dropoffArrival',
  'dropoffArrivalTime',
  'actualDropoffTime',
  'departedDropoffTime',
  'dropoffTime',
];

const PICKUP_FIELDS = [
  'arrivalTime',
  'pickupArrival',
  'pickupArrivalTime',
  'actualPickupTime',
  'departedPickupTime',
  'startTime',
  'pickupTime',
];

const toDate = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value).trim();
  if (!raw || /^\d{1,2}:\d{2}(?:\s*(?:am|pm))?$/i.test(raw)) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const clockMinutes = (value) => {
  const date = toDate(value);
  if (date) return (date.getHours() * 60) + date.getMinutes();
  const minutes = timeToMinutes(value);
  return minutes >= 0 && minutes < 1440 ? minutes : null;
};

const firstClockMinutes = (trip, fields) => {
  for (const field of fields) {
    const minutes = clockMinutes(trip?.[field]);
    if (minutes !== null) return minutes;
  }
  return null;
};

export const getTripChronologyDateKey = (trip) => {
  const serviceDate = tripCalendarDateKey(
    trip?.date || trip?.serviceDate || trip?.scheduledDate || trip?.scheduleDate || trip?.tripDate,
  );
  if (serviceDate) return serviceDate;
  for (const field of [...COMPLETION_FIELDS, ...PICKUP_FIELDS]) {
    const key = tripCalendarDateKey(trip?.[field]);
    if (key) return key;
  }
  return '';
};

/**
 * Stable numeric rank for history/report lists. The authoritative completed or
 * dropoff time wins; audit timestamps such as updatedAt never reorder old work.
 */
export const getTripCompletionSortValue = (trip) => {
  const dateKey = getTripChronologyDateKey(trip);
  const dayStart = dateKey ? new Date(`${dateKey}T00:00:00`).getTime() : 0;
  const completion = firstClockMinutes(trip, COMPLETION_FIELDS);
  const pickup = firstClockMinutes(trip, PICKUP_FIELDS);
  const scheduled = clockMinutes(trip?.time ?? trip?.scheduledTime);
  const minutes = completion ?? pickup ?? scheduled ?? 1439;
  return (Number.isNaN(dayStart) ? 0 : dayStart) + (minutes * 60_000);
};

export const compareTripsByCompletionAscending = (left, right, overrides = {}) => {
  const leftOverride = overrides?.[left?.id];
  const rightOverride = overrides?.[right?.id];
  const leftRank = Number.isFinite(leftOverride) ? leftOverride : getTripCompletionSortValue(left);
  const rightRank = Number.isFinite(rightOverride) ? rightOverride : getTripCompletionSortValue(right);
  if (leftRank !== rightRank) return leftRank - rightRank;

  const leftPickup = firstClockMinutes(left, PICKUP_FIELDS) ?? 1439;
  const rightPickup = firstClockMinutes(right, PICKUP_FIELDS) ?? 1439;
  if (leftPickup !== rightPickup) return leftPickup - rightPickup;

  return String(left?.bookingId || left?.tripId || left?.id || '').localeCompare(
    String(right?.bookingId || right?.tripId || right?.id || ''),
    undefined,
    { numeric: true, sensitivity: 'base' },
  );
};

