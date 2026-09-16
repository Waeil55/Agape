import app, { getMessaging, getToken, onMessage, db, auth, doc, updateDoc, collection, query, where, getDocs } from './firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
const TOKEN_KEY = 'agape_fcm_token';

// The FCM registration endpoint returns HTTP 401 ("Request is missing required
// authentication credential") when the browser session has no Firebase auth
// credential to attach. Retrying a few seconds later cannot fix such a request,
// so it must fail fast instead of spamming the console and network on every
// app boot with bounded retries that can never succeed.
export const isAuthCredentialFailure = (error) => {
  const message = String((error && error.message) || error || '').toLowerCase();
  return (
    message.includes('authentication credential') ||
    message.includes('missing credential') ||
    message.includes('401')
  );
};

export function requestNotificationPermission(retries = 3) {
  if (!auth.currentUser) return Promise.resolve(null);
  if (!VAPID_KEY) {
    console.warn('[FCM] VITE_FIREBASE_VAPID_KEY is not set — push notifications disabled');
    return Promise.resolve(null);
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if (Notification.permission === 'denied') return Promise.resolve(null);
  if (Notification.permission === 'granted') return getFcmToken(retries);
  return Notification.requestPermission()
    .then((permission) => (permission === 'granted' ? getFcmToken(retries) : null))
    .catch(() => null);
}

let inflightTokenRequest = null;

export function getFcmToken(retries = 3, deps = {}) {
  const currentUser = deps.currentUser === undefined ? auth.currentUser : deps.currentUser;
  if (!currentUser) return Promise.resolve(null);

  const fetchToken = deps.fetchToken || (() => {
    const messaging = getMessaging(app);
    return getToken(messaging, { vapidKey: VAPID_KEY });
  });
  const store = deps.store || {
    read: () => {
      try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
    },
    write: (token) => {
      try { localStorage.setItem(TOKEN_KEY, token); } catch {}
    },
  };
  const saveToken = deps.saveToken || saveTokenToFirestore;
  const warn = deps.warn || ((message) => console.warn(`[FCM] ${message}`));

  if (!inflightTokenRequest) {
    inflightTokenRequest = (async () => {
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
          const token = await fetchToken();
          if (token) {
            store.write(token);
            void saveToken(token);
            return token;
          }
        } catch (error) {
          const definitive = isAuthCredentialFailure(error);
          warn(
            `Token registration attempt ${attempt} failed${definitive ? ' (missing authentication credential — not retrying)' : ''}: ${error?.message || error}`
          );
          if (definitive) break;
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
      // Fail closed: only an actively verified token is reported as enabled. An
      // unregistered or stale cached token must never advertise notifications as on.
      return null;
    })().finally(() => { inflightTokenRequest = null; });
  }
  return inflightTokenRequest;
}

async function saveTokenToFirestore(token) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, 'users'), where('email', '==', user.email));
    const snap = await getDocs(q);
    snap.forEach(d => updateDoc(doc(db, 'users', d.id), { fcmToken: token }).catch(() => {}));
  } catch { /* best effort */ }
}

export function onForegroundMessage(callback) {
  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      callback(payload);
    });
  } catch {
    return () => {};
  }
}

export function showLocalNotification(title, body, type = 'notification') {
  if (!('Notification' in window)) return;
  
  const doNotify = () => {
    try {
      new Notification(title, { 
        body, 
        icon: '/agape.png', 
        badge: '/agape.png',
        vibrate: [200, 100, 200],
        tag: 'agape-care',
        renotify: true,
        requireInteraction: type === 'message',
        silent: false,
      });
    } catch { /* Notification may fail in some environments */ }
  };

  if (Notification.permission === 'granted') {
    doNotify();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') doNotify();
    });
  }
}