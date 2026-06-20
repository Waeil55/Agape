/* Agape Care service worker cleanup.
   The app now relies on Firestore's live listeners and browser persistence.
   This worker retires older cached shells that could make the UI bounce between
   old and new bundles. */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('agape-'))
          .map((name) => caches.delete(name))
      );
    } catch {
      // Cache cleanup is best effort.
    }

    try {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      await self.registration.unregister();
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    } catch {
      await self.registration.unregister();
    }
  })());
});

self.addEventListener('fetch', () => {
  // No fetch handler: let the browser/network handle app assets directly.
});
