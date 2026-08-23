function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function addToIndex(index, key, value) {
  const matches = index.get(key);
  if (matches) {
    matches.push(value);
  } else {
    index.set(key, [value]);
  }
}

/**
 * Index trips by the exact same id-or-email relationship used by the live map.
 * This avoids rescanning every trip (and the full driver list) for every driver.
 */
export function buildDriverTripBuckets(trips = [], drivers = []) {
  const driverList = Array.isArray(drivers) ? drivers : [];
  const tripList = Array.isArray(trips) ? trips : [];
  const buckets = new Map(driverList.map(driver => [driver, []]));
  const driversById = new Map();
  const driversByEmail = new Map();

  driverList.forEach((driver) => {
    addToIndex(driversById, driver?.id, driver);
    addToIndex(driversByEmail, normalizeEmail(driver?.email), driver);
  });

  tripList.forEach((trip) => {
    const idMatches = driversById.get(trip?.driverId) || [];
    const resolvedEmail = normalizeEmail(trip?.driverEmail || idMatches[0]?.email);
    const emailMatches = driversByEmail.get(resolvedEmail) || [];
    const matchedDrivers = new Set([...idMatches, ...emailMatches]);

    matchedDrivers.forEach((driver) => {
      buckets.get(driver)?.push(trip);
    });
  });

  return buckets;
}

function finiteCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function tripPoint(trip, prefix) {
  const lat = finiteCoordinate(trip?.[`${prefix}Lat`]);
  const lng = finiteCoordinate(trip?.[`${prefix}Lng`]);
  return lat === null || lng === null ? null : { lat, lng };
}

export function normalizeMapPoint(point) {
  const lat = finiteCoordinate(point?.lat);
  const lng = finiteCoordinate(point?.lng);
  return lat === null || lng === null ? null : { lat, lng };
}

/**
 * Build an immutable Directions request description plus a stable fingerprint.
 * Equivalent cloned props therefore do not trigger another paid route request.
 */
export function buildRoutePlan(orderedTrips = [], driverPosition = null) {
  const ordered = Array.isArray(orderedTrips) ? orderedTrips : [];
  if (ordered.length === 0) return null;

  const firstWithPickup = ordered.find(trip => tripPoint(trip, 'pickup'));
  const lastWithDropoff = [...ordered].reverse().find(trip => tripPoint(trip, 'dropoff'));
  if (!firstWithPickup || !lastWithDropoff) return null;

  const origin = normalizeMapPoint(driverPosition) || tripPoint(firstWithPickup, 'pickup');
  const destination = tripPoint(lastWithDropoff, 'dropoff');
  if (!origin || !destination) return null;

  const waypoints = [];
  ordered.forEach((trip) => {
    const pickup = tripPoint(trip, 'pickup');
    if (pickup && trip?.id !== ordered[0]?.id) waypoints.push(pickup);

    const dropoff = tripPoint(trip, 'dropoff');
    if (dropoff && trip?.id !== ordered[ordered.length - 1]?.id) waypoints.push(dropoff);
  });

  const key = [origin, ...waypoints, destination]
    .map(point => `${point.lat},${point.lng}`)
    .join('|');

  return { origin, waypoints, destination, key };
}

export function buildStopsFingerprint(stops = []) {
  return JSON.stringify((Array.isArray(stops) ? stops : []).map(stop => [
    stop?.id || '',
    finiteCoordinate(stop?.lat),
    finiteCoordinate(stop?.lng),
    stop?.label || '',
    stop?.type || '',
    stop?.patient || '',
    stop?.address || '',
    stop?.trip?.bookingId || '',
  ]));
}

export function shouldAnimateMapMarkers({ coarsePointer = false, reducedMotion = false } = {}) {
  return !coarsePointer && !reducedMotion;
}
