const normalize = (value) => String(value || '').trim();
const normalizeEmail = (value) => normalize(value).toLowerCase();

const COMPANY_DRIVER_PATTERNS = [
  /agape\s+care/i,
  /medical\s+transportation/i,
  /transportation\s+(?:inc|llc|company|provider)/i,
  /pending\s+assignment/i,
  /^unassigned$/i,
];

export const isCompanyDriverPlaceholder = (value) => {
  const label = normalize(value);
  return Boolean(label && COMPANY_DRIVER_PATTERNS.some((pattern) => pattern.test(label)));
};

const driverName = (driver) => normalize(driver?.name || driver?.displayName || driver?.fullName);

export const resolveTripDriver = (trip = {}, drivers = []) => {
  const assignedId = normalize(trip.driverId || trip.assignedDriverId || trip.completedDriverId);
  const assignedEmail = normalizeEmail(trip.driverEmail || trip.assignedDriverEmail || trip.completedDriverEmail);
  if (assignedId) {
    const byId = drivers.find((driver) => normalize(driver?.id) === assignedId);
    if (byId) return byId;
  }
  if (assignedEmail) {
    const byEmail = drivers.find((driver) => normalizeEmail(driver?.email) === assignedEmail);
    if (byEmail) return byEmail;
  }
  const recordedName = normalize(trip.completedDriverName || trip.driverName || trip.driver);
  if (recordedName && !isCompanyDriverPlaceholder(recordedName)) {
    const lowered = recordedName.toLowerCase();
    return drivers.find((driver) => driverName(driver).toLowerCase() === lowered) || null;
  }
  return null;
};

export const resolveTripDriverName = (trip = {}, drivers = [], knownDriver = null) => {
  const authoritative = resolveTripDriver(trip, drivers) || knownDriver;
  const authoritativeName = driverName(authoritative);
  if (authoritativeName && !isCompanyDriverPlaceholder(authoritativeName)) return authoritativeName;
  const recordedName = normalize(trip.completedDriverName || trip.driverName || trip.driver);
  return recordedName && !isCompanyDriverPlaceholder(recordedName) ? recordedName : '';
};

export const hydrateTripDriverIdentity = (trip = {}, drivers = []) => {
  if (!trip) return trip;
  const authoritative = resolveTripDriver(trip, drivers);
  if (!authoritative) {
    if (!isCompanyDriverPlaceholder(trip.driverName) && !isCompanyDriverPlaceholder(trip.completedDriverName)) return trip;
    return {
      ...trip,
      ...(isCompanyDriverPlaceholder(trip.driverName) ? { driverName: null } : {}),
      ...(isCompanyDriverPlaceholder(trip.completedDriverName) ? { completedDriverName: null } : {}),
    };
  }
  const name = driverName(authoritative);
  if (!name || isCompanyDriverPlaceholder(name)) return trip;
  const terminal = ['completed', 'cancelled', 'canceled', 'no show', 'no_show', 'rerouted']
    .includes(normalize(trip.status || trip.lifecycleStatus).toLowerCase());
  return {
    ...trip,
    driverId: authoritative.id || trip.driverId || null,
    driverName: name,
    driverEmail: authoritative.email || trip.driverEmail || null,
    ...(terminal ? { completedDriverName: name } : {}),
  };
};

export const hydrateTripDriverIdentities = (trips = [], drivers = []) =>
  (trips || []).map((trip) => hydrateTripDriverIdentity(trip, drivers));
