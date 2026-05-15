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

/** If the trip has no usable date key, it matches any manifest day (legacy / incomplete rows). */
export function tripMatchesCalendarDay(tripDate, dayKey) {
  const key = tripCalendarDateKey(tripDate);
  if (key === undefined) return true;
  return key === dayKey;
}
