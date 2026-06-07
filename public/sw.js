/* Agape Care PWA Service Worker — Static Assets Only
   Data sync is handled exclusively by Firestore onSnapshot listeners.
   This SW only caches static assets. No data polling, no background sync.
*/
const CACHE_VERSION = 'agape-v9';
const STATIC_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const PRECACHE_URLS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
    // NOTE: Do NOT call self.skipWaiting() here.
    // Auto-skipWaiting on install causes a controllerchange → reload loop.
    // skipWaiting is only called when the app explicitly sends SKIP_WAITING.
  );
});


self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) => Promise.all(
        names.filter((n) => n.startsWith('agape-') && n !== STATIC_CACHE && n !== ASSET_CACHE)
          .map((n) => caches.delete(n))
      )),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Skip non-GET and cross-origin (Firestore, Auth, etc.)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Navigation: network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => { caches.open(STATIC_CACHE).then((c) => c.put('/index.html', res.clone())); return res; })
        .catch(() => caches.match('/index.html').then((c) => c || Response.error()))
    );
    return;
  }
  // Static assets: cache-first
  if (url.pathname.startsWith('/assets/') || /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) caches.open(ASSET_CACHE).then((c) => c.put(request, res.clone()));
          return res;
        });
      })
    );
    return;
  }
  // Everything else: network only (includes Firestore WebSocket traffic)
  event.respondWith(fetch(request));
});
