export const URGENT = {
  key: 'URGENT',
  label: 'CRITICAL',
  bg: 'bg-red-500',
  light: 'bg-red-50',
  border: 'border-red-200',
  glow: 'shadow-red-200/50',
  color: 'text-red-700',
  badge: 'bg-red-100 text-red-700 border-red-200',
};

export const UNASSIGNED = {
  key: 'UNASSIGNED',
  label: 'ATTENTION REQ.',
  bg: 'bg-amber-500',
  light: 'bg-amber-50',
  border: 'border-amber-200',
  glow: 'shadow-amber-200/50',
  color: 'text-amber-700',
  badge: 'bg-amber-100 text-amber-700 border-amber-200',
};

export const ON_TIME = {
  key: 'ON_TIME',
  label: 'ON TIME',
  bg: 'bg-emerald-500',
  light: 'bg-emerald-50',
  border: 'border-emerald-200',
  glow: 'shadow-emerald-200/50',
  color: 'text-emerald-700',
  badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const WORKFLOW_TERMINAL = new Set(['completed', 'cancelled', 'no show', 'rerouted']);

export function resolveStatus(trip) {
  if (!trip) return ON_TIME;
  const status = String(trip.status || '').trim().toLowerCase();

  if (status === 'cancelled' || status === 'no show' || status === 'rerouted') return URGENT;

  if (!trip.driverId || trip.driverId === '') return UNASSIGNED;

  if (status === 'en route' || status === 'navigating pickup' || status === 'navigating dropoff' || status === 'in transit') return ON_TIME;

  if (trip.arrivalDropoffTime || status === 'at dropoff' || status === 'arrived' || status === 'completed') return ON_TIME;

  return ON_TIME;
}
