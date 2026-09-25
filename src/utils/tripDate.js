/**
 * Convert time string to minutes since midnight (0-1440)
 * Handles formats: "2:30 PM", "14:30", "Will Call", etc.
 */
export function timeToMinutes(t) {
  if (!t) return 1440;
  const cleanTime = String(t).toUpperCase().trim();
  if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
  const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
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
      try {
        const d = value.toDate();
        if (Number.isNaN(d.getTime())) return undefined;
        return localYmd(d);
      } catch {
        return undefined;
      }
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
    const rest = s.slice(iso[0].length);
    if (!/[T\s]/.test(rest)) {
      // Pure calendar date (no time component): already a local service date.
      const year = Number(iso[1]);
      const month = Number(iso[2]);
      const day = Number(iso[3]);
      const candidate = new Date(year, month - 1, day);
      if (
        candidate.getFullYear() !== year
        || candidate.getMonth() !== month - 1
        || candidate.getDate() !== day
      ) return undefined;
      return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    }
    // Timestamped instant: convert to the LOCAL calendar day. Slicing the
    // UTC date part made evening completions (after 20:00 EDT / midnight UTC)
    // land on "tomorrow" and vanish from date-bounded views like History.
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return localYmd(d);
    }
  }

  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    const candidate = new Date(Number(year), Number(us[1]) - 1, Number(us[2]));
    if (
      candidate.getFullYear() !== Number(year)
      || candidate.getMonth() !== Number(us[1]) - 1
      || candidate.getDate() !== Number(us[2])
    ) return undefined;
    return `${year}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return localYmd(d);
  }
  return undefined;
}

// One fixed operating timezone for the whole fleet, so "today" and every
// trip's calendar date are the same for every operator regardless of which
// timezone their own device happens to be set to. Without this, a dispatcher
// on a device in a different zone (or with a wrong clock) sees a different
// "today" — and a different bucket for the same trip — than everyone else.
export const APP_TIMEZONE = 'America/Indiana/Indianapolis';

// Constructing an Intl.DateTimeFormat is expensive and this runs thousands
// of times per render (every trip, every filter/sort). Build it once, and
// memoize results per minute so repeated lookups are a Map hit.
let zonedFormatter = null;
try {
  zonedFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
} catch {
  zonedFormatter = null;
}
const ymdCache = new Map();
const YMD_CACHE_LIMIT = 5000;

function deviceLocalYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localYmd(d) {
  const ms = d.getTime();
  if (!zonedFormatter || Number.isNaN(ms)) return deviceLocalYmd(d);
  const minuteKey = Math.floor(ms / 60000);
  const cached = ymdCache.get(minuteKey);
  if (cached) return cached;
  let result;
  try {
    // en-CA formats as YYYY-MM-DD directly — no formatToParts allocation.
    result = zonedFormatter.format(d);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) result = deviceLocalYmd(d);
  } catch {
    result = deviceLocalYmd(d);
  }
  if (ymdCache.size >= YMD_CACHE_LIMIT) ymdCache.clear();
  ymdCache.set(minuteKey, result);
  return result;
}

/** Convert a UTC ISO timestamp string to a local YYYY-MM-DD date key. */
export function isoToLocalDateKey(isoString) {
  if (!isoString || typeof isoString !== 'string') return undefined;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return undefined;
  return localYmd(d);
}

/** Local calendar YYYY-MM-DD for a Date (default: now). */
export function localCalendarYmd(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? localYmd(new Date()) : localYmd(date);
}

export function calendarDateKeyDaysAgo(daysAgo = 0, from = new Date()) {
  const base = from instanceof Date ? from : new Date(from);
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  // Resolve "today" in the fixed operating timezone first, then shift by
  // whole calendar days on the date-key itself — never on device-local
  // Y/M/D components, which would drift the result under a different zone.
  return addDaysToDateKey(localYmd(safeBase), -Math.max(0, Number(daysAgo) || 0));
}

export function isCalendarDateKeyWithinLastDays(dateKey, days = 14, from = new Date()) {
  if (!dateKey) return false;
  const lookbackDays = Math.max(1, Number(days) || 1);
  const startKey = calendarDateKeyDaysAgo(lookbackDays - 1, from);
  const endKey = localCalendarYmd(from);
  return dateKey >= startKey && dateKey <= endKey;
}

/** Shift a YYYY-MM-DD date key by a signed number of calendar days. */
export function addDaysToDateKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  d.setDate(d.getDate() + (Number(days) || 0));
  return localYmd(d);
}

/**
 * The single authoritative "which calendar day does this trip belong to"
 * resolver, shared by every history/report view. A trip's own service date
 * is authoritative. A completion recorded the very next calendar day is
 * folded in too, so a trip that crosses midnight lands on the day it
 * actually finished. A completion recorded much later — an admin backdating
 * a past trip's odometer/times today — must never move the trip onto
 * today's date; it still belongs to its original service date.
 */
/**
 * Timestamp to stamp as `completedAt` when a trip auto-completes. A trip
 * scheduled today (or with no date) really is finishing right now. A trip
 * scheduled in the past is being backdated — an admin filling in a past
 * trip's odometer/times — and must be anchored to its own service date
 * instead of the current moment, or it would misfile as today's work.
 */
export function resolveTripCompletionTimestamp(trip, now = new Date()) {
  const dateKey = tripCalendarDateKey(trip?.date);
  const todayKey = localCalendarYmd(now);
  if (!dateKey || dateKey >= todayKey) return now.toISOString();

  const recordedDropoff = trip?.arrivalDropoffTime || trip?.dropoffArrival;
  if (recordedDropoff) {
    const parsed = new Date(recordedDropoff);
    if (!Number.isNaN(parsed.getTime()) && tripCalendarDateKey(parsed) === dateKey) {
      return parsed.toISOString();
    }
  }
  // No recorded dropoff time on that date: anchor late in that day so it
  // still sorts after other same-day activity without claiming to be "now".
  const anchor = new Date(`${dateKey}T23:59:00`);
  return Number.isNaN(anchor.getTime()) ? now.toISOString() : anchor.toISOString();
}

export function getTripHistoryDateKey(trip) {
  const dateKey = tripCalendarDateKey(trip?.date);
  if (dateKey) return dateKey;
  return tripCalendarDateKey(trip?.completedAt);
}

/**
 * True if trip service date is today or tomorrow (local calendar).
 * Returns false for missing/unparseable dates (trips without a date are excluded).
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

/**
 * True if the trip date is today, tomorrow, or yesterday.
 * Returns false for missing/unparseable dates.
 */
export function isTripDateRecent(tripDate) {
  const key = tripCalendarDateKey(tripDate);
  if (key === undefined) return false;
  const now = new Date();
  const todayKey = localYmd(now);
  if (key === todayKey) return true;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (key === localYmd(tomorrow)) return true;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === localYmd(yesterday)) return true;
  return false;
}

/**
 * True if the trip date is today.
 * Returns false for missing/unparseable dates.
 */
export function isTripDateToday(tripDate) {
  const key = tripCalendarDateKey(tripDate);
  if (key === undefined) return false;
  return key === localYmd(new Date());
}

/** Trips with no usable date key are excluded from manifest days. */
export function tripMatchesCalendarDay(tripDate, dayKey) {
  const key = tripCalendarDateKey(tripDate);
  if (key === undefined) return false;
  return key === dayKey;
}

/**
 * Match a trip-like record to an explicit service date. Keeping this helper at
 * the boundary prevents report and admin views from accidentally comparing a
 * timestamp string directly with a calendar input value.
 */
export function tripMatchesServiceDate(trip, dayKey) {
  if (!trip || !dayKey) return false;
  return tripCalendarDateKey(trip.date ?? trip.serviceDate ?? trip.pickupDate) === dayKey;
}

export function buildOdometerDistance(startOdo, endOdo) {
  const start = Number(startOdo);
  const end = Number(endOdo);
  if (Number.isNaN(start) || Number.isNaN(end)) return '';
  const diff = end - start;
  return diff >= 0 ? Number(diff.toFixed(1)) : '';
}

export function buildTravelDuration(startTime, endTime) {
  if (!startTime || !endTime) return '';
  const parseMinutes = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.getHours() * 60 + d.getMinutes();
      }
      return null;
    }
    const mins = timeToMinutes(raw);
    return Number.isFinite(mins) ? mins : null;
  };
  const s = new Date(startTime);
  const e = new Date(endTime);
  if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
    const diff = Math.round((e - s) / 60000);
    if (diff < 0) return '';
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}m`;
  }
  const start = parseMinutes(startTime);
  const end = parseMinutes(endTime);
  if (start === null || end === null || end < start) return '';
  const diff = end - start;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return hours > 0 ? `${hours}h${mins > 0 ? mins : ''}` : `${mins}m`;
}
