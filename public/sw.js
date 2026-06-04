/* Agape Care PWA Service Worker — Real-Time Auto-Update Edition
   Ensures all platforms (iOS Safari, Android Chrome, Desktop) always run
   the latest version and receive real-time data updates without manual refresh.
   Updates triggered every second on visible apps, and periodically in background.
*/

const CACHE_VERSION = 'agape-v7';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// Assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

// API endpoints to sync regularly
const SYNC_ENDPOINTS = [
  '/api/trips',
  '/api/drivers',
  '/api/vehicles',
  '/api/dispatchers'
];

// ── Install: precache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) =>
        cache.addAll(PRECACHE_URLS).catch(() => {
          // Silently ignore precache errors (e.g. offline at install time)
        })
      ),
      caches.open(DATA_CACHE) // Pre-create data cache
    ])
  );
});

// ── Activate: clean old caches, claim all clients ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Delete any old caches from previous versions
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith('agape-') && 
                    name !== STATIC_CACHE && name !== RUNTIME_CACHE && name !== DATA_CACHE)
            .map((name) => caches.delete(name))
        )
      ),
      // Claim all open clients immediately
      self.clients.claim(),
    ])
  );
});

// ── Periodic Background Sync: triggered every 1 minute ────────────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncAllData());
  }
});

// Sync all data from Firebase
async function syncAllData() {
  try {
    const clients = await self.clients.matchAll();
    
    // Notify all clients to perform sync
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_REQUEST',
        timestamp: Date.now()
      });
    });

    return Promise.resolve();
  } catch (error) {
    console.error('Background sync error:', error);
  }
}

// ── Message Handler: communicate with app ──────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_DATA') {
    // Handle sync requests from app
    syncAllData();
  }
  
  if (event.data?.type === 'CHECK_UPDATES' && event.ports?.[0]) {
    // Notify app of any pending updates
    event.ports[0].postMessage({
      type: 'UPDATE_STATUS',
      ready: true,
      timestamp: Date.now()
    });
  }
});

// ── Fetch: Network-first for HTML, Cache-first for assets ────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests (Firebase, Google APIs, etc.)
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // For navigation requests (HTML pages): Network-first
  // This ensures users always get fresh app HTML — critical for auto-refresh
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh response for offline fallback
          const cloned = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() =>
          // Offline fallback: serve cached index.html
          caches.match('/index.html').then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // For JS/CSS/image assets with content hash in URL: Cache-first (immutable)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff2|woff)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const cloned = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, cloned));
          return response;
        });
      })
    );
    return;
  }

  // For API/data requests: Network-first, cache fallback
  // This ensures real-time updates when online, cached data when offline
  if (url.pathname.includes('/api/') || SYNC_ENDPOINTS.some(ep => url.pathname.includes(ep))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response.ok) {
            const cloned = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => 
          // Fallback to cached data if offline
          caches.match(request).then(cached => cached || new Response(JSON.stringify({ error: 'offline' }), { 
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }))
        )
    );
    return;
  }

  // Everything else: Network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        const cloned = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, cloned));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── Message handler: force reload on all clients when new SW is available ────
// Also handles sync requests from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'RELOAD_ALL') {
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => client.navigate(client.url));
    });
  }
});
