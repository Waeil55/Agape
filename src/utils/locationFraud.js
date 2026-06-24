import { haversineMiles, roundNumber } from './driverTelemetry';

export const LOCATION_STREAM_INTERVAL_MS = 2000;
export const LOCATION_STALE_AFTER_MS = 15000;
export const MAX_REASONABLE_SPEED_MPH = 95;
export const TELEPORT_SPEED_MPH = 140;
export const POOR_ACCURACY_METERS = 150;
export const IDLE_SIGNAL_MS = 5 * 60 * 1000;

export function normalizeCoordinate(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function metersPerSecondToMph(value) {
  const num = Number(value);
  return Number.isFinite(num) ? roundNumber(num * 2.2369362921, 1) : null;
}

export function buildLocationFraudSignals(previousSample = null, nextSample = {}) {
  const lat = normalizeCoordinate(nextSample.lat);
  const lng = normalizeCoordinate(nextSample.lng);
  const accuracy = Number(nextSample.accuracy);
  const speedMph = Number(nextSample.speedMph);
  const capturedMs = Date.parse(nextSample.capturedAt || nextSample.recordedAt || new Date().toISOString());
  const previousMs = previousSample
    ? Date.parse(previousSample.capturedAt || previousSample.recordedAt || previousSample.updatedAt || 0)
    : NaN;

  const hasPreviousPoint = previousSample
    && normalizeCoordinate(previousSample.lat) !== null
    && normalizeCoordinate(previousSample.lng) !== null
    && Number.isFinite(previousMs)
    && Number.isFinite(capturedMs)
    && capturedMs > previousMs;

  const elapsedSeconds = hasPreviousPoint ? Math.max(0, (capturedMs - previousMs) / 1000) : 0;
  const distanceMiles = hasPreviousPoint
    ? haversineMiles(previousSample, { lat, lng })
    : 0;
  const inferredSpeedMph = elapsedSeconds > 0
    ? distanceMiles / (elapsedSeconds / 3600)
    : null;

  const effectiveSpeedMph = Number.isFinite(speedMph) ? speedMph : inferredSpeedMph;
  const speedAnomaly = Number.isFinite(effectiveSpeedMph) && effectiveSpeedMph > MAX_REASONABLE_SPEED_MPH;
  const teleport = Number.isFinite(inferredSpeedMph) && inferredSpeedMph > TELEPORT_SPEED_MPH && distanceMiles > 0.25;
  const poorAccuracy = Number.isFinite(accuracy) && accuracy > POOR_ACCURACY_METERS;
  const idle = Boolean(
    previousSample
    && distanceMiles < 0.02
    && Number.isFinite(capturedMs)
    && Number.isFinite(previousMs)
    && capturedMs - previousMs >= IDLE_SIGNAL_MS
  );

  const flags = [
    speedAnomaly ? 'speed_anomaly' : null,
    teleport ? 'teleport' : null,
    poorAccuracy ? 'poor_accuracy' : null,
    idle ? 'idle' : null,
  ].filter(Boolean);

  return {
    speedAnomaly,
    teleport,
    poorAccuracy,
    idle,
    flags,
    distanceMiles: roundNumber(distanceMiles, 4) || 0,
    elapsedSeconds: roundNumber(elapsedSeconds, 1) || 0,
    inferredSpeedMph: roundNumber(inferredSpeedMph, 1),
    maxReasonableSpeedMph: MAX_REASONABLE_SPEED_MPH,
    teleportSpeedMph: TELEPORT_SPEED_MPH,
  };
}

export function hasLocationFraudFlag(signals = {}) {
  return Boolean(
    signals.speedAnomaly ||
    signals.teleport ||
    signals.poorAccuracy
  );
}
