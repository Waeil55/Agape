export function toValidDate(value) {
  if (value === null || value === undefined || value === '') return null;
  try {
    let date;
    if (value instanceof Date) date = new Date(value.getTime());
    else if (typeof value?.toDate === 'function') date = value.toDate();
    else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000);
    else if (typeof value === 'string') {
      const raw = value.trim();
      const usDate = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (usDate) date = new Date(Number(usDate[3]), Number(usDate[1]) - 1, Number(usDate[2]), 12, 0, 0, 0);
      else if (isoDate) date = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), 12, 0, 0, 0);
      else date = new Date(raw);
    } else date = new Date(value);
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

export function hasExplicitTime(value) {
  if (value instanceof Date || typeof value?.toDate === 'function' || typeof value?.seconds === 'number') return true;
  if (typeof value === 'number') return true;
  return typeof value === 'string' && /(?:T|\s)\d{1,2}:\d{2}|^\d{1,2}:\d{2}/.test(value.trim());
}

export function toSafeIso(value, fallback = null) {
  const date = toValidDate(value);
  return date ? date.toISOString() : fallback;
}

export function safeDateMillis(value, fallback = null) {
  const date = toValidDate(value);
  return date ? date.getTime() : fallback;
}
