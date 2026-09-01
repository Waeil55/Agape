const isPlainRecord = (value) => {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Return a Firestore-safe copy without mutating the caller's data.
 *
 * Firestore does not accept `undefined`. Object properties containing it are
 * omitted, while undefined array positions become null so list indexes and
 * neighboring evidence are never shifted. SDK values such as Timestamp,
 * GeoPoint, DocumentReference, and FieldValue sentinels retain their identity.
 */
export function sanitizeFirestorePayload(value) {
  const ancestors = new WeakSet();

  const sanitize = (current, path, inArray) => {
    if (current === undefined) return inArray ? null : undefined;
    if (current === null || typeof current !== 'object') return current;
    if (!Array.isArray(current) && !isPlainRecord(current)) return current;
    if (ancestors.has(current)) {
      throw new TypeError(`Firestore payload contains a circular value at ${path}`);
    }

    ancestors.add(current);
    let sanitized;
    if (Array.isArray(current)) {
      sanitized = current.map((item, index) => sanitize(item, `${path}[${index}]`, true));
    } else {
      sanitized = {};
      Object.entries(current).forEach(([key, item]) => {
        const next = sanitize(item, `${path}.${key}`, false);
        if (next !== undefined) sanitized[key] = next;
      });
    }
    ancestors.delete(current);
    return sanitized;
  };

  const sanitized = sanitize(value, '$', false);
  return sanitized === undefined ? null : sanitized;
}

export default sanitizeFirestorePayload;
