/**
 * Trip Statuses & Workflow States
 */

export const TRIP_STATUSES = {
  ASSIGNED: 'Assigned',
  ACCEPTED: 'Accepted',
  EN_ROUTE: 'En Route',
  ARRIVED: 'Arrived',
  PICKUP_COMPLETE: 'Pickup Complete',
  TRANSPORTING: 'Transporting',
  ARRIVED_DESTINATION: 'Arrived Destination',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
  DELAYED: 'Delayed',
  EMERGENCY: 'Emergency',
};

export const TRIP_STATUS_COLORS = {
  'Assigned': '#3b82f6',
  'Accepted': '#8b5cf6',
  'En Route': '#06b6d4',
  'Arrived': '#f59e0b',
  'Pickup Complete': '#a855f7',
  'Transporting': '#06b6d4',
  'Arrived Destination': '#f59e0b',
  'Completed': '#10b981',
  'Cancelled': '#ef4444',
  'No Show': '#6b7280',
  'Delayed': '#f97316',
  'Emergency': '#dc2626',
};

export const TRIP_STATUS_BADGES = {
  'Assigned': 'bg-blue-100 text-blue-800',
  'Accepted': 'bg-purple-100 text-purple-800',
  'En Route': 'bg-cyan-100 text-cyan-800',
  'Arrived': 'bg-amber-100 text-amber-800',
  'Pickup Complete': 'bg-fuchsia-100 text-fuchsia-800',
  'Transporting': 'bg-sky-100 text-sky-800',
  'Arrived Destination': 'bg-yellow-100 text-yellow-800',
  'Completed': 'bg-green-100 text-green-800',
  'Cancelled': 'bg-red-100 text-red-800',
  'No Show': 'bg-gray-100 text-gray-800',
  'Delayed': 'bg-orange-100 text-orange-800',
  'Emergency': 'bg-rose-100 text-rose-800',
};

export const DRIVER_STATUS_OPTIONS = ['Clocked In', 'On Break', 'Clocked Out'];

export const DRIVER_BADGE_STYLES = {
  'Clocked In': 'bg-green-100 text-green-800',
  'On Break': 'bg-amber-100 text-amber-800',
  'Clocked Out': 'bg-slate-100 text-slate-800',
};

export const VEHICLE_TYPES = ['Van', 'Sedan', 'SUV', 'Wheelchair Van', 'Stretcher Van', 'Other'];

export const MEDICAL_CONDITIONS = [
  'Ambulatory',
  'Wheelchair',
  'Stretcher',
  'Dialysis',
  'Ventilator',
  'Other',
];

export const NOTIFICATION_TYPES = {
  TRIP_ASSIGNED: 'trip_assigned',
  TRIP_ACCEPTED: 'trip_accepted',
  TRIP_COMPLETED: 'trip_completed',
  TRIP_CANCELLED: 'trip_cancelled',
  EMERGENCY_ALERT: 'emergency_alert',
  MESSAGE_RECEIVED: 'message_received',
  DRIVER_OFFLINE: 'driver_offline',
  GPS_LOSS: 'gps_loss',
};
