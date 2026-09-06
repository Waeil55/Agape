import { initializeApp, deleteApp, getApp, getApps } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  collection,
  getDocs,
  getDocsFromServer,
  doc,
  updateDoc as firestoreUpdateDoc,
  addDoc as firestoreAddDoc,
  serverTimestamp,
  increment,
  writeBatch as firestoreWriteBatch,
  setDoc as firestoreSetDoc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  deleteDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction as firestoreRunTransaction,
  enableNetwork,
  onSnapshot,
} from 'firebase/firestore';
import { initializeAuth, getAuth, browserSessionPersistence, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref as storageRef, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  sanitizeFirestoreUpdateArguments,
  sanitizeFirestoreWriteData,
  wrapFirestoreWriteContext,
} from '../utils/firestoreWriteSafety';
const env = import.meta.env;

/**
 * Every application Firestore write crosses this boundary. The database-level
 * ignoreUndefinedProperties setting remains a final SDK safeguard, but callers,
 * batches, transactions, and queued replays no longer depend on that setting.
 */
const setDoc = (reference, data, options) => {
  const safeData = sanitizeFirestoreWriteData(data);
  return options === undefined
    ? firestoreSetDoc(reference, safeData)
    : firestoreSetDoc(reference, safeData, options);
};

const addDoc = (reference, data) => (
  firestoreAddDoc(reference, sanitizeFirestoreWriteData(data))
);

const updateDoc = (reference, ...args) => (
  firestoreUpdateDoc(reference, ...sanitizeFirestoreUpdateArguments(args))
);

const writeBatch = (firestore) => wrapFirestoreWriteContext(firestoreWriteBatch(firestore));

const runTransaction = (firestore, updateFunction, options) => {
  const execute = (transaction) => updateFunction(wrapFirestoreWriteContext(transaction));
  return options === undefined
    ? firestoreRunTransaction(firestore, execute)
    : firestoreRunTransaction(
        firestore,
        execute,
        options,
      );
};

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
