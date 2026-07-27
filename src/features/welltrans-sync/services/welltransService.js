import { collection, db, doc, functions, httpsCallable, onSnapshot, orderBy, query, setDoc } from '../../../config/firebase';
import { DEFAULT_WELLTRANS_FIELD_MAPPING } from '../utils/welltransMapping';

export const DEFAULT_SETTINGS = {
  enabled: false, portalUrl: 'https://tripspark.welltransnemt.com/', automationMethod: 'playwright', lastSync: null,
  fieldMapping: DEFAULT_WELLTRANS_FIELD_MAPPING,
};

export const subscribeWellTransSettings = (callback, onError) =>
  onSnapshot(doc(db, 'welltrans_settings', 'primary'), snapshot => callback(snapshot.exists() ? { ...DEFAULT_SETTINGS, ...snapshot.data() } : DEFAULT_SETTINGS), onError);

export const subscribeWellTransLogs = (callback, onError) =>
  onSnapshot(query(collection(db, 'welltrans_sync_logs'), orderBy('createdAt', 'desc')), snapshot => callback(snapshot.docs.slice(0, 250).map(item => ({ id: item.id, ...item.data() }))), onError);

export const saveWellTransSettings = (settings, actorId) =>
  setDoc(doc(db, 'welltrans_settings', 'primary'), { ...settings, updatedBy: actorId, updatedAt: new Date().toISOString() }, { merge: true });

export const queueWellTransSync = (tripIds, mode = 'selected') =>
  httpsCallable(functions, 'queueWellTransSync')({ tripIds, mode });

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
