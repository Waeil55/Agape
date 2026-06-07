// Agape Care — Firestore Schema (Task 1: Enterprise Architecture)
// Collections optimized for real-time onSnapshot listeners
export const COLLECTIONS = {
  // Operational
  TRIPS: 'trips',
  DRIVERS: 'driverProfiles',
  DISPATCHERS: 'dispatcherProfiles',
  VEHICLES: 'fleetVehicles',
  ASSIGNMENTS: 'assignments',
  // Real-time state
  SESSIONS: 'sessions',
  HEARTBEAT: 'heartbeat',
  DRIVER_LOCATIONS: 'driver_locations',
  DRIVER_TRIP_PROGRESS: 'driverTripProgress',
  // Events & comms
  SYSTEM_EVENTS: 'system_events',
  CHAT_THREADS: 'chat_threads',
  CHAT_MESSAGES: 'chat_messages',
  // Analytics & audit
  AUDIT_LOGS: 'audit_logs',
  DRIVER_TELEMETRY: 'driverTelemetry',
  TRIP_LEDGER: 'tripLedger',
};

export const TRIP_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const DRIVER_STATUS = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  ON_TRIP: 'On Trip',
  AVAILABLE: 'Available',
};

export const HEARTBEAT_INTERVAL_MS = 5000;  // 5 seconds
export const OFFLINE_TIMEOUT_MS = 15000;    // 15 seconds = offline
export const LOGOUT_TIMEOUT_MS = 30000;     // 30 seconds = force logout
