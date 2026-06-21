export const FIRESTORE_COLLECTIONS = Object.freeze({
  USERS: 'users',
  DRIVERS: 'drivers',
  TRIPS: 'trips',
  ASSIGNMENTS: 'assignments',
  SESSIONS: 'sessions',
  HEARTBEAT: 'heartbeat',
  DRIVER_LOCATIONS: 'driver_locations',
  SYSTEM_EVENTS: 'system_events',
  CHAT_THREADS: 'chat_threads',
  AUDIT_LOGS: 'audit_logs',
});

export const TRIP_STATUSES = Object.freeze({
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  REROUTED: 'rerouted',
});

export const ASSIGNMENT_STATUSES = Object.freeze({
  OFFERED: 'offered',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  TRANSFERRED: 'transferred',
});

export const DRIVER_STATUSES = Object.freeze({
  ONLINE: 'online',
  OFFLINE: 'offline',
  AVAILABLE: 'available',
  BUSY: 'busy',
  ON_TRIP: 'on_trip',
  BREAK: 'break',
  SUSPENDED: 'suspended',
});

export const SESSION_STATUSES = Object.freeze({
  ACTIVE: 'active',
  INVALIDATED: 'invalidated',
  EXPIRED: 'expired',
  LOGGED_OUT: 'logged_out',
});

export const SYSTEM_EVENT_TYPES = Object.freeze({
  TRIP_CREATED: 'trip_created',
  TRIP_ASSIGNED: 'trip_assigned',
  TRIP_UPDATED: 'trip_updated',
  TRIP_CANCELLED: 'trip_cancelled',
  DRIVER_STATUS_CHANGED: 'driver_status_changed',
  LOCATION_UPDATED: 'location_updated',
  ASSIGNMENT_UPDATED: 'assignment_updated',
  SESSION_INVALIDATED: 'session_invalidated',
  HEARTBEAT_MISSED: 'heartbeat_missed',
  FRAUD_FLAGGED: 'fraud_flagged',
});

export const ANALYTICAL_COLLECTIONS = Object.freeze([
  FIRESTORE_COLLECTIONS.AUDIT_LOGS,
]);

export const HIGH_FREQUENCY_COLLECTIONS = Object.freeze([
  FIRESTORE_COLLECTIONS.DRIVERS,
  FIRESTORE_COLLECTIONS.TRIPS,
  FIRESTORE_COLLECTIONS.HEARTBEAT,
  FIRESTORE_COLLECTIONS.DRIVER_LOCATIONS,
]);
