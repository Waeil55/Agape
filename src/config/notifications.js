import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import app from './firebase';

const VAPID_KEY = 'BMA5e1UV1qoZ1TDxp4FQ5Q4qCAKVdsGD8yFGvqYpZ9DgF-1FMPQeHNdH7FsqTGEcHl-zUDRWZ0j3EL0tQ8PvBzM';
const TOKEN_KEY = 'agape_fcm_token';

export async function requestNotificationPermission(retries = 3) {
  if (!('Notification' in window) && !('serviceWorker' in navigator)) return null;

  // Check existing permission
  if (Notification.permission === 'denied') return null;
  if (Notification.permission === 'granted') {
    // Token already registered — try to get fresh token
    return getFcmToken(retries);
  }

  // Permission default — request it
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    return getFcmToken(retries);
  } catch {
    return null;
  }
}

async function getFcmToken(retries = 3) {
  // Check localStorage for cached token
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
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  
  // Return cached token if all retries failed
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

export function showLocalNotification(title, body) {
  if (!('Notification' in window)) return;
  
  const doNotify = () => {
    try {
      new Notification(title, { 
        body, 
        icon: '/agape.png', 
        badge: '/agape.png',
        vibrate: [200, 100, 200],
        tag: 'agape-care',
        renotify: true
      });
    } catch {}
  };

  if (Notification.permission === 'granted') {
    doNotify();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') doNotify();
    });
  }
}
