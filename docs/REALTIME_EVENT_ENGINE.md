# Agape Care Real-Time Event Engine

Task 2 adds the core event stream for operational state changes. The current application still preserves its existing UI behavior and legacy mirrors, but central write paths now emit append-only `system_events` records.

## Event Stream

Collection:

```txt
system_events/{eventId}
```

Every event has:

- `type`
- `aggregateType`
- `aggregateId`
- optional `tripId`
- optional `driverId`
- optional `assignmentId`
- `actorUserId`
- `actorRole`
- `severity`
- `payload`
- `companyDate`
- `createdAt`

## Implemented Event Types

- `trip_created`
- `trip_assigned`
- `trip_updated`
- `trip_cancelled`
- `driver_status_changed`
- `location_updated`

The enum lives in:

```txt
src/config/firestoreSchema.js
```

## Event Emitters

Central engine:

```txt
src/services/firestoreEventEngine.js
```

Implemented helpers:

- `emitSystemEvent(event)`
- `emitSystemEvents(events)`
- `buildTripEvents(beforeTrips, afterTrips, actor)`
- `buildDriverEvents(beforeDrivers, afterDrivers, actor)`
- `buildLocationEvent(driverId, location, actor)`

## Current Write Paths Wired

### Trip state

Trip array writes in `useFirestoreAppData()` now compare before/after state and emit:

- `trip_created` when a trip appears
- `trip_assigned` when status/driver assignment moves into assignment state
- `trip_cancelled` when status becomes cancelled/canceled
- `trip_updated` for other trip mutations

Direct trip helpers in `src/config/firebase.js` also emit events:

- `updateTripStatus()`
- `saveOdometerReading()`
- `saveTripWorkflowUpdate()`

### Driver state

Driver array/profile writes now emit:

- `driver_status_changed`

Direct driver helpers also emit events:

- `updateDriverProfile()`

### Location state

`updateDriverLocation()` now writes latest location to:

```txt
driver_locations/{driverId}
```

and emits:

- `location_updated`

## Realtime Listener Contract

UI event consumers must use:

```txt
src/hooks/useSystemEvents.js
```

The hook uses Firestore `onSnapshot()` only.

Supported listener windows:

- Latest events: `orderBy(createdAt desc), limit(maxEvents)`
- Event type feed: `where(type == eventType), orderBy(createdAt desc)`
- Aggregate drilldown: `where(aggregateId == aggregateId), orderBy(createdAt desc)`

No polling is introduced.

## Security Rules

Rules now allow authenticated clients to create `system_events` and read the event feed. Updates/deletes are admin-only so events remain append-only for normal operations.

## Next Task Boundary

Task 2 establishes the event stream and connects the main write paths. Task 3 should build the driver live state engine on top of this foundation:

- active session ownership
- heartbeat every 5 seconds
- driver online/offline transitions
- old-session invalidation
