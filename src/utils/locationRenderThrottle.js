import { haversineMiles } from './driverTelemetry';

export const POSITION_RENDER_INTERVAL_MS = 2000;
export const POSITION_RENDER_DISTANCE_MILES = 0.005;

export function shouldPublishPositionUpdate(
  previousNotification,
  nextPosition,
  nowMs,
  {
    intervalMs = POSITION_RENDER_INTERVAL_MS,
    distanceMiles = POSITION_RENDER_DISTANCE_MILES,
  } = {},
) {
  if (!nextPosition || !Number.isFinite(nextPosition.lat) || !Number.isFinite(nextPosition.lng)) {
    return false;
  }
  if (!previousNotification?.position) return true;
  const elapsedMs = Number(nowMs) - Number(previousNotification.notifiedAt || 0);
  if (!Number.isFinite(elapsedMs) || elapsedMs >= intervalMs) return true;

  const previous = previousNotification.position;
  if (!Number.isFinite(previous.lat) || !Number.isFinite(previous.lng)) return true;
  return haversineMiles(previous, nextPosition) >= distanceMiles;
}
