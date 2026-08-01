import {
  collection, db, deleteField, doc, functions, httpsCallable, limit, onSnapshot,
  orderBy, query, setDoc, where,
} from '../../../config/firebase';
import { DEFAULT_WELLTRANS_FIELD_MAPPING } from '../utils/welltransMapping';

export const DEFAULT_SETTINGS = {
  enabled: false, portalUrl: 'https://tripspark.welltransnemt.com/', automationMethod: 'playwright', lastSync: null,
  autoStart: false, autoQueue: false, autoRetryEnabled: false,
  autoRetryDelayMs: 30000, maxConcurrent: 1,
  fieldMapping: DEFAULT_WELLTRANS_FIELD_MAPPING,
};

export const subscribeWellTransSettings = (callback, onError) =>
  onSnapshot(doc(db, 'welltrans_settings', 'primary'), snapshot => callback(snapshot.exists() ? { ...DEFAULT_SETTINGS, ...snapshot.data() } : DEFAULT_SETTINGS), onError);

const timestampMillis = value => value?.toMillis?.()
  || value?.toDate?.()?.getTime?.()
  || (value ? new Date(value).getTime() : 0)
  || 0;

export const subscribeWellTransLogs = (serviceDate, callback, onError) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(serviceDate || ''))) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, 'welltrans_sync_logs'), where('serviceDate', '==', serviceDate)),
    snapshot => callback(snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((left, right) =>
        timestampMillis(right.updatedAt || right.createdAt) - timestampMillis(left.updatedAt || left.createdAt))),
    onError,
  );
};

export const subscribeWellTransWorker = (callback, onError) =>
  onSnapshot(doc(db, 'welltrans_worker_status', 'primary'), snapshot => callback(snapshot.exists() ? snapshot.data() : null), onError);

export const subscribeWellTransWorkers = (callback, onError) =>
  onSnapshot(
    query(collection(db, 'welltrans_workers'), orderBy('lastSeenAt', 'desc'), limit(20)),
    snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    onError,
  );

export const subscribeWellTransOperations = (callback, onError) =>
  onSnapshot(
    doc(db, 'welltrans_operations', 'health'),
    snapshot => callback(snapshot.exists() ? snapshot.data() : null),
    onError,
  );

export const subscribeWellTransCanary = (callback, onError) =>
  onSnapshot(
    doc(db, 'welltrans_canary', 'latest'),
    snapshot => callback(snapshot.exists() ? snapshot.data() : null),
    onError,
  );

export const subscribeWellTransManifest = (serviceDate, callback, onError) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(serviceDate || ''))) {
    callback(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'welltrans_sync_manifests', serviceDate),
    snapshot => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  );
};

