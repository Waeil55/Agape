import { initializeApp, deleteApp, getApp, getApps } from 'firebase/app';
import { getFirestore, initializeFirestore, memoryLocalCache, collection, getDocs, getDocsFromServer, doc, updateDoc, addDoc, serverTimestamp, increment, writeBatch, setDoc, getDoc, getDocFromCache, getDocFromServer, deleteDoc, deleteField, arrayUnion, arrayRemove, query, where, orderBy, limit, startAfter, runTransaction, enableNetwork, onSnapshot } from 'firebase/firestore';
import { initializeAuth, getAuth, browserSessionPersistence, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref as storageRef, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { buildOperationalTripRecord } from '../utils/tripLifecycle';
import { buildLocationFraudSignals } from '../utils/locationFraud';
import { isCorruptedTripRecord } from '../utils/tripIntegrity';
import { sanitizeFirestorePayload } from '../utils/firestorePayload';
import * as firestoreEvents from '../services/firestoreEventEngine';
const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || "",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

const appWasInitialized = getApps().length > 0;
const app = appWasInitialized ? getApp() : initializeApp(firebaseConfig);
const appCheck = (() => {
  const siteKey = String(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || '').trim();
  if (!siteKey || typeof window === 'undefined') return null;
  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn('Firebase App Check initialization was skipped:', error?.message || error);
    return null;
  }
})();
let db;
if (appWasInitialized) {
  // During development hot reloads the default Firebase app already owns a
  // configured Firestore instance. Reuse it so its cache and listeners remain
  // stable instead of attempting a conflicting second initialization.
  db = getFirestore(app);
} else {
  // Firestore's persistent IndexedDB target database can become internally
  // inconsistent across browser and installed-PWA lifecycle changes. That
  // produces target-ID collisions and transactionless range-delete failures.
  // Firestore remains the live server authority; Agape's separate tenant-
  // scoped IndexedDB snapshot and durable outbox own offline persistence.
  db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    experimentalAutoDetectLongPolling: true,
    ignoreUndefinedProperties: true,
  });
}

let auth;
try {
  auth = initializeAuth(app, {
    persistence: [browserLocalPersistence, browserSessionPersistence]
  });
} catch (err) {
  auth = getAuth(app);
}
const analytics = (() => { try { return getAnalytics(app); } catch { return null; } })();

// Messaging is initialized lazily by the notification service after browser
// capability/permission checks. Eager initialization rejects in unsupported
// browsers and server-side test environments.
const messaging = null;

const functions = getFunctions(app);
const storage = getStorage(app);

export default app;
export { app, appCheck, db, auth, analytics, messaging, storage, storageRef, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject, deleteApp, initializeApp, firebaseConfig,
  getFirestore, collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, increment,
  writeBatch, setDoc, getDoc, getDocFromCache, getDocFromServer, getDocsFromServer, deleteDoc, deleteField, arrayUnion, arrayRemove, query, where, orderBy, limit, startAfter, runTransaction, enableNetwork, onSnapshot,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail, setPersistence,
  browserLocalPersistence, browserSessionPersistence, getAuth, getMessaging, getToken, onMessage, logEvent, functions, httpsCallable };

const _agapeApiKey = env.VITE_GOOGLE_MAPS_API_KEY || "";
export function GOOGLE_MAPS_API_KEY() { return _agapeApiKey; }

export function APP_CONFIG() {
  return {
    projectName: env.VITE_PUBLIC_PROJECT_NAME || "Agape",
    projectId: env.VITE_PUBLIC_PROJECT_ID || "agape-95c9f",
    supportEmail: env.VITE_PUBLIC_SUPPORT_EMAIL || "",
    appVersion: env.VITE_APP_VERSION || "1.0.0"
  };
}

function getCurrentEventActor(role = 'system') {
  const user = auth.currentUser;
  return {
    userId: user?.uid || user?.email || 'system',
    email: user?.email || '',
    role,
  };
}

async function emitEventsSafely(buildEvents) {
  try {
    const events = buildEvents(firestoreEvents).filter(Boolean);
    if (events.length > 0) await firestoreEvents.emitSystemEvents(events);
  } catch (err) {
    console.error('System event emission failed:', err);
  }
}

