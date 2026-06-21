# Agape Care Real-Time Trips Engine

Task 5 makes `trips/{tripId}` the operational real-time trip source while preserving the legacy UI data shape during migration.

## Operational Source

Live trip state is stored in:

```txt
trips/{tripId}
```

The application now subscribes to the top-level `trips` collection with `onSnapshot()` and merges those documents into the existing app state. This removes refresh dependency for trip lifecycle updates.

## Preserved Legacy Mirrors

The app still writes legacy mirrors for compatibility:

- `appData/agape`
- `tripLedger`
- `driverTripProgress`

However, driver workflow updates no longer depend on legacy `appData/agape` permission. Operational trip updates are written to `trips/{tripId}` first and remain available through the live listener.

## Lifecycle Normalization

Trip lifecycle utilities live in:

```txt
src/utils/tripLifecycle.js
```

Normalized lifecycle states:

- `pending`
- `assigned`
- `accepted`
- `in_progress`
- `completed`
- `cancelled`
- `no_show`
- `rerouted`

Normalized lifecycle steps:

- `created`
- `assigned`
- `accepted`
- `navigating_pickup`
- `arrived_pickup`
- `picked_up`
- `navigating_dropoff`
- `arrived_dropoff`
- `completed`

## Real-Time Query Behavior

Dispatch/admin:

- Subscribe to `trips`
- Merge live trip docs into the current operational board
- No manual refresh required

Driver:

- Driver-owned workflow updates write to `driverTripProgress` and `trips/{tripId}`
- Driver portal receives assignments and workflow changes from live trip snapshots
- Driver updates do not require write access to `appData/agape`

## Assignment Delivery Foundation

Assigned active trips are mirrored into:

```txt
assignments/{assignmentId}
```

This provides the delivery channel for Task 6. The current driver trips view continues to use the live `trips` listener, so assignments are visible immediately as trip docs update.

## Security

Firestore rules now allow:

- Dispatchers/admins to create and update trips.
- Drivers to create/update trips assigned to their email or user id.
- Deletes remain admin-only.

This keeps driver workflow persistence working without opening global trip mutation to unrelated drivers.

## Event Behavior

Trip writes continue to emit `system_events` through the Task 2 event engine:

- `trip_created`
- `trip_assigned`
- `trip_updated`
- `trip_cancelled`

## Current Boundary

Task 5 establishes the real-time trip lifecycle engine and live trip source. Task 6 should build the low-latency assignment delivery UI and assignment-specific listener flow on top of `assignments`.
