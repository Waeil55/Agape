export const APP_DATA_CACHE_FIELDS = Object.freeze([
  'trips',
  'drivers',
  'dispatchers',
  'vehicles',
  'trashedTrips',
  'logs',
  'phoneNumbers',
]);

/**
 * Restore only fields that have not already received a live Firestore value.
 * Listeners resolve independently, so one fast metadata listener must never
 * suppress the cached trip manifest while the larger trip query is loading.
 */
export function mergeUnresolvedCachedFields(current, cached, remoteFields) {
  const next = { ...(current || {}) };
  const received = remoteFields instanceof Set ? remoteFields : new Set(remoteFields || []);

  APP_DATA_CACHE_FIELDS.forEach((field) => {
    if (!received.has(field) && Object.prototype.hasOwnProperty.call(cached || {}, field)) {
      next[field] = cached[field];
    }
  });

  return next;
}

export function isUnresolvedEmptyTripSnapshot(snapshot, initialized) {
  return !initialized && Boolean(snapshot?.metadata?.fromCache) && Boolean(snapshot?.empty);
}
