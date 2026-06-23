import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, collection, getDocs, getDocsFromServer, doc, updateDoc, addDoc, serverTimestamp, writeBatch, setDoc, getDoc, getDocFromServer, deleteDoc, deleteField, arrayUnion, query, where, orderBy, limit, runTransaction, enableNetwork, onSnapshot } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { buildOperationalTripRecord } from '../utils/tripLifecycle';
import { buildLocationFraudSignals } from '../utils/locationFraud';
import { isCorruptedTripRecord } from '../utils/tripIntegrity';
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

const app = initializeApp(firebaseConfig);
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (err) {
  const message = String(err?.message || '');
  console.warn('Persistent cache failed, falling back to memory cache:', message);
  try {
    db = initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  } catch (err2) {
    db = getFirestore(app);
  }
}

const auth = getAuth(app);
const analytics = getAnalytics(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});

let messaging;
try { messaging = getMessaging(app); } catch { /* FCM not available in all environments */ }

const functions = getFunctions(app);

export default app;
export { app, db, auth, analytics, messaging, deleteApp, initializeApp, firebaseConfig,
  getFirestore, collection, getDocs, doc, updateDoc, addDoc, serverTimestamp,
  writeBatch, setDoc, getDoc, getDocFromServer, getDocsFromServer, deleteDoc, deleteField, arrayUnion, query, where, orderBy, limit, runTransaction, enableNetwork, onSnapshot,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail, setPersistence,
  browserLocalPersistence, getAuth, getMessaging, getToken, onMessage, logEvent, functions, httpsCallable };

const _agapeApiKey = env.VITE_GOOGLE_MAPS_API_KEY || "";
const _agapeGeminiProject = env.VITE_GEMINI_PROJECT_ID || "";
const _agapeGeminiKey = env.VITE_GEMINI_API_KEY || "";
export function GOOGLE_MAPS_API_KEY() { return _agapeApiKey; }
export function GEMINI_API_CONFIG() { return { projectId: _agapeGeminiProject, apiKey: _agapeGeminiKey }; }

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
    const eventEngine = await import('../services/firestoreEventEngine');
    const events = buildEvents(eventEngine).filter(Boolean);
    if (events.length > 0) await eventEngine.emitSystemEvents(events);
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
  const beforeTrip = beforeSnap?.exists?.() ? { id: beforeSnap.id, ...beforeSnap.data() } : null;
  const nextTrip = buildOperationalTripRecord({ ...(beforeTrip || { id: tripId }), ...updates, id: tripId });
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
  await updateDoc(driverRef, {
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
  });
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
  const tripRef = doc(db, 'tripLedger', tripId);
  await setDoc(tripRef, {
    dropoffOdometer: odometerValue,
    odometerRecordedAt: serverTimestamp()
  }, { merge: true });
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

const cleanFirestoreUpdates = (updates = {}) => Object.fromEntries(
  Object.entries(updates).filter(([, value]) => value !== undefined)
);

export async function saveTripWorkflowUpdate(tripId, updates = {}) {
  if (!tripId) return false;
  const safeTripId = String(tripId);
  const tripsRef = doc(db, 'trips', safeTripId);
  const beforeSnap = await getDoc(tripsRef).catch(() => null);
  const beforeTrip = beforeSnap?.exists?.() ? { id: beforeSnap.id, ...beforeSnap.data() } : null;
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

  runTransaction(db, async (transaction) => {
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
  const beforeDriver = beforeSnap?.exists?.() ? { id: beforeSnap.id, ...beforeSnap.data() } : null;
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
      batch.update(tripRef, item.data);
    } else if (item.action === 'completeTrip') {
      const tripRef = doc(db, 'trips', item.data.tripId);
      batch.update(tripRef, item.data);
    } else if (item.action === 'updateLocation') {
      const driverId = auth.currentUser?.uid;
      if (driverId) {
        const driverRef = doc(db, 'drivers', driverId);
        batch.update(driverRef, { currentLocation: item.data });
      }
    }
  }

  await batch.commit();
}
