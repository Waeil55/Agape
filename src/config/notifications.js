import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import app from './firebase';

const VAPID_KEY = 'BMA5e1UV1qoZ1TDxp4FQ5Q4qCAKVdsGD8yFGvqYpZ9DgF-1FMPQeHNdH7FsqTGEcHl-zUDRWZ0j3EL0tQ8PvBzM';

export async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token;
  } catch {
    return null;
  }
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
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/agape.png', badge: '/agape.png' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        new Notification(title, { body, icon: '/agape.png' });
      }
    });
  }
}
