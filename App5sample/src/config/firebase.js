import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyCbnAFOg_NpCHEvZlP33p_fGJT-Fu69kSM",
  authDomain: "agape-95c9f.firebaseapp.com",
  databaseURL: "https://agape-95c9f-default-rtdb.firebaseio.com",
  projectId: "agape-95c9f",
  storageBucket: "agape-95c9f.firebasestorage.app",
  messagingSenderId: "566470518829",
  appId: "1:566470518829:web:6233c914f2aa13aa6af0a4",
  measurementId: "G-6ZW1RLCVRQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// Persist auth session across page refreshes
setPersistence(auth, browserLocalPersistence).catch(() => {});

export default app;
export { db, auth, analytics, firebaseConfig };

export const GOOGLE_MAPS_API_KEY = "AIzaSyAodry_zIOQgZsPUAyamUoT_U0Nvp2OAko";

export const GEMINI_API_CONFIG = {
  projectId: "gen-lang-client-0828587071",
  apiKey: "AIzaSyAodry_zIOQgZsPUAyamUoT_U0Nvp2OAko"
};

export const APP_CONFIG = {
  projectName: "Agape",
  projectId: "agape-95c9f",
  supportEmail: "waeil.usa@gmail.com",
  appVersion: "1.0.0"
};
