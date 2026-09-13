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
  return trips.filter(trip => isTripInDispatcherScope(trip, scopedDrivers));
}

// =============================================================================
// UPLOAD SCOPE — who may file trips for whom (bulk import, scan, manual add).
//
// Contract (least privilege, fail closed):
//   admin      → every driver, free assignment (Unassigned allowed).
//   dispatcher → assigned drivers ONLY (Unassigned allowed — normal dispatch
//                flow assigns later). Out-of-scope driver IDs are blocked.
//   driver     → exactly one profile: themselves. lockedDriverId is set and
//                Unassigned is forbidden — every uploaded trip is force-tagged
//                to self before validation.
//   other roles → NOTHING. Empty allow-list blocks the import with a reason.
//
// selfDriver should be the resolved own profile (App.jsx currentUserDriverProfile);
// when absent we fall back to an email match inside drivers, and when that also
// fails the allow-list is empty (profile still syncing → blocked, not guessed).
// Callers must treat an empty allowedDrivers as "block with reason", and
// handleUploadedTrips re-validates every trip (client UI lists are not trust).
// =============================================================================
export function getUploadScopeForRole({ role, currentUser, drivers = [], dispatchers = [], selfDriver = null }) {
  const list = Array.isArray(drivers) ? drivers : [];
  if (role === 'admin') {
    return { allowedDrivers: list, lockedDriverId: '', allowUnassigned: true };
  }
  if (role === 'dispatcher') {
    return {
      allowedDrivers: filterDriversForRole('dispatcher', currentUser, list, dispatchers),
      lockedDriverId: '',
      allowUnassigned: true,
    };
  }
  if (role === 'driver') {
    const email = normalizeEmail(currentUser);
    const self = selfDriver
      || list.find(driver => normalizeEmail(driver?.email) === email)
      || null;
    if (!self?.id) return { allowedDrivers: [], lockedDriverId: '', allowUnassigned: false };
    return { allowedDrivers: [self], lockedDriverId: self.id, allowUnassigned: false };
  }
  return { allowedDrivers: [], lockedDriverId: '', allowUnassigned: false };
}

// Single-trip scope check shared by the upload gate. Unassigned trips
// (no driverId) are allowed only when the scope permits them.
export function isTripInUploadScope(trip, scope) {
  if (!trip || !scope) return false;
  const allowedIds = new Set((scope.allowedDrivers || []).map(driver => driver?.id).filter(Boolean));
  if (!trip.driverId) return scope.allowUnassigned === true;
  return allowedIds.has(trip.driverId);
}
