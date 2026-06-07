import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDocs, doc, updateDoc, onSnapshot, addDoc, serverTimestamp, writeBatch, setDoc, getDoc, deleteDoc, deleteField, arrayUnion, query, where, orderBy, runTransaction, enableNetwork, disableNetwork, limit } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
  if (!message.includes('initializeFirestore() has already been called')) {
    console.warn('Firestore persistent cache fell back to the default cache.', err);
  }
  db = getFirestore(app);
}

const auth = getAuth(app);
const analytics = getAnalytics(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});

let messaging;
try { messaging = getMessaging(app); } catch { /* FCM not available in all environments */ }

const functions = getFunctions(app);

export default app;
export { app, db, auth, analytics, messaging, deleteApp, initializeApp, firebaseConfig,
  getFirestore, collection, getDocs, doc, updateDoc, onSnapshot, addDoc, serverTimestamp,
  writeBatch, setDoc, getDoc, deleteDoc, deleteField, arrayUnion, query, where, orderBy, runTransaction,
  enableNetwork, disableNetwork, limit,
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
  await updateDoc(tripRef, updates);
}

export function getTripsStream(callback) {
  const tripRef = collection(db, 'trips');
  return onSnapshot(tripRef, (snapshot) => {
    const trips = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(trips);
  });
}

export async function updateDriverLocation(location) {
  const driverId = auth.currentUser?.uid;
  if (!driverId) return;

  const driverRef = doc(db, 'drivers', driverId);
  await updateDoc(driverRef, {
    currentLocation: {
      lat: location.lat,
      lng: location.lng,
      timestamp: serverTimestamp()
    },
    lastUpdated: serverTimestamp()
  });
}

export async function saveOdometerReading(tripId, odometerValue) {
  const tripRef = doc(db, 'tripLedger', tripId);
  await setDoc(tripRef, {
    dropoffOdometer: odometerValue,
    odometerRecordedAt: serverTimestamp()
  }, { merge: true });
}

const cleanFirestoreUpdates = (updates = {}) => Object.fromEntries(
  Object.entries(updates).filter(([, value]) => value !== undefined)
);

export async function saveTripWorkflowUpdate(tripId, updates = {}) {
  if (!tripId) return false;
  const cleanUpdates = cleanFirestoreUpdates({
    ...updates,
    workflowUpdatedAt: updates.workflowUpdatedAt || new Date().toISOString(),
  });
  const progressRef = doc(db, 'driverTripProgress', tripId);
  const appDataRef = doc(db, 'appData', 'agape');
  const ledgerRef = doc(db, 'tripLedger', tripId);
  const tripsRef = doc(db, 'trips', tripId);

  await setDoc(progressRef, {
    tripId,
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
  setDoc(tripsRef, cleanUpdates, { merge: true }).catch((err) => {
    console.warn('Workflow trips mirror skipped:', err);
  });
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
  await setDoc(driverRef, updates, { merge: true });
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
