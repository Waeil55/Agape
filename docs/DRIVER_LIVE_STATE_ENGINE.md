# Agape Care Driver Live State Engine

Task 3 adds the driver live-state layer on top of the Firestore event engine.

## Runtime Collections

The driver portal now writes live state to:

- `sessions/{sessionId}`
- `heartbeat/{driverId}`
- `drivers/{driverId}`
- `driverProfiles/{driverId}`

Location helper writes also include `userId` for owner-safe rules:

- `driver_locations/{driverId}`

## Heartbeat

Drivers write heartbeat every 5 seconds while authenticated in the driver portal.

Heartbeat document:

```txt
heartbeat/{driverId}
```

Important fields:

- `driverId`
- `userId`
- `sessionId`
- `status`
- `lastSeenAt`
- `lastSeenAtLocal`
- `clientTimeMs`
- `network`
- `device`

## Driver Live State

Driver status is calculated from:

- driver `clockedIn`
- current active trip
- current active session

Runtime status:

- `offline`
- `available`
- `on_trip`

The app mirrors this into legacy display fields:

- `Available`
- `On Trip`
- `Offline`

## Session Control

Each driver session is device-bound:

```txt
sessions/{authUid}_{deviceId}
```

On driver login:

1. Current device gets or creates a stable local device id.
2. Current session is written as `active`.
3. Other active sessions for the same driver are set to `invalidated`.
4. The old device listens to its own session document with `onSnapshot()`.
5. When the old session sees `invalidated`, it stops heartbeats and signs out.

This implements one active driver session at a time without polling.

## Liveness Monitor

Admin/dispatcher clients subscribe to `heartbeat` via `onSnapshot()`.

The monitor uses an interval only to evaluate elapsed time against already-listened heartbeat data. It does not poll Firestore.

Rules:

- Missing heartbeat for more than 15 seconds marks driver `offline`.
- Offline transition writes to `drivers`, `driverProfiles`, and `heartbeat`.
- Offline transition emits `driver_status_changed` into `system_events`.

## Event Emission

The live-state engine emits:

- `driver_status_changed`
- `session_invalidated` support is available in the schema and should be expanded in session/security tasks.

Heartbeat writes themselves do not emit events every 5 seconds. Only meaningful state transitions emit events.

## Current Production Boundary

This task implements client-side driver live state and active-client liveness detection. Task 4 should add the dedicated heartbeat/liveness hardening layer, including a server-side watchdog if Firebase plan/runtime allows scheduled functions.
