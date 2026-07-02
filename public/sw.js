/* Agape Care PWA Service Worker v15
   Static assets only. Never cache index.html.
   Firestore onSnapshot listeners own all realtime data delivery.
*/

const CACHE_VERSION = 'agape-v17';
const RUNTIME_CACHE = CACHE_VERSION + '-assets';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => /^agape-|^workbox-/i.test(name))
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

  if (event.data?.type === 'FORCE_REFRESH') {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'FORCE_REFRESH' }));
    });
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

  // Navigation: ALWAYS fetch fresh from network, never cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Static assets with content hashes: cache-first (safe because filenames change on deploy)
  if (url.pathname.startsWith('/assets/') || /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
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

  // Everything else: network only
  event.respondWith(fetch(request));
});
