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
  const assignedIds = [trip.driverId, trip.assignedDriverId]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const assignedEmails = [trip.driverEmail, trip.assignedDriverEmail]
    .map(normalizeEmail)
    .filter(Boolean);
  const uniqueIds = new Set(assignedIds);
  const uniqueEmails = new Set(assignedEmails);
  if (uniqueIds.size > 1 || uniqueEmails.size > 1) return false;

  const assignedId = [...uniqueIds][0] || '';
  const assignedEmail = [...uniqueEmails][0] || '';
  if (!assignedId && !assignedEmail) {
    return String(trip.status || '').trim().toLowerCase() === 'unassigned';
  }

  const scoped = Array.isArray(scopedDrivers) ? scopedDrivers : [];
  if (assignedId) {
    const idMatches = scoped.filter((driver) => String(driver?.id || '').trim() === assignedId);
    if (idMatches.length !== 1) return false;
    return !assignedEmail || normalizeEmail(idMatches[0]?.email) === assignedEmail;
  }

  // An email-only legacy assignment is safe only when it identifies exactly
  // one profile in this dispatcher's scope. Duplicate profiles must be
  // reconciled instead of selecting whichever record happens to come first.
  return scoped.filter((driver) => normalizeEmail(driver?.email) === assignedEmail).length === 1;
}

// Driver workflow writes require a stored, verifiable assignment key. A
// display-name match is intentionally insufficient because names are neither
// unique nor an authorization boundary. Legacy ID/email field names remain
// supported so existing owned trips do not disappear during migration.
export function isDriverTripOwner(trip, currentUser = '', selfDriver = null) {
  if (!trip || !selfDriver?.id) return false;
  const selfId = String(selfDriver.id || '').trim();
  const userEmail = normalizeEmail(currentUser);
  const profileEmail = normalizeEmail(selfDriver.email);
  if (!selfId || !userEmail || !profileEmail || profileEmail !== userEmail) return false;

  // Completion identity is historical evidence, not current assignment
  // authority. Only the active and supported legacy assignment fields may
  // authorize a workflow mutation.
  const assignedIds = [trip.driverId, trip.assignedDriverId]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const assignedEmails = [trip.driverEmail, trip.assignedDriverEmail]
    .map(normalizeEmail)
    .filter(Boolean);
  const uniqueIds = new Set(assignedIds);
  const uniqueEmails = new Set(assignedEmails);
  if (uniqueIds.size > 1 || uniqueEmails.size > 1) return false;

  const assignedId = [...uniqueIds][0] || '';
  const assignedEmail = [...uniqueEmails][0] || '';
  if (!assignedId && !assignedEmail) return false;
  if (assignedId && assignedId !== selfId) return false;
  if (assignedEmail && assignedEmail !== userEmail) return false;
  return true;
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
    const emailMatches = list.filter(driver => normalizeEmail(driver?.email) === email);
    // Duplicate profile records make an email-only assignment ambiguous. Do
    // not choose the first record; block until identity data is reconciled.
    if (!email || emailMatches.length > 1) {
      return { allowedDrivers: [], lockedDriverId: '', allowUnassigned: false };
    }
    const suppliedSelfEmail = normalizeEmail(selfDriver?.email);
    const suppliedSelfConflicts = selfDriver && (
      suppliedSelfEmail !== email
      || (emailMatches.length === 1 && emailMatches[0].id !== selfDriver.id)
    );
    if (suppliedSelfConflicts) {
      return { allowedDrivers: [], lockedDriverId: '', allowUnassigned: false };
    }
    const self = selfDriver || emailMatches[0] || null;
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
