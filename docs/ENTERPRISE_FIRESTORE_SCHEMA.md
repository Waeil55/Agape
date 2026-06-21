# Agape Care Enterprise Firestore Schema

This is the foundation schema for the real-time dispatch platform. It is designed for Firestore `onSnapshot()` listeners, high-frequency trip/driver reads, low-latency dispatch assignment, and separation between operational and analytical data.

## Architecture Rules

- Realtime first: every operational collection is safe to subscribe to with `onSnapshot()`.
- No polling dependency: clients should listen to query windows and document targets.
- No deeply nested operational writes: top-level collections are preferred, with shallow map fields only.
- Trips and drivers are optimized for high read frequency.
- Operational records are mutable where the app needs live state. Event and audit records are append-only.
- Analytical/reporting collections must be derived from operational records and must not drive dispatch UI state.

## Operational Collections

### `users/{userId}`

Identity and role profile. Document ID should be Firebase Auth UID.

```js
{
  id: string,
  email: string,
  username: string,
  displayName: string,
  role: 'admin' | 'dispatcher' | 'driver',
  status: 'active' | 'inactive' | 'suspended',
  profileId: string, // driverId or dispatcher/admin profile id
  permissions: string[],
  phone: string,
  settings: {
    theme: 'light' | 'dark' | 'system',
    fontScale: 'sm' | 'md' | 'lg' | 'xl',
    gpsApp: 'google_maps' | 'apple_maps' | 'waze',
    singleTripGpsApp: 'google_maps' | 'apple_maps' | 'waze'
  },
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastLoginAt: Timestamp,
  lastActiveAt: Timestamp
}
```

Primary listeners:

- Admin/dispatcher user directory: `users where status == active`
- Current user profile: `users/{auth.uid}`

### `drivers/{driverId}`

Live driver state and dispatch-facing driver profile. Document ID should match the driver profile id used in trips and assignments.

