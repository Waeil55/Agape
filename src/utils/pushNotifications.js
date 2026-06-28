/**
 * Push Notification Client Integration
 *
 * Big companies use FCM for push notifications. This module handles:
 * - Requesting notification permission
 * - Getting and saving FCM tokens
 * - Handling incoming notifications
 * - Token refresh management
 */

import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

let messaging = null;
let currentToken = null;

try {
  messaging = getMessaging();
} catch (err) {
  console.warn('FCM not available:', err);
}

/**
 * Request notification permission and get FCM token
 */
export async function requestNotificationPermission() {
  if (!messaging) {
    console.warn('FCM not available');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      console.warn('Notification permission denied');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || '',
    });

    if (token) {
      currentToken = token;
      await saveFCMToken(token);
      console.log('FCM token obtained:', token.substring(0, 20) + '...');
      return token;
    }

    console.warn('No registration token available');
    return null;
  } catch (err) {
    console.error('Failed to get FCM token:', err);
    return null;
  }
}

/**
 * Save FCM token to user's profile in Firestore
 */
async function saveFCMToken(token) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      fcmToken: token,
      fcmTokenUpdatedAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    }, { merge: true });

    const driverRef = doc(db, 'driverProfiles', user.uid);
    await setDoc(driverRef, {
      fcmToken: token,
      fcmTokenUpdatedAt: serverTimestamp(),
    }, { merge: true });

    console.log('FCM token saved to Firestore');
  } catch (err) {
    console.error('Failed to save FCM token:', err);
  }
}

/**
 * Listen for foreground messages
 */
export function onForegroundMessage(callback) {
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);

    const { notification, data } = payload;

    if (notification) {
      const notificationOptions = {
        body: notification.body,
        icon: notification.icon || '/favicon.ico',
        badge: '/favicon.ico',
        data: data || {},
        tag: data?.type || 'general',
        requireInteraction: data?.type === 'new_assignment',
      };

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(
            notification.title || 'Agape Care',
            notificationOptions
          );
        });
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title || 'Agape Care', notificationOptions);
      }
    }

    if (callback) {
      callback(payload);
    }
  });
}

/**
 * Handle notification click
 */
export function setupNotificationClickHandler() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NOTIFICATION_CLICK') {
      const { data } = event.data;
      handleNotificationClick(data);
    }
  });
}

function handleNotificationClick(data) {
  if (data?.tripId) {
    window.dispatchEvent(new CustomEvent('navigate-to-trip', {
      detail: { tripId: data.tripId }
    }));
  } else if (data?.assignmentId) {
    window.dispatchEvent(new CustomEvent('navigate-to-assignment', {
      detail: { assignmentId: data.assignmentId }
    }));
  }
}

/**
 * Initialize push notifications
 */
export async function initializePushNotifications() {
  if (!messaging) return;

  try {
    await requestNotificationPermission();
    setupNotificationClickHandler();

    onForegroundMessage((payload) => {
      console.log('Notification received in foreground:', payload);
    });

    console.log('Push notifications initialized');
  } catch (err) {
    console.error('Failed to initialize push notifications:', err);
  }
}

export function getCurrentToken() {
  return currentToken;
}

export default {
  requestNotificationPermission,
  onForegroundMessage,
  setupNotificationClickHandler,
  initializePushNotifications,
  getCurrentToken,
};
