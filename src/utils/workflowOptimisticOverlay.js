import { safeDateMillis } from './safeDate';

const AUTHORITATIVE_UPDATE_FIELDS = [
  'workflowUpdatedAt', 'updatedAtLocal', 'updatedAt', 'syncedAtLocal', 'syncedAt',
];

export function latestWorkflowRecordMillis(record = {}) {
  return AUTHORITATIVE_UPDATE_FIELDS.reduce(
    (latest, field) => Math.max(latest, safeDateMillis(record?.[field], 0) || 0),
    0,
  );
}

// Optimistic progress may bridge the short render between a button press and
// the authoritative local trip update. It must never win over an equally new
// or newer trip record from the durable store/realtime listener.
export function shouldApplyWorkflowOverlay(trip, progress) {
  if (!trip || !progress) return false;
  const tripMillis = latestWorkflowRecordMillis(trip);
  const progressMillis = safeDateMillis(progress.workflowUpdatedAt, 0) || 0;
  if (tripMillis > 0 && (progressMillis === 0 || tripMillis >= progressMillis)) return false;
  return true;
}

export function isWorkflowOverlayConfirmed(trip, progress, workflowFields = []) {
  if (!trip || !progress) return false;
  const tripMillis = latestWorkflowRecordMillis(trip);
  const progressMillis = safeDateMillis(progress.workflowUpdatedAt, 0) || 0;
  if (tripMillis > 0 && progressMillis > 0 && tripMillis >= progressMillis) return true;

  const sameStatus = String(trip.status || '').trim().toLowerCase()
    === String(progress.status || '').trim().toLowerCase();
  if (!sameStatus) return false;
  return workflowFields.every((field) => {
    if (!Object.prototype.hasOwnProperty.call(progress, field)) return true;
    if (progress[field] === null) return trip[field] === null || trip[field] === undefined || trip[field] === '';
    return String(trip[field] ?? '') === String(progress[field] ?? '');
  });
}
