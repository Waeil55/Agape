import app, { getMessaging, getToken, onMessage } from './firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
const TOKEN_KEY = 'agape_fcm_token';

export async function requestNotificationPermission(retries = 3) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
  if (!VAPID_KEY) {
    console.warn('[FCM] VITE_FIREBASE_VAPID_KEY is not set — push notifications disabled');
    return null;
  }

  if (Notification.permission === 'denied') return null;
  if (Notification.permission === 'granted') {
    return getFcmToken(retries);
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    return getFcmToken(retries);
  } catch {
    return null;
  }
}

async function getFcmToken(retries = 3) {
  const cached = localStorage.getItem(TOKEN_KEY);
  
  for (let i = 0; i < retries; i++) {
    try {
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        return token;
      }
    } catch (err) {
      console.warn(`[FCM] Token registration attempt ${i + 1} failed:`, err?.message || err);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  
  return cached || null;
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
