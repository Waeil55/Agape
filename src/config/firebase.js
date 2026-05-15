import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

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

// Persist auth session across page refreshes
setPersistence(auth, browserLocalPersistence).catch(() => {});

export default app;
export { db, auth, analytics, firebaseConfig };

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
