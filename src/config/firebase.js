import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, onSnapshot, addDoc, serverTimestamp, writeBatch, setDoc, getDoc, deleteDoc, deleteField, arrayUnion, query, where, orderBy } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

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
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});

let messaging;
try { messaging = getMessaging(app); } catch { /* FCM not available in all environments */ }

export default app;
export { app, db, auth, analytics, messaging, deleteApp, initializeApp, firebaseConfig,
  getFirestore, collection, getDocs, doc, updateDoc, onSnapshot, addDoc, serverTimestamp,
  writeBatch, setDoc, getDoc, deleteDoc, deleteField, arrayUnion, query, where, orderBy,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail, setPersistence,
  browserLocalPersistence, getAuth, getMessaging, getToken, onMessage, logEvent };

export const GOOGLE_MAPS_API_KEY = env.VITE_GOOGLE_MAPS_API_KEY || "";

export const GEMINI_API_CONFIG = {
  projectId: env.VITE_GEMINI_PROJECT_ID || "",
  apiKey: env.VITE_GEMINI_API_KEY || ""
};

export const APP_CONFIG = {
  projectName: env.VITE_PUBLIC_PROJECT_NAME || "Agape",
  projectId: env.VITE_PUBLIC_PROJECT_ID || "agape-95c9f",
  supportEmail: env.VITE_PUBLIC_SUPPORT_EMAIL || "",
  appVersion: env.VITE_APP_VERSION || "1.0.0"
};

export const getTrips = async () => {
  const tripRef = collection(db, 'trips');
  const tripSnapshot = await getDocs(tripRef);
  return tripSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const updateTripStatus = async (tripId, updates) => {
  const tripRef = doc(db, 'trips', tripId);
  await updateDoc(tripRef, updates);
};

export const getTripsStream = (callback) => {
  const tripRef = collection(db, 'trips');
  return onSnapshot(tripRef, (snapshot) => {
    const trips = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(trips);
  });
};

export const updateDriverLocation = async (location) => {
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
};

export const saveOdometerReading = async (tripId, odometerValue) => {
  const tripRef = doc(db, 'trips', tripId);
  await updateDoc(tripRef, {
    endOdometer: odometerValue,
    odometerRecordedAt: serverTimestamp()
  });
};

export const getDriverDailyTrips = async (driverId, date) => {
  const tripsRef = collection(db, 'trips');
  const snapshot = await getDocs(tripsRef);
  const allTrips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  return allTrips.filter(trip => {
    return trip.driverId === driverId &&
           trip.startTime &&
           new Date(trip.startTime).toDateString() === date.toDateString();
  });
};

export const logDriverAnalytics = async (driverId, analytics) => {
  const analyticsRef = collection(db, 'analyticsLogs');
  await addDoc(analyticsRef, {
    driverId,
    ...analytics,
    timestamp: serverTimestamp()
  });
};

export const getDriverProfile = async (driverId) => {
  const driverRef = doc(db, 'drivers', driverId);
  const snapshot = await getDoc(driverRef);
  return snapshot.data();
};

export const updateDriverProfile = async (driverId, updates) => {
  const driverRef = doc(db, 'drivers', driverId);
  await updateDoc(driverRef, updates);
};

export const syncOfflineQueue = async (queue) => {
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
};