export async function getTrips() {
  const tripRef = collection(db, 'trips');
  const tripSnapshot = await getDocs(tripRef);
  return tripSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

export async function updateTripStatus(tripId, updates) {
  const tripRef = doc(db, 'trips', tripId);
  const beforeSnap = await getDoc(tripRef).catch(() => null);
  const beforeTrip = beforeSnap?.exists() ? { id: beforeSnap.id, ...beforeSnap.data() } : null;
  const nextTrip = sanitizeFirestorePayload(buildOperationalTripRecord({ ...(beforeTrip || { id: tripId }), ...updates, id: tripId }));
  if (isCorruptedTripRecord(nextTrip)) {
    console.warn('Blocked corrupted trip status update:', { tripId, updates });
    return false;
  }
  await setDoc(tripRef, nextTrip, { merge: true });
  await emitEventsSafely(({ buildTripEvents }) => buildTripEvents(
    beforeTrip ? [beforeTrip] : [],
    [nextTrip],
    getCurrentEventActor()
  ));
}

export function getTripsStream(callback) {
  let cancelled = false;
  const loadTrips = async () => {
    try {
      const snapshot = await getDocsFromServer(collection(db, 'trips'));
      if (!cancelled) {
        callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }
    } catch (err) {
      if (!cancelled) console.error('Trip stream refresh failed:', err);
    }
  };
  loadTrips();
  const timer = setInterval(loadTrips, 12000);
  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

export async function updateDriverLocation(location) {
  const driverId = auth.currentUser?.uid;
  if (!driverId) return;

  const driverRef = doc(db, 'drivers', driverId);
  const driverProfileRef = doc(db, 'driverProfiles', driverId);
  const speedMph = Number.isFinite(Number(location.speedMph))
    ? Number(location.speedMph)
    : Number.isFinite(Number(location.speed))
      ? Number(location.speed)
      : null;
  const fraudSignals = location.fraudSignals || buildLocationFraudSignals(null, {
    lat: location.lat,
    lng: location.lng,
    accuracy: location.accuracy || null,
    speedMph,
    capturedAt: location.capturedAt || new Date().toISOString(),
  });
  const locationDoc = {
    driverId,
    userId: auth.currentUser?.uid || '',
    sessionId: location.sessionId || null,
    tripId: location.tripId || null,
    assignmentId: location.assignmentId || null,
    lat: location.lat,
    lng: location.lng,
    accuracy: location.accuracy || null,
    speedMph,
    heading: location.heading || null,
    altitude: location.altitude || null,
    geohash: location.geohash || '',
    source: location.source || 'gps',
    fraudFlags: fraudSignals.flags || [],
    fraudSignals,
    capturedAt: location.capturedAt || new Date().toISOString(),
    receivedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'driver_locations', driverId), locationDoc, { merge: true });
  await setDoc(driverRef, {
    currentLocation: {
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy || null,
      speedMph,
      heading: location.heading || null,
      timestamp: serverTimestamp()
    },
    fraudFlags: fraudSignals.flags || [],
    lastFraudSignals: fraudSignals,
    lastUpdated: serverTimestamp()
  }, { merge: true });
  await setDoc(driverProfileRef, {
    lat: location.lat,
    lng: location.lng,
    locationAccuracy: location.accuracy || null,
    speedMph,
    heading: location.heading || null,
    lastLocationUpdate: new Date().toISOString(),
  }, { merge: true });
  await emitEventsSafely(({ buildLocationEvent }) => [
    buildLocationEvent(driverId, locationDoc, getCurrentEventActor('driver')),
  ]);
}

export async function saveOdometerReading(tripId, odometerValue) {
  const safeTripId = String(tripId);
  const ledgerRef = doc(db, 'tripLedger', safeTripId);
  const tripsRef = doc(db, 'trips', safeTripId);
  const progressRef = doc(db, 'driverTripProgress', safeTripId);
  const odometerUpdate = {
    dropoffOdometer: odometerValue,
    odometerRecordedAt: new Date().toISOString(),
    workflowUpdatedAt: new Date().toISOString(),
  };
  await setDoc(ledgerRef, {
    dropoffOdometer: odometerValue,
    odometerRecordedAt: serverTimestamp()
  }, { merge: true });
  setDoc(tripsRef, odometerUpdate, { merge: true }).catch((err) => {
    console.warn('Odometer trips write skipped:', err);
  });
  setDoc(progressRef, {
    tripId: safeTripId,
    ...odometerUpdate,
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch((err) => {
    console.warn('Odometer progress write skipped:', err);
  });
  await emitEventsSafely(({ SYSTEM_EVENT_TYPES }) => [{
    type: SYSTEM_EVENT_TYPES.TRIP_UPDATED,
    aggregateType: 'trip',
    aggregateId: tripId,
    tripId,
    actor: getCurrentEventActor('driver'),
    payload: {
      changedFields: ['dropoffOdometer', 'odometerRecordedAt'],
      after: { id: tripId, dropoffOdometer: odometerValue },
    },
  }]);
}

const cleanFirestoreUpdates = (updates = {}) => sanitizeFirestorePayload(updates);

export async function saveTripWorkflowUpdate(tripId, updates = {}) {
  if (!tripId) return false;
  const safeTripId = String(tripId);
  const tripsRef = doc(db, 'trips', safeTripId);
  const beforeSnap = await getDoc(tripsRef).catch(() => null);
  const beforeTrip = beforeSnap?.exists() ? { id: beforeSnap.id, ...beforeSnap.data() } : null;
  const cleanUpdates = cleanFirestoreUpdates({
    ...updates,
    workflowUpdatedAt: updates.workflowUpdatedAt || new Date().toISOString(),
  });
  const nextTripRecord = buildOperationalTripRecord({ ...(beforeTrip || { id: safeTripId }), ...cleanUpdates, id: safeTripId });
  if (isCorruptedTripRecord(nextTripRecord)) {
    console.warn('Trip record is considered corrupted, but continuing workflow update:', { tripId: safeTripId, updates: cleanUpdates });
  }
  const progressRef = doc(db, 'driverTripProgress', safeTripId);
  const appDataRef = doc(db, 'appData', 'agape');
  const ledgerRef = doc(db, 'tripLedger', safeTripId);

  await setDoc(progressRef, {
    tripId: safeTripId,
    ...cleanUpdates,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await runTransaction(db, async (transaction) => {
    const appSnap = await transaction.get(appDataRef);
    if (!appSnap.exists()) return;
    const data = appSnap.data() || {};
    const trips = Array.isArray(data.trips) ? data.trips : [];
    const nextTrips = trips.map((trip) => (
      String(trip?.id || '') === String(tripId)
        ? { ...trip, ...cleanUpdates }
        : trip
    ));
    transaction.set(appDataRef, {
      trips: nextTrips,
      updatedAt: serverTimestamp(),
      updatedField: 'trips',
      updatedAtLocal: new Date().toISOString(),
    }, { merge: true });
  }).catch((err) => {
    console.warn('Workflow appData mirror skipped:', err);
  });

  setDoc(ledgerRef, cleanUpdates, { merge: true }).catch((err) => {
    console.warn('Workflow tripLedger mirror skipped:', err);
  });
  setDoc(tripsRef, nextTripRecord, { merge: true }).catch((err) => {
    console.warn('Workflow trips mirror skipped:', err);
  });
  await emitEventsSafely(({ buildTripEvents }) => buildTripEvents(
    beforeTrip ? [beforeTrip] : [],
    [nextTripRecord],
    getCurrentEventActor('driver')
  ));
  return true;
}

export async function getDriverDailyTrips(driverId, date) {
  const tripsRef = collection(db, 'trips');
  const snapshot = await getDocs(tripsRef);
  const allTrips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  return allTrips.filter(trip => {
    return trip.driverId === driverId &&
           trip.startTime &&
           new Date(trip.startTime).toDateString() === date.toDateString();
  });
}

export async function logDriverAnalytics(driverId, analytics) {
  const analyticsRef = collection(db, 'analyticsLogs');
  await addDoc(analyticsRef, {
    driverId,
    ...analytics,
    timestamp: serverTimestamp()
  });
}

export async function getDriverProfile(driverId) {
  const driverRef = doc(db, 'driverProfiles', driverId);
  const snapshot = await getDoc(driverRef);
  return snapshot.data();
}

export async function updateDriverProfile(driverId, updates) {
  const driverRef = doc(db, 'driverProfiles', driverId);
  const beforeSnap = await getDoc(driverRef).catch(() => null);
  const beforeDriver = beforeSnap?.exists() ? { id: beforeSnap.id, ...beforeSnap.data() } : null;
  await setDoc(driverRef, updates, { merge: true });
  await emitEventsSafely(({ buildDriverEvents }) => buildDriverEvents(
    beforeDriver ? [beforeDriver] : [],
    [{ ...(beforeDriver || { id: driverId }), ...updates, id: driverId }],
    getCurrentEventActor()
  ));
}

export async function syncOfflineQueue(queue) {
  const batch = writeBatch(db);

  for (const item of queue) {
    if (item.action === 'startTrip') {
      const tripRef = doc(db, 'trips', item.data.tripId);
      batch.set(tripRef, item.data, { merge: true });
    } else if (item.action === 'completeTrip') {
      const tripRef = doc(db, 'trips', item.data.tripId);
      batch.set(tripRef, item.data, { merge: true });
    } else if (item.action === 'updateLocation') {
      const driverId = auth.currentUser?.uid;
      if (driverId) {
        const driverRef = doc(db, 'drivers', driverId);
        batch.set(driverRef, { currentLocation: item.data }, { merge: true });
      }
    }
  }

  await batch.commit();
}
