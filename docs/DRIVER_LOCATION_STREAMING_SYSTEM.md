# Driver Location Streaming System

Task 8 adds a realtime GPS stream for active driver PWAs.

## Stream Cadence

- Driver portal captures GPS through `navigator.geolocation.watchPosition`.
- The app flushes the latest location sample every 4 seconds.
- Samples include latitude, longitude, accuracy, altitude, speed in mph, heading, client capture time, active trip context, and stream source.

## Firestore Writes

- `driver_locations/{driverId}` stores the latest high-frequency location sample.
- `drivers/{driverId}` stores operational live location fields for dashboards.
- `driverProfiles/{driverId}` remains the UI profile mirror.
- `driverTelemetry/{driverId}__{date}` stores daily breadcrumbs, movement state, dwell time, and trip context.
- Every accepted sample emits `system_events` with type `location_updated`.

## Fraud Signals

Each sample computes early fraud-support signals:

- `speed_anomaly`
- `teleport`
- `poor_accuracy`
- `idle`

The raw signal map is stored as `fraudSignals`; query-friendly flags are stored as `fraudFlags`.

## Notes

- This layer does not poll.
- This layer does not use the service worker for data sync.
- Offline driver samples are queued through the existing driver page queue and flushed when connectivity returns.