```js
{
  id: string,
  userId: string,
  name: string,
  phone: string,
  email: string,
  status: 'online' | 'offline' | 'available' | 'busy' | 'on_trip' | 'break' | 'suspended',
  availability: 'available' | 'unavailable',
  currentTripId: string | null,
  currentAssignmentId: string | null,
  activeSessionId: string | null,
  lastHeartbeatAt: Timestamp,
  lastLocationAt: Timestamp,
  lastKnownLocation: {
    lat: number,
    lng: number,
    accuracy: number,
    heading: number,
    speed: number,
    geohash: string
  },
  vehicle: {
    id: string,
    label: string,
    plate: string,
    capacity: number
  },
  fraudFlags: {
    gpsSpoof: boolean,
    impossibleSpeed: boolean,
    idleAnomaly: boolean,
    geofenceViolation: boolean,
    updatedAt: Timestamp
  },
  counters: {
    assignedToday: number,
    completedToday: number,
    cancelledToday: number
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Primary listeners:

- Dispatch live board: `drivers where status in [online, available, busy, on_trip]`
- Driver self state: `drivers/{driverId}`

### `trips/{tripId}`

Operational trip state. This is the single source of truth for live trip lifecycle.

```js
{
  id: string,
  bookingId: string,
  ledgerId: string,
  clientId: string,
  clientName: string,
  clientPhone: string,
  serviceType: string,
  status: 'pending' | 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'rerouted',
  lifecycleStep: 'created' | 'assigned' | 'accepted' | 'arrived_pickup' | 'picked_up' | 'arrived_dropoff' | 'completed',
  scheduleDate: string, // YYYY-MM-DD local company date
  scheduledPickupAt: Timestamp,
  requestedDropoffAt: Timestamp | null,
  pickup: {
    address: string,
    lat: number | null,
    lng: number | null,
    phone: string,
    notes: string
  },
  dropoff: {
    address: string,
    lat: number | null,
    lng: number | null,
    phone: string,
    notes: string
  },
  assignmentId: string | null,
  driverId: string | null,
  driverName: string | null,
  dispatcherId: string | null,
  routePlanId: string | null,
  sequenceId: string | null,
  stepState: {
    startedAt: Timestamp | null,
    arrivedPickupAt: Timestamp | null,
    pickupOdometer: number | null,
    pickedUpAt: Timestamp | null,
    arrivedDropoffAt: Timestamp | null,
    dropoffOdometer: number | null,
    completedAt: Timestamp | null,
    signatureUrl: string | null
  },
  exception: {
    type: 'cancelled' | 'no_show' | 'rerouted' | null,
    reason: string,
    byUserId: string,
    at: Timestamp | null
  },
  search: {
    clientNameLower: string,
    bookingIdLower: string,
    pickupLower: string,
    dropoffLower: string
  },
  createdAt: Timestamp,
  updatedAt: Timestamp,
  completedAt: Timestamp | null
}
```

Primary listeners:

- Dispatch board: `trips where scheduleDate == today orderBy scheduledPickupAt`
- Driver trips: `trips where driverId == currentDriverId where status in activeStatuses orderBy scheduledPickupAt`
- Single trip workflow: `trips/{tripId}`

### `assignments/{assignmentId}`

Assignment delivery channel. Created by dispatcher/admin action and listened to by the assigned driver.

```js
{
  id: string,
  tripId: string,
  driverId: string,
  dispatcherId: string,
  status: 'offered' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'transferred',
  priority: 'normal' | 'urgent',
  deliveryState: 'queued' | 'delivered' | 'seen',
  offeredAt: Timestamp,
  seenAt: Timestamp | null,
  respondedAt: Timestamp | null,
  expiresAt: Timestamp | null,
  transfer: {
    fromDriverId: string | null,
    toDriverId: string | null,
    requiresPassword: boolean,
    requestedAt: Timestamp | null
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Primary listeners:

- Driver inbox: `assignments where driverId == currentDriverId where status in [offered, transferred] orderBy offeredAt`
- Dispatch assignment monitor: `assignments where status in [offered, accepted, declined] orderBy updatedAt`

### `sessions/{sessionId}`

Device-bound login session. Supports one active driver session and real-time force logout.

```js
{
  id: string,
  userId: string,
  driverId: string | null,
  role: 'admin' | 'dispatcher' | 'driver',
  deviceId: string,
  deviceLabel: string,
  status: 'active' | 'invalidated' | 'expired' | 'logged_out',
  invalidatedReason: 'new_login' | 'heartbeat_timeout' | 'admin_force_logout' | null,
  createdAt: Timestamp,
  lastSeenAt: Timestamp,
  expiresAt: Timestamp,
  invalidatedAt: Timestamp | null
}
```

Primary listeners:

- Current session: `sessions/{sessionId}`
- Driver active session check: `sessions where driverId == currentDriverId where status == active`

### `heartbeat/{driverId}`

Single lightweight liveness document per driver. High-write, low-history. Historical heartbeat analysis belongs in `system_events`.

```js
{
  driverId: string,
  userId: string,
  sessionId: string,
  status: 'alive' | 'offline' | 'expired',
  lastSeenAt: Timestamp,
  clientTimeMs: number,
  appVersion: string,
  network: {
    online: boolean,
    effectiveType: string
  },
  device: {
    id: string,
    platform: string
  }
}
```

Primary listeners:

- Dispatch liveness: `heartbeat orderBy lastSeenAt desc`
- Driver self liveness: `heartbeat/{driverId}`

### `driver_locations/{driverId}`

Latest driver location document. High-frequency location history should be event/analytics storage, not a deeply nested live write tree.

```js
{
  driverId: string,
  sessionId: string,
  tripId: string | null,
  assignmentId: string | null,
  lat: number,
  lng: number,
  accuracy: number,
  speed: number,
  heading: number,
  altitude: number | null,
  geohash: string,
  source: 'gps' | 'network' | 'manual',
  capturedAt: Timestamp,
  receivedAt: Timestamp,
  fraudSignals: {
    speedAnomaly: boolean,
    teleport: boolean,
    idle: boolean,
    lowAccuracy: boolean
  }
}
```

Primary listeners:

- Live map: `driver_locations`
- Single driver map: `driver_locations/{driverId}`

### `system_events/{eventId}`

Append-only event stream for operational state changes. Every state change in later tasks must write one event record.

```js
{
  id: string,
  type:
    | 'trip_created'
    | 'trip_assigned'
    | 'trip_updated'
    | 'trip_cancelled'
    | 'driver_status_changed'
    | 'location_updated'
    | 'assignment_updated'
    | 'session_invalidated'
    | 'heartbeat_missed'
    | 'fraud_flagged',
  aggregateType: 'trip' | 'driver' | 'assignment' | 'session' | 'location' | 'chat',
  aggregateId: string,
  tripId: string | null,
  driverId: string | null,
  assignmentId: string | null,
  actorUserId: string,
  actorRole: 'admin' | 'dispatcher' | 'driver' | 'system',
  severity: 'info' | 'warning' | 'critical',
  payload: {},
  createdAt: Timestamp,
  companyDate: string
}
```

Primary listeners:

- Admin event feed: `system_events orderBy createdAt desc limit 200`
- Driver/trip drilldown: `system_events where aggregateId == id orderBy createdAt desc`

### `chat_threads/{threadId}`

Thread metadata. Messages should be top-level or shallow child collection in a later chat task; for Task 1 this document supports live thread lists.

```js
{
  id: string,
  type: 'direct' | 'dispatch' | 'trip' | 'group',
  tripId: string | null,
  assignmentId: string | null,
  participantIds: string[],
  participantRoles: string[],
  title: string,
  status: 'open' | 'closed' | 'archived',
  lastMessage: {
    text: string,
    senderId: string,
    sentAt: Timestamp
  },
  unreadBy: string[],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Primary listeners:

- User inbox: `chat_threads where participantIds array-contains currentUserId orderBy updatedAt desc`
- Trip chat: `chat_threads where tripId == tripId`

### `audit_logs/{auditId}`

Append-only compliance/security log. This is analytical/compliance data, not the live dispatch state source.

```js
{
  id: string,
  action: string,
  entityType: 'user' | 'driver' | 'trip' | 'assignment' | 'session' | 'settings',
  entityId: string,
  actorUserId: string,
  actorRole: 'admin' | 'dispatcher' | 'driver' | 'system',
  before: {},
  after: {},
  ip: string,
  deviceId: string,
  createdAt: Timestamp,
  companyDate: string
}
```

Primary listeners:

- Admin audit review: `audit_logs orderBy createdAt desc limit 200`
- Entity audit trail: `audit_logs where entityType == type where entityId == id orderBy createdAt desc`

## Operational vs Analytical Separation

Operational source of truth:

- `users`
- `drivers`
- `trips`
- `assignments`
- `sessions`
- `heartbeat`
- `driver_locations`
- `chat_threads`

Operational event stream:

- `system_events`

Analytical/compliance:

- `audit_logs`
- future derived reports, daily summaries, billing exports, BI materialized views

Legacy collections currently in the app, to be migrated gradually:

- `appData/agape` -> split into `trips`, `drivers`, operational settings
- `driverProfiles` -> `drivers`
- `driverTripProgress` -> `trips.stepState`
- `tripLedger` -> analytical ledger/reporting mirror
- `chatData/conversations` and `chat_messages` -> `chat_threads` plus message records in Task 10
- `driverTelemetry` -> `driver_locations` and `system_events`

## Required Composite Indexes

The committed `firestore.indexes.json` contains the first foundation indexes for:

- Driver trip list by driver/status/time
- Dispatch board by date/status/time
- Assignments by driver/status/offered time
- Active session checks
- System event feeds and drilldowns
- Chat thread inboxes
- Audit log drilldowns

These indexes are intentionally aligned with the realtime listener windows above.
