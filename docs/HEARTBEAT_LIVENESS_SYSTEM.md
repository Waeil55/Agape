# Agape Care Heartbeat and Liveness System

Task 4 hardens the driver heartbeat layer for PWA runtime reliability.

## Heartbeat Rules

Driver portal:

- Sends heartbeat every 5 seconds.
- Stores heartbeat in `heartbeat/{driverId}`.
- Writes only while the browser reports online.
- On reconnect, immediately performs a full live-state resync.

Heartbeat document:

```txt
heartbeat/{driverId}
```

Critical fields:

- `driverId`
- `userId`
- `sessionId`
- `status`
- `lastSeenAt`
- `lastSeenAtLocal`
- `clientTimeMs`
- `network.online`
- `device.id`

## Liveness Rules

Admin/dispatcher clients subscribe to the heartbeat collection through Firestore `onSnapshot()`.

No Firestore polling is used.

The liveness engine evaluates elapsed time from the last snapshot data:

- No heartbeat for more than 15 seconds -> driver is marked offline.
- No heartbeat for more than 30 seconds -> active driver sessions are invalidated.
- Session invalidation propagates to the driver portal via `onSnapshot()` on `sessions/{sessionId}`.

## Offline Transition

After the 15-second threshold:

- `drivers/{driverId}` is set to `offline`.
- `driverProfiles/{driverId}` is mirrored to `Offline`.
- `heartbeat/{driverId}` is marked `offline`.
- `system_events` receives:
  - `heartbeat_missed`
  - `driver_status_changed`

## Force Logout

After the 30-second threshold:

- Active records in `sessions` for that driver are set to `invalidated`.
- `invalidatedReason` is set to `heartbeat_timeout`.
- `system_events` receives `session_invalidated`.
- Any open driver PWA listening to its session signs out immediately.

## Reconnect Resync

The driver PWA listens to:

- `online`
- `offline`
- `visibilitychange`

On reconnect/foreground:

1. Network state flips back online.
2. Driver session is checked by the existing session listener.
3. If still valid, the app writes a fresh heartbeat.
4. Driver live state is rehydrated in:
   - `sessions/{sessionId}`
   - `heartbeat/{driverId}`
   - `drivers/{driverId}`
   - `driverProfiles/{driverId}`

## Service Worker Rule

The service worker is not used for data synchronization. It remains only for static asset caching/PWA shell behavior.

## Current Boundary

This task implements client-side heartbeat hardening and active-operator liveness detection. A future server watchdog can be added as a backstop, but the UI remains Firestore listener based and does not poll.