export const saveWellTransSettings = (settings, actorId) => {
  const {
    portalUsername: _portalUsername,
    portalPassword: _portalPassword,
    password: _password,
    credentials: _credentials,
    token: _token,
    accessToken: _accessToken,
    refreshToken: _refreshToken,
    ...safeSettings
  } = settings || {};
  return setDoc(doc(db, 'welltrans_settings', 'primary'), {
    ...safeSettings,
    portalUsername: deleteField(),
    portalPassword: deleteField(),
    password: deleteField(),
    credentials: deleteField(),
    token: deleteField(),
    accessToken: deleteField(),
    refreshToken: deleteField(),
    updatedBy: actorId,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

export const queueWellTransSync = (tripIds, mode, serviceDate) =>
  httpsCallable(functions, 'queueWellTransSync')({ tripIds, mode, serviceDate });

export const explainWellTransFailureAI = logId =>
  httpsCallable(functions, 'explainWellTransFailureAI')({ logId });

export const confirmWellTransDateApplied = serviceDate =>
  httpsCallable(functions, 'confirmWellTransDateApplied')({ serviceDate });

export const confirmWellTransReviewBatchApplied = (serviceDate, reviewSessionId) =>
  httpsCallable(functions, 'confirmWellTransReviewBatchApplied')({
    serviceDate,
    reviewSessionId,
  });

export const isWellTransFailureRetryable = log => {
  if (!log || log.status !== 'failed') return false;
  const message = String(log.errorMessage || '').toLowerCase();
  return !message.includes('matched 0 pickup')
    && !message.includes('expected exactly one of each')
    && !message.includes('does not match trip service date')
    && !message.includes('source trip is not ready')
    && !message.includes('source trip') && !message.includes('no longer exists');
};

export const explainWellTransFailure = (log) => {
  if (!log) return 'Select a failed synchronization to review it.';
  const message = String(log.errorMessage || 'The automation worker did not provide a detailed error.');
  const lower = message.toLowerCase();
  if (lower.includes('mileage')) return `Trip ${log.bookingId || log.tripId} failed because a valid mileage value was unavailable or the WellTrans mileage field could not be located. Verify both odometer readings and the configured field mapping, then retry.`;
  if (lower.includes('booking')) return `Trip ${log.bookingId || log.tripId} could not be matched by Booking ID. Passenger names are intentionally not used as a fallback. Confirm the exact WellTrans Booking ID, then retry.`;
  if (lower.includes('session') || lower.includes('login') || lower.includes('auth')) return `The encrypted WellTrans browser session is unavailable or expired. Start the local worker, sign in manually, and reopen TRIPS - ASSIGNED. Agape never stores the broker password.`;
  if (lower.includes('selector') || lower.includes('field')) return `WellTrans did not expose an expected field for trip ${log.bookingId || log.tripId}. Review the captured screenshot and update the selector configuration before retrying.`;
  return `Trip ${log.bookingId || log.tripId} failed during the ${log.stage || 'automation'} stage: ${message} Review the screenshot and retry after correcting the source data or portal configuration.`;
};

export const exportWellTransLogsCSV = (logs = [], serviceDate = '') => {
  if (!logs || !logs.length) return;
  const headers = ['Booking ID', 'Trip ID', 'Service Date', 'Status', 'Stage', 'Error Message', 'Timestamp', 'Screenshot Link'];
  const rows = logs.map(log => [
    `"${log.bookingId || ''}"`,
    `"${log.tripId || ''}"`,
    `"${log.serviceDate || serviceDate}"`,
    `"${log.status || ''}"`,
    `"${log.stage || ''}"`,
    `"${(log.errorMessage || '').replace(/"/g, '""')}"`,
    `"${log.completedAt || log.stagedAt || log.createdAt || ''}"`,
    `"${log.screenshot || ''}"`,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `WellTrans_Sync_Report_${serviceDate || 'all'}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportTripsQueueCSV = (trips = [], logs = [], serviceDate = '') => {
  const latestByTrip = new Map();
  logs.forEach(log => {
    const current = latestByTrip.get(log.tripId);
    if (!current || timestampMillis(log.updatedAt || log.createdAt) > timestampMillis(current.updatedAt || current.createdAt)) latestByTrip.set(log.tripId, log);
  });
  const headers = ['Booking ID', 'Passenger', 'Driver', 'Vehicle', 'Pickup Arrival', 'Pickup Departure', 'Start Odometer', 'Dropoff Arrival', 'Dropoff Departure', 'End Odometer', 'Trip Miles', 'Signature Captured', 'Validation', 'Sync Status', 'Error'];
  const rows = trips.map(trip => {
    const log = latestByTrip.get(trip.id);
    const payload = trip._payload || {};
    return [
      `"${trip.bookingId || trip.id || ''}"`,
      `"${(trip.patient || trip.clientName || '').replace(/"/g, '""')}"`,
      `"${(payload.driver || trip.driverName || '').replace(/"/g, '""')}"`,
      `"${(payload.vehicle || '').replace(/"/g, '""')}"`,
      `"${payload?.pickup?.arrival || ''}"`,
      `"${payload?.pickup?.departure || ''}"`,
      `"${payload?.pickup?.mileage ?? ''}"`,
      `"${payload?.dropoff?.arrival || ''}"`,
      `"${payload?.dropoff?.departure || ''}"`,
      `"${payload?.dropoff?.mileage ?? ''}"`,
      `"${payload?.pickup?.mileage != null && payload?.dropoff?.mileage != null ? Math.max(0, payload.dropoff.mileage - payload.pickup.mileage) : ''}"`,
      `"${payload?.dropoff?.signatureCaptured ? 'Yes' : 'No'}"`,
      `"${trip._valid ? 'Valid' : (trip._errors || []).join('; ')}"`,
      `"${log?.status || 'Not Queued'}"`,
      `"${(log?.errorMessage || '').replace(/"/g, '""')}"`,
    ];
  });
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `WellTrans_Queue_${serviceDate || 'all'}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const FAILURE_CATEGORIES = [
  { key: 'mileage', label: 'Mileage', match: m => m.includes('mileage') },
  { key: 'booking', label: 'Booking ID', match: m => m.includes('booking') },
  { key: 'session', label: 'Session/Auth', match: m => m.includes('session') || m.includes('login') || m.includes('auth') },
  { key: 'selector', label: 'Selector/Field', match: m => m.includes('selector') || m.includes('field') },
  { key: 'other', label: 'Other', match: () => true },
];

export const categorizeFailure = (log) => {
  const msg = String(log?.errorMessage || '').toLowerCase();
  return FAILURE_CATEGORIES.find(c => c.match(msg))?.key || 'other';
};
