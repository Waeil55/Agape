import { haversineMiles, roundNumber } from './driverTelemetry';

const MAX_REASONABLE_SPEED_MPH = 95;
const TELEPORT_SPEED_MPH = 140;
const POOR_ACCURACY_METERS = 150;
const SPOOF_ACCURACY_METERS = 5;
const SPOOF_SPEED_MPH = 75;
const INACTIVITY_MINUTES = 10;
const GEOFENCE_RADIUS_MILES = 0.2;

const parseTime = (value) => {
  const parsed = Date.parse(value || 0);
  return Number.isFinite(parsed) ? parsed : null;
};

const flag = (flags, type, severity, message, data = {}) => {
  flags.push({
    type,
    severity,
    message,
    data,
    detectedAt: new Date().toISOString(),
  });
};

export function detectLocationFraud({
  previousDriver = {},
  previousSample = null,
  latitude,
  longitude,
  telemetry = {},
  activeTrip = null,
  movement = {},
  updatedAt = new Date(),
}) {
  const updatedAtIso = updatedAt instanceof Date ? updatedAt.toISOString() : new Date(updatedAt).toISOString();
  const nextPoint = { lat: Number(latitude), lng: Number(longitude) };
  const previousPoint = previousSample?.lat && previousSample?.lng
    ? { lat: Number(previousSample.lat), lng: Number(previousSample.lng) }
    : {
        lat: Number(previousDriver?.latitude ?? previousDriver?.lat),
        lng: Number(previousDriver?.longitude ?? previousDriver?.lng),
      };
  const previousAt =
    parseTime(previousSample?.at || previousSample?.updatedAt || previousSample?.capturedAt) ||
    parseTime(previousDriver?.lastLocationUpdate || previousDriver?.telemetry?.updatedAt || previousDriver?.updatedAtLocal);
  const currentAt = parseTime(updatedAtIso) || Date.now();
  const hasPreviousPoint = Number.isFinite(previousPoint.lat) && Number.isFinite(previousPoint.lng) && previousAt && currentAt > previousAt;
  const elapsedSeconds = hasPreviousPoint ? Math.max(0, (currentAt - previousAt) / 1000) : 0;
  const distanceMiles = hasPreviousPoint ? haversineMiles(previousPoint, nextPoint) : 0;
  const inferredSpeedMph = elapsedSeconds > 0 ? distanceMiles / (elapsedSeconds / 3600) : null;
  const reportedSpeedMph = Number.isFinite(Number(telemetry.speedMph)) ? Number(telemetry.speedMph) : null;
  const effectiveSpeedMph = reportedSpeedMph ?? inferredSpeedMph;
  const accuracy = Number.isFinite(Number(telemetry.accuracy)) ? Number(telemetry.accuracy) : null;
  const flags = [];

  if (Number.isFinite(effectiveSpeedMph) && effectiveSpeedMph > MAX_REASONABLE_SPEED_MPH) {
    flag(flags, 'impossible_speed', effectiveSpeedMph > TELEPORT_SPEED_MPH ? 'critical' : 'warning', 'Location stream reported an impossible driving speed.', {
      effectiveSpeedMph: roundNumber(effectiveSpeedMph, 1),
      reportedSpeedMph: roundNumber(reportedSpeedMph, 1),
      inferredSpeedMph: roundNumber(inferredSpeedMph, 1),
      distanceMiles: roundNumber(distanceMiles, 3),
      elapsedSeconds: roundNumber(elapsedSeconds, 1),
    });
  }

  if (Number.isFinite(inferredSpeedMph) && inferredSpeedMph > TELEPORT_SPEED_MPH && distanceMiles > 0.25) {
    flag(flags, 'teleport', 'critical', 'Location jumped farther than physically possible for the elapsed time.', {
      inferredSpeedMph: roundNumber(inferredSpeedMph, 1),
      distanceMiles: roundNumber(distanceMiles, 3),
      elapsedSeconds: roundNumber(elapsedSeconds, 1),
    });
  }

  if (accuracy !== null && accuracy > POOR_ACCURACY_METERS) {
    flag(flags, 'poor_accuracy', 'info', 'GPS accuracy is too low for reliable trip verification.', {
      accuracyMeters: roundNumber(accuracy, 1),
    });
  }

  if (accuracy !== null && accuracy <= SPOOF_ACCURACY_METERS && Number.isFinite(effectiveSpeedMph) && effectiveSpeedMph >= SPOOF_SPEED_MPH) {
    flag(flags, 'gps_spoof_suspected', 'warning', 'GPS precision and speed pattern may indicate spoofing.', {
      accuracyMeters: roundNumber(accuracy, 1),
      effectiveSpeedMph: roundNumber(effectiveSpeedMph, 1),
    });
  }

  if (movement?.movementState === 'stopped' && Number(movement?.dwellMinutes || 0) >= INACTIVITY_MINUTES && activeTrip?.id) {
    flag(flags, 'inactivity', 'warning', 'Driver has been inactive during an active trip.', {
      dwellMinutes: Number(movement.dwellMinutes || 0),
      tripId: activeTrip.id,
      tripStatus: activeTrip.status || '',
    });
  }

  const geofence = telemetry.geofence || {};
  if (geofence.targetLat && geofence.targetLng) {
    const distanceToTargetMiles = haversineMiles(nextPoint, { lat: geofence.targetLat, lng: geofence.targetLng });
    const radiusMiles = Number(geofence.radiusMiles || GEOFENCE_RADIUS_MILES);
    const shouldBeNearTarget = ['At Pickup', 'At Dropoff', 'Arrived', 'Arrived PU', 'Arrived DO'].includes(String(activeTrip?.status || geofence.tripStatus || ''));
    if (shouldBeNearTarget && distanceToTargetMiles > radiusMiles) {
      flag(flags, 'geofence_violation', 'warning', 'Trip status says arrived, but driver is outside the expected geofence.', {
        targetType: geofence.targetType || '',
        targetAddress: geofence.targetAddress || '',
        distanceMiles: roundNumber(distanceToTargetMiles, 3),
        radiusMiles,
        tripId: activeTrip?.id || geofence.tripId || null,
      });
    }
  }

  return {
    flags,
    flagTypes: flags.map((item) => item.type),
    highestSeverity: flags.some((item) => item.severity === 'critical')
      ? 'critical'
      : flags.some((item) => item.severity === 'warning')
        ? 'warning'
        : flags.some((item) => item.severity === 'info')
          ? 'info'
          : 'none',
    metrics: {
      distanceMiles: roundNumber(distanceMiles, 4) || 0,
      elapsedSeconds: roundNumber(elapsedSeconds, 1) || 0,
      inferredSpeedMph: roundNumber(inferredSpeedMph, 1),
      reportedSpeedMph: roundNumber(reportedSpeedMph, 1),
      effectiveSpeedMph: roundNumber(effectiveSpeedMph, 1),
      accuracyMeters: accuracy,
    },
    evaluatedAt: updatedAtIso,
  };
}

export function hasFraudFlags(result = {}) {
  return Array.isArray(result.flags) && result.flags.length > 0;
}
