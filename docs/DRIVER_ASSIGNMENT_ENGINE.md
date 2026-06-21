# Agape Care Driver Assignment Engine

Task 6 adds a real-time driver assignment delivery channel.

## Assignment Collection

Assignments are delivered through:

```txt
assignments/{assignmentId}
```

Assignment records are created/mirrored when an active trip has a driver assignment.

Important fields:

- `tripId`
- `driverId`
- `driverEmail`
- `driverName`
- `status`
- `deliveryState`
- `priority`
- `offeredAt`
- `offeredAtLocal`
- `updatedAt`
- `tripSnapshot`

## Driver Listener

Driver portal uses:

```txt
src/hooks/useDriverAssignments.js
```

The hook subscribes with `onSnapshot()` to:

- `assignments where driverId == currentDriverId where status in [offered, transferred] orderBy offeredAt desc`
- `assignments where driverEmail == currentDriverEmail where status in [offered, transferred] orderBy offeredAt desc`

This creates a dedicated low-latency assignment inbox independent from the regular trip list.

## Driver UI

The Trips page now shows a Live Dispatch Assignment banner when active assignments arrive.

Driver actions:

- Acknowledge: marks `deliveryState = seen`.
- Accept: marks assignment `status = accepted` and `deliveryState = seen`.

The trip itself is still visible through the real-time `trips` listener established in Task 5.

## Security

Firestore rules allow:

- Dispatchers/admins to create assignments.
- Drivers to read and update assignments addressed to their email/user id.
- Deletes remain admin-only.

## Indexes

Composite indexes support low-latency driver assignment inbox queries by:

- `driverId + status + offeredAt desc`
- `driverEmail + status + offeredAt desc`

## Event Stream

Driver acknowledgement and acceptance emit:

- `assignment_updated`

These events are stored in `system_events`.

## Current Boundary

Task 6 implements the assignment delivery channel and driver UI inbox. Further escalation, expiry, and dispatcher assignment monitoring can be expanded in later dispatch dashboard tasks.
