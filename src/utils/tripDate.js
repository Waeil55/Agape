export const UNSCHEDULED_SORT_MINUTES = 1440;
export const WILL_CALL_SORT_MINUTES = 2000;

function normalizeTimingText(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

export function hasInOutText(value) {
  const text = normalizeTimingText(value);
  if (!text) return false;
  return /\bIN\s*(?:\/|&|\+|-|AND)?\s*OUT\b/.test(text);
}

export function hasWillCallText(value) {
  const text = normalizeTimingText(value);
  if (!text) return false;
  return /\bWILL\s*CALL\b/.test(text) || text === 'WC';
}

export function isInOutTrip(trip) {
  if (!trip) return false;
  if (typeof trip !== 'object') return hasInOutText(trip);
  if (trip.timingType === 'in_out' || trip.isInOut === true) return true;
  return hasInOutText([
    trip.time,
    trip.sourceTimingLabel,
    trip.pickupComments,
    trip.dropoffComments,
    trip.notes,
    trip.details?.generalComments,
  ].filter(Boolean).join(' '));
}

export function isWillCallTrip(trip) {
  if (!trip) return true;
  if (typeof trip !== 'object') {
    const text = normalizeTimingText(trip);
    return text === '' || hasWillCallText(text);
  }
  if (isInOutTrip(trip)) return false;
  if (trip.timingType === 'will_call' || trip.isWillCallTrip === true || trip.willCall === true) return true;
  const text = normalizeTimingText(trip.time);
  return text === '' || hasWillCallText(text);
}

/**
 * Convert time string to minutes since midnight.
 * Special labels such as Will Call and IN/OUT are intentionally unscheduled.
 */
export function timeToMinutes(t) {
  if (!t) return UNSCHEDULED_SORT_MINUTES;
  const cleanTime = normalizeTimingText(t);
  if (hasWillCallText(cleanTime) || hasInOutText(cleanTime)) return UNSCHEDULED_SORT_MINUTES;
  const m = cleanTime.match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?\s*(AM|PM)?$/);
  if (!m) return UNSCHEDULED_SORT_MINUTES;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (h > 23 || min > 59) return UNSCHEDULED_SORT_MINUTES;
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

export function getTripTimeLabel(trip) {
  if (!trip) return 'Will Call';
  const rawTime = trip.time || trip.requestedPickupTime || '';
  if (timeToMinutes(rawTime) !== UNSCHEDULED_SORT_MINUTES) return rawTime;
  if (isInOutTrip(trip)) return 'IN/OUT';
  if (isWillCallTrip(trip)) return 'Will Call';
  return rawTime;
}

export function getTripSortMinutes(trip) {
  if (!trip) return WILL_CALL_SORT_MINUTES;
  const explicit = Number(trip.inOutSortMinutes ?? trip.sortMinutes ?? trip.scheduleSortMinutes);
  if (Number.isFinite(explicit)) return explicit;
  const timeMinutes = timeToMinutes(trip.time || trip.requestedPickupTime);
  if (timeMinutes !== UNSCHEDULED_SORT_MINUTES) return timeMinutes;
  if (isInOutTrip(trip)) {
    const paired = Number(trip.pairedAfterSortMinutes ?? trip.pairedTripSortMinutes);
    if (Number.isFinite(paired)) return paired + 0.1;
    return WILL_CALL_SORT_MINUTES - 1;
  }
  return WILL_CALL_SORT_MINUTES;
}

export function compareTripsBySchedule(a, b) {
  const aMinutes = getTripSortMinutes(a);
  const bMinutes = getTripSortMinutes(b);
  if (aMinutes !== bMinutes) return aMinutes - bMinutes;

  const aWillCall = isWillCallTrip(a);
  const bWillCall = isWillCallTrip(b);
  if (aWillCall !== bWillCall) return aWillCall ? 1 : -1;

  const patientCompare = String(a?.patient || '').localeCompare(String(b?.patient || ''));
  if (patientCompare !== 0) return patientCompare;

  return String(a?.bookingId || a?.id || '').localeCompare(String(b?.bookingId || b?.id || ''));
}

/**
 * Normalize a trip service date to YYYY-MM-DD (local calendar) for comparison
 * with <input type="date"> values and manifest "today" strings.
 *
 * @returns {string|undefined} YYYY-MM-DD, or undefined if missing / empty / unparseable
 *          (callers typically treat undefined as "show on any manifest day").
 */
export function tripCalendarDateKey(value) {
  if (value === null || value === undefined || value === '') return undefined;

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      if (Number.isNaN(d.getTime())) return undefined;
      return localYmd(d);
    }
    if (value instanceof Date) {
      const d = value;
      if (Number.isNaN(d.getTime())) return undefined;
      return localYmd(d);
    }
    if (typeof value.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      if (Number.isNaN(d.getTime())) return undefined;
      return localYmd(d);
    }
  }

  const s = String(value).trim();
  if (!s) return undefined;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  }

  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return localYmd(d);
  }
  return undefined;
}

function localYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local calendar YYYY-MM-DD for a Date (default: now). */
export function localCalendarYmd(d = new Date()) {
  return localYmd(d);
}

/**
 * True if trip service date is today or tomorrow (local calendar), or date is missing/unparseable.
 * Used for driver manifest so next-day assignments are visible.
 */
export function tripMatchesTodayOrTomorrow(tripDate) {
  const key = tripCalendarDateKey(tripDate);
  if (key === undefined) return true;
  const now = new Date();
  const todayKey = localYmd(now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = localYmd(tomorrow);
  return key === todayKey || key === tomorrowKey;
}

/**
 * True if a trip time has passed (late for its scheduled slot).
 */
export function isTripLate(tripTime) {
  if (!tripTime || tripTime === 'Will Call') return false;
  const now = new Date();
  const timeVal = timeToMinutes(tripTime);
  const scheduled = new Date();
  scheduled.setHours(Math.floor(timeVal / 60), timeVal % 60, 0, 0);
  return now > scheduled;
}

/** If the trip has no usable date key, it matches any manifest day (legacy / incomplete rows). */
export function tripMatchesCalendarDay(tripDate, dayKey) {
  const key = tripCalendarDateKey(tripDate);
  if (key === undefined) return true;
  return key === dayKey;
}
