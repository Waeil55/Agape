import { db, doc, getDoc, setDoc, serverTimestamp } from '../config/firebase';
import { FIRESTORE_COLLECTIONS } from '../config/firestoreSchema';

const COLLECTION = 'clientProfiles';

export const normalizeClientKey = (name) =>
  String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

const PROFILE_FIELDS = [
  'pickup', 'dropoff', 'patientPhone', 'clientPhone',
  'pickupPhone', 'dropoffPhone', 'notes', 'time', 'type',
];

export const getClientProfile = async (patientName) => {
  const key = normalizeClientKey(patientName);
  if (!key) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, key));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
};

export const saveClientProfile = async (patientName, tripData, userId) => {
  const key = normalizeClientKey(patientName);
  if (!key) return;
  const existing = await getClientProfile(patientName).catch(() => null);
  const payload = {
    patientName: patientName || '',
    updatedAt: serverTimestamp(),
    updatedBy: userId || '',
  };
  for (const field of PROFILE_FIELDS) {
    if (tripData[field] !== undefined && tripData[field] !== null) {
      payload[field] = tripData[field];
    }
  }
  if (existing?.createdAt) payload.createdAt = existing.createdAt;
  else payload.createdAt = serverTimestamp();
  await setDoc(doc(db, COLLECTION, key), payload, { merge: true });
  return payload;
};

export const prefillFromProfile = (profile, overrides = {}) => {
  if (!profile) return overrides;
  const merged = { ...overrides };
  for (const field of PROFILE_FIELDS) {
    if (merged[field] === undefined || merged[field] === '' || merged[field] === null) {
      if (profile[field] !== undefined && profile[field] !== null && profile[field] !== '') {
        merged[field] = profile[field];
      }
    }
  }
  return merged;
};
