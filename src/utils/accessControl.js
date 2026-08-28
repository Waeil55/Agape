export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function getDispatcherForUser(dispatchers = [], currentUser = '') {
  const email = normalizeEmail(currentUser);
  return dispatchers.find(dispatcher => normalizeEmail(dispatcher.email) === email) || null;
}

export function isDriverAssignedToDispatcher(driver, dispatcher) {
  if (!driver || !dispatcher) return false;
  const assignedId = driver.assignedDispatcher || driver.assignedTo || '';
  return assignedId === dispatcher.id;
}

export function isTripInDispatcherScope(trip, scopedDrivers = []) {
  if (!trip) return false;
  if (trip.status === 'Unassigned' || !trip.driverId) return true;
  const scopedIds = new Set(scopedDrivers.map(driver => driver.id));
  const scopedEmails = new Set(scopedDrivers.map(driver => normalizeEmail(driver.email)).filter(Boolean));
  return scopedIds.has(trip.driverId) || scopedEmails.has(normalizeEmail(trip.driverEmail));
}

export function filterDriversForRole(role, currentUser, drivers = [], dispatchers = []) {
  if (role !== 'dispatcher') return drivers;
  const dispatcher = getDispatcherForUser(dispatchers, currentUser);
  return drivers.filter(driver => isDriverAssignedToDispatcher(driver, dispatcher));
}

export function filterTripsForRole(role, currentUser, trips = [], drivers = [], dispatchers = []) {
  if (role !== 'dispatcher') return trips;
  const scopedDrivers = filterDriversForRole(role, currentUser, drivers, dispatchers);
  const scopedIds = new Set(scopedDrivers.map(driver => driver.id).filter(Boolean));
  const scopedEmails = new Set(scopedDrivers.map(driver => normalizeEmail(driver.email)).filter(Boolean));
  return trips.filter(trip => (
    trip?.status === 'Unassigned'
    || !trip?.driverId
    || scopedIds.has(trip.driverId)
    || scopedEmails.has(normalizeEmail(trip.driverEmail))
  ));
}
