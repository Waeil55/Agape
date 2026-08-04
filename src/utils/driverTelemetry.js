const MOVING_SPEED_THRESHOLD_MPH = 4;
const MOVING_DISTANCE_THRESHOLD_MILES = 0.03;
const MAX_ELAPSED_MINUTES = 30;
const BREADCRUMB_LIMIT = 120;
const STOP_EVENT_LIMIT = 30;

export function todayLocal(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildTelemetryDocId(driverId, date = todayLocal()) {
  return `${String(driverId || 'driver').replace(/[^a-zA-Z0-9_-]/g, '_')}__${date}`;
}

export function roundNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(digits));
}

export function formatTelemetryDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return '0m';
  if (value < 1) return '<1m';
  if (value < 60) return `${Math.round(value)}m`;
  const hours = Math.floor(value / 60);
  const mins = Math.round(value % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatMovementState(state) {
  if (state === 'moving') return 'Moving';
  if (state === 'stopped') return 'Stopped';
  return 'Unknown';
}

export function getDriverTelemetryForDate(docs = [], driverId, date = todayLocal()) {
  return (docs || []).find((doc) => doc.driverId === driverId && doc.date === date) || null;
}

export function getLatestDriverTelemetry(docs = [], driverId) {
  return (docs || [])
    .filter((doc) => doc.driverId === driverId)
    .sort((a, b) => Date.parse(b?.lastPingAt || b?.updatedAtLocal || 0) - Date.parse(a?.lastPingAt || a?.updatedAtLocal || 0))[0] || null;
}

export function getDriverTelemetryBreadcrumbs(docs = [], driver = {}, date = null) {
  const keys = new Set([
    driver?.id,
    driver?.driverId,
    driver?.uid,
    driver?.email,
    driver?.name,
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase()));

  return (docs || [])
    .filter((telemetry) => {
      if (date && telemetry?.date !== date) return false;
      const telemetryKeys = [
        telemetry?.driverId,
        telemetry?.uid,
        telemetry?.driverEmail,
        telemetry?.email,
        telemetry?.driverName,
      ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
      return telemetryKeys.some((value) => keys.has(value));
    })
    .flatMap((telemetry) => Array.isArray(telemetry?.breadcrumbs) ? telemetry.breadcrumbs : [])
    .filter(Boolean)
    .sort((a, b) => Date.parse(a?.capturedAt || a?.recordedAt || a?.timestamp || a?.at || 0)
      - Date.parse(b?.capturedAt || b?.recordedAt || b?.timestamp || b?.at || 0));
}

export function haversineMiles(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

export function deriveMovementState(previousDriver = {}, latitude, longitude, telemetry = {}, updatedAtInput = new Date()) {
  const updatedAt = updatedAtInput instanceof Date ? updatedAtInput : new Date(updatedAtInput);
  const updatedAtIso = updatedAt.toISOString();
  const point = { lat: Number(latitude), lng: Number(longitude) };
  const prevPoint = {
    lat: Number(previousDriver?.latitude ?? previousDriver?.lat),
    lng: Number(previousDriver?.longitude ?? previousDriver?.lng),
  };
  const hasPrevPoint = Number.isFinite(prevPoint.lat) && Number.isFinite(prevPoint.lng);
  const prevTimestampIso =
    previousDriver?.lastLocationUpdate ||
    previousDriver?.telemetry?.updatedAt ||
    previousDriver?.updatedAtLocal ||
    null;
  const prevTimestamp = prevTimestampIso ? Date.parse(prevTimestampIso) : NaN;
  const elapsedSeconds = Number.isFinite(prevTimestamp)
    ? Math.max(0, Math.round((updatedAt.getTime() - prevTimestamp) / 1000))
    : 0;
  const elapsedMinutes = Math.min(MAX_ELAPSED_MINUTES, elapsedSeconds / 60);
  const distanceMiles = hasPrevPoint ? haversineMiles(prevPoint, point) : 0;
  const speedMph = Number.isFinite(Number(telemetry?.speedMph)) ? Number(telemetry.speedMph) : null;
  const inferredSpeedMph = elapsedSeconds > 0 ? distanceMiles / (elapsedSeconds / 3600) : null;

  const staleGap = elapsedMinutes >= MAX_ELAPSED_MINUTES;

  const nextState = staleGap ? 'stopped' : (
    (speedMph !== null && speedMph >= MOVING_SPEED_THRESHOLD_MPH) ||
    distanceMiles >= MOVING_DISTANCE_THRESHOLD_MILES ||
    (inferredSpeedMph !== null && inferredSpeedMph >= MOVING_SPEED_THRESHOLD_MPH)
  )
    ? 'moving'
    : 'stopped';

  const previousState = staleGap ? null : (previousDriver?.movementState || previousDriver?.telemetry?.movementState || null);
  const movingSince = nextState === 'moving'
    ? (previousState === 'moving' ? previousDriver?.movingSince || previousDriver?.telemetry?.movingSince || updatedAtIso : updatedAtIso)
    : null;
  const stoppedSince = nextState === 'stopped'
    ? (previousState === 'stopped' ? previousDriver?.stoppedSince || previousDriver?.telemetry?.stoppedSince || updatedAtIso : updatedAtIso)
    : null;

  const movingMinutes = movingSince
    ? Math.min(MAX_ELAPSED_MINUTES, Math.max(0, Math.round((updatedAt.getTime() - Date.parse(movingSince)) / 60000)))
    : 0;
  const dwellMinutes = stoppedSince
    ? Math.min(MAX_ELAPSED_MINUTES, Math.max(0, Math.round((updatedAt.getTime() - Date.parse(stoppedSince)) / 60000)))
    : 0;

  return {
    movementState: nextState,
    previousState,
    stateChanged: Boolean(previousState) && previousState !== nextState,
    updatedAt: updatedAtIso,
    distanceMiles: roundNumber(distanceMiles, 3) || 0,
    inferredSpeedMph: roundNumber(inferredSpeedMph, 1),
    elapsedSeconds,
    elapsedMinutes,
    movingSince,
    stoppedSince,
    movingMinutes,
    dwellMinutes,
  };
}

export function shouldAppendBreadcrumb(previousSample, nextSample) {
  if (!previousSample) return true;
  const previousAt = Date.parse(previousSample.at || previousSample.updatedAt || 0);
  const nextAt = Date.parse(nextSample.at || nextSample.updatedAt || 0);
  const elapsedSeconds = Number.isFinite(previousAt) && Number.isFinite(nextAt)
    ? Math.max(0, Math.round((nextAt - previousAt) / 1000))
    : 0;
  const distanceMiles = haversineMiles(
    { lat: previousSample.lat, lng: previousSample.lng },
    { lat: nextSample.lat, lng: nextSample.lng }
  );
  return (
    previousSample.state !== nextSample.state ||
    distanceMiles >= 0.05 ||
    elapsedSeconds >= 45
  );
}

export function trimTelemetryCollections(doc = {}) {
  return {
    ...doc,
    breadcrumbs: Array.isArray(doc.breadcrumbs) ? doc.breadcrumbs.slice(-BREADCRUMB_LIMIT) : [],
    stopEvents: Array.isArray(doc.stopEvents) ? doc.stopEvents.slice(-STOP_EVENT_LIMIT) : [],
  };
}
