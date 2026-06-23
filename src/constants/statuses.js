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

export const DRIVER_LIVE_STATUS_LABELS = {
  'assigned': 'Assigned',
  'accepted': 'Accepted',
  'en route': 'En Route',
  'navigating pickup': 'Going to Pickup',
  'at pickup': 'At Pickup',
  'pickup complete': 'Picked Up',
  'in transit': 'In Transit',
  'navigating dropoff': 'Going to Dropoff',
  'at dropoff': 'At Dropoff',
  'arrived': 'Arrived',
  'in mission': 'On Mission',
  'in progress': 'In Progress',
  'completed': 'Completed',
};

export const DRIVER_LIVE_STATUS_COLORS = {
  'assigned': 'bg-blue-100 text-blue-700',
  'accepted': 'bg-purple-100 text-purple-700',
  'en route': 'bg-cyan-100 text-cyan-700',
  'navigating pickup': 'bg-sky-100 text-sky-700',
  'at pickup': 'bg-amber-100 text-amber-700',
  'pickup complete': 'bg-fuchsia-100 text-fuchsia-700',
  'in transit': 'bg-teal-100 text-teal-700',
  'navigating dropoff': 'bg-sky-100 text-sky-700',
  'at dropoff': 'bg-yellow-100 text-yellow-700',
  'arrived': 'bg-green-100 text-green-700',
  'in mission': 'bg-indigo-100 text-indigo-700',
  'in progress': 'bg-cyan-100 text-cyan-700',
  'completed': 'bg-emerald-100 text-emerald-700',
};

export function getDriverLiveStatus(driver) {
  if (!driver) return { label: 'Unknown', color: 'bg-slate-100 text-slate-600' };
  const driverStatus = String(driver.status || '').toLowerCase();
  if (driverStatus === 'offline' || !driver.clockedIn) {
    return { label: 'Offline', color: 'bg-slate-100 text-slate-600' };
  }
  if (driverStatus === 'available') {
    return { label: 'Available', color: 'bg-green-100 text-green-700' };
  }
  const tripState = String(driver.currentTripState || '').toLowerCase();
  if (tripState && DRIVER_LIVE_STATUS_LABELS[tripState]) {
    return { label: DRIVER_LIVE_STATUS_LABELS[tripState], color: DRIVER_LIVE_STATUS_COLORS[tripState] || 'bg-blue-100 text-blue-700' };
  }
  if (driverStatus === 'on trip') {
    return { label: 'On Trip', color: 'bg-blue-100 text-blue-700' };
  }
  return { label: driver.status || 'Active', color: 'bg-blue-100 text-blue-700' };
}
