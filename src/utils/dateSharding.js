/**
 * Date-based filtering for Firestore scalability.
 *
 * Instead of one massive `trips/` collection with millions of docs,
 * we use a `dateKey` field on each trip document and query by date.
 * This keeps the collection structure simple while enabling efficient queries.
 */

export function todayKey() {
  return formatDateKey(new Date());
}

export function formatDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key) {
  if (!key) return null;
  const parts = String(key).split('-');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function dateRangeKeys(startDate, endDate) {
  const keys = [];
  let current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    keys.push(formatDateKey(current));
    current = addDays(current, 1);
  }
  return keys;
}

/**
 * Get the date key from a trip object.
 */
export function getTripDateKey(trip) {
  if (!trip) return todayKey();

  if (trip.dateKey) return trip.dateKey;

  const dateFields = ['date', 'scheduledDate', 'scheduleDate', 'tripDate'];
  for (const field of dateFields) {
    if (trip[field]) {
      const key = formatDateKey(trip[field]);
      if (key && key !== 'NaN-aN-aN') return key;
    }
  }

  const timeFields = ['time', 'pickupTime', 'startTime', 'scheduledTime'];
  for (const field of timeFields) {
    if (trip[field]) {
      const key = formatDateKey(trip[field]);
      if (key && key !== 'NaN-aN-aN') return key;
    }
  }

  if (trip.createdAt) {
    const key = formatDateKey(trip.createdAt);
    if (key && key !== 'NaN-aN-aN') return key;
  }
  if (trip.updatedAtLocal) {
    const key = formatDateKey(trip.updatedAtLocal);
    if (key && key !== 'NaN-aN-aN') return key;
  }

  return todayKey();
}

/**
 * Get date keys for a range of days around today.
 */
export function getRecentDateKeys(pastDays = 7, futureDays = 2) {
  const today = new Date();
  const start = addDays(today, -pastDays);
  const end = addDays(today, futureDays);
  return dateRangeKeys(start, end);
}

export default {
  todayKey,
  formatDateKey,
  parseDateKey,
  addDays,
  dateRangeKeys,
  getTripDateKey,
  getRecentDateKeys,
};
