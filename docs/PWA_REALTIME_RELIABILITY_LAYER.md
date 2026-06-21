# PWA Real-Time Reliability Layer

Task 7 makes Firestore the only data synchronization channel for operational data.

## Rules

- Trips, drivers, assignments, heartbeats, sessions, chat, and system events update through Firestore `onSnapshot()` listeners only.
- The service worker is static-cache only. It must not cache API data, emit data sync messages, register periodic data sync, or poll.
- Reconnect, foreground resume, page restore, focus, and service-worker controller changes trigger a listener resubscribe.
- A listener resubscribe means React tears down the active Firestore listeners and attaches fresh listeners, causing Firestore to rehydrate the full current snapshot.

## Rehydrate Triggers

- Browser `online`
- PWA/Tab `focus`
- `pageshow`, including Safari back-forward cache restores
- `visibilitychange` when the app becomes visible
- Service worker `controllerchange`
- Manual `agape:realtime-resubscribe` event

## Safari PWA Behavior

Safari can delay network activity while a PWA is backgrounded. On resume, the app calls `enableNetwork(db)` and increments a shared `resubscribeKey`. Critical listeners include this key in their dependencies, so they reattach and receive a full current snapshot without refresh or polling.

## Service Worker Boundary

The service worker may cache:

- `/`
- `/index.html`
- `/manifest.webmanifest`
- hashed assets under `/assets/`
- static images and fonts

The service worker must not cache Firestore, Firebase, Google Maps, API, trip, driver, assignment, heartbeat, or chat data.
