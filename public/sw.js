/* Agape Care PWA Service Worker v34
   App shell + static assets. Network-first for navigation.
   Firestore onSnapshot listeners own all realtime data delivery.
*/

const CACHE_VERSION = 'agape-v43';
const RUNTIME_CACHE = CACHE_VERSION + '-assets';
const CORE_ASSETS = ['/index.html', '/manifest.webmanifest', '/agape.png', '/agape.svg'];

async function cacheOfflineApplication() {
  const cache = await caches.open(RUNTIME_CACHE);
  let generatedAssets = [];
  try {
    const manifestResponse = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      generatedAssets = Array.isArray(manifest.files) ? manifest.files : [];
      await cache.put('/asset-manifest.json', new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/json' },
      }));
    }
  } catch (_) {
    // The last application shell remains available if an update is interrupted.
  }

  await Promise.allSettled([...new Set([...CORE_ASSETS, ...generatedAssets])].map(async (asset) => {
    const response = await fetch(asset, { cache: 'no-store' });
    if (response.ok) await cache.put(asset, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheOfflineApplication());
  // Do not take control of a workspace that is already open. The fully cached
  // release activates automatically after all current Agape windows close, or
  // when the operator explicitly accepts the update prompt.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name !== RUNTIME_CACHE && (/^agape-|^workbox-/i.test(name)))
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

  // Navigation: Network-First with background cache update and offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || new Response('Offline', { status: 503 })))
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
