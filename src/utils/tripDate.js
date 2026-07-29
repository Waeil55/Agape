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

/** Convert a UTC ISO timestamp string to a local YYYY-MM-DD date key. */
export function isoToLocalDateKey(isoString) {
  if (!isoString || typeof isoString !== 'string') return undefined;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return undefined;
  return localYmd(d);
}

/** Local calendar YYYY-MM-DD for a Date (default: now). */
export function localCalendarYmd(d = new Date()) {
  return localYmd(d);
}

export function calendarDateKeyDaysAgo(daysAgo = 0, from = new Date()) {
  const base = from instanceof Date ? from : new Date(from);
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  const d = new Date(safeBase.getFullYear(), safeBase.getMonth(), safeBase.getDate());
  d.setDate(d.getDate() - Math.max(0, Number(daysAgo) || 0));
  return localYmd(d);
}

export function isCalendarDateKeyWithinLastDays(dateKey, days = 14, from = new Date()) {
  if (!dateKey) return false;
  const lookbackDays = Math.max(1, Number(days) || 1);
  const startKey = calendarDateKeyDaysAgo(lookbackDays - 1, from);
  const endKey = localCalendarYmd(from);
  return dateKey >= startKey && dateKey <= endKey;
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
