/* Agape Care PWA Service Worker - static assets only.
   Firestore onSnapshot listeners own all realtime data delivery.
   Do not cache, poll, or background-sync trips, drivers, assignments, or APIs here.
*/

const CACHE_VERSION = 'agape-v9-static';
const STATIC_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-assets`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name.startsWith('agape-') && name !== STATIC_CACHE && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      )),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING' || event.data?.action === 'skipWaiting') {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === 'CHECK_UPDATES' && event.ports?.[0]) {
    event.ports[0].postMessage({
      type: 'UPDATE_STATUS',
      ready: true,
      timestamp: Date.now(),
    });
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'reload' })
        .then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put('/index.html', clone));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request, { cache: 'reload' }).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(fetch(request));
});
