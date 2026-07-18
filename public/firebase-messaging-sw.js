/* eslint-env serviceworker */
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

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

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Agape Care';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/agape.png',
    badge: '/agape.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    silent: false,
    data: {
      type: payload.data?.type || '',
      channelId: payload.data?.channelId || payload.data?.chatChannelId || '',
    },
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const channelId = event.notification?.data?.channelId || '';
  const targetUrl = channelId ? `/?chatChannel=${encodeURIComponent(channelId)}` : '/';
  event.waitUntil(clients.openWindow(targetUrl));
});
