export function toValidDate(value) {
  if (value === null || value === undefined || value === '') return null;
  try {
    let date;
    if (value instanceof Date) date = new Date(value.getTime());
    else if (typeof value?.toDate === 'function') date = value.toDate();
    else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000);
    else date = new Date(value);
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

export function toSafeIso(value, fallback = null) {
  const date = toValidDate(value);
  return date ? date.toISOString() : fallback;
}

export function safeDateMillis(value, fallback = null) {
  const date = toValidDate(value);
  return date ? date.getTime() : fallback;
}
