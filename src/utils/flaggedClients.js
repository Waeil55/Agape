import { db, doc, getDoc, getDocs, collection, setDoc, serverTimestamp, arrayUnion } from '../config/firebase';
import { normalizeClientKey } from './clientProfileUtils';

const COLLECTION = 'flaggedClients';

/**
 * Record a "bad client" report from the trip 3-dot menu. Reports accumulate
 * per client (by normalized name) instead of overwriting each other, so a
 * repeat problem is visible as a history, not just a single note.
 */
export const reportBadClient = async (patientName, { reason = '', note = '', tripId = '', bookingId = '' } = {}, reportedBy = '') => {
  const key = normalizeClientKey(patientName);
  if (!key) return null;
  const ref = doc(db, COLLECTION, key);
  const existing = await getDoc(ref).catch(() => null);
  const entry = {
    reason: reason || '',
    note: String(note || '').trim(),
    tripId: tripId || '',
    bookingId: bookingId || '',
    reportedBy: reportedBy || '',
    reportedAt: new Date().toISOString(),
  };
  await setDoc(ref, {
    patientName: patientName || '',
    active: true,
    reportCount: (existing?.exists() ? Number(existing.data()?.reportCount || 0) : 0) + 1,
    lastReason: entry.reason,
    lastNote: entry.note,
    lastReportedBy: entry.reportedBy,
    lastReportedAt: serverTimestamp(),
    reports: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return entry;
};

/** Look up whether a client is currently flagged (for a warning at booking time). */
export const getFlaggedClient = async (patientName) => {
  const key = normalizeClientKey(patientName);
  if (!key) return null;
  const snap = await getDoc(doc(db, COLLECTION, key)).catch(() => null);
  if (!snap?.exists()) return null;
  const data = snap.data();
  return data?.active === false ? null : data;
};

/** List every flagged client for the Settings table. */
export const listFlaggedClients = async () => {
  const snap = await getDocs(collection(db, COLLECTION)).catch(() => null);
  if (!snap) return [];
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

export const unflagClient = async (patientName) => {
  const key = normalizeClientKey(patientName);
  if (!key) return;
  await setDoc(doc(db, COLLECTION, key), { active: false, updatedAt: serverTimestamp() }, { merge: true });
};

export const reactivateFlaggedClient = async (patientName) => {
  const key = normalizeClientKey(patientName);
  if (!key) return;
  await setDoc(doc(db, COLLECTION, key), { active: true, updatedAt: serverTimestamp() }, { merge: true });
};
