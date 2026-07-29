import { collection, db, doc, functions, httpsCallable, onSnapshot, query, setDoc, where } from '../../../config/firebase';
import { DEFAULT_WELLTRANS_FIELD_MAPPING } from '../utils/welltransMapping';

export const DEFAULT_SETTINGS = {
  enabled: false, portalUrl: 'https://tripspark.welltransnemt.com/', automationMethod: 'playwright', lastSync: null,
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
        timestampMillis(right.updatedAt || right.createdAt) - timestampMillis(left.updatedAt || left.createdAt))
      .slice(0, 500)),
    onError,
  );
};

export const subscribeWellTransWorker = (callback, onError) =>
  onSnapshot(doc(db, 'welltrans_worker_status', 'primary'), snapshot => callback(snapshot.exists() ? snapshot.data() : null), onError);

export const saveWellTransSettings = (settings, actorId) =>
  setDoc(doc(db, 'welltrans_settings', 'primary'), { ...settings, updatedBy: actorId, updatedAt: new Date().toISOString() }, { merge: true });

export const queueWellTransSync = (tripIds, mode, serviceDate) =>
  httpsCallable(functions, 'queueWellTransSync')({ tripIds, mode, serviceDate });

export const confirmWellTransApplied = logId =>
  httpsCallable(functions, 'confirmWellTransApplied')({ logId });

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
  if (lower.includes('session') || lower.includes('login') || lower.includes('auth')) return `The WellTrans session is unavailable or expired. An authorized administrator must refresh the worker's manual-login session; no password is stored in Agape.`;
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

