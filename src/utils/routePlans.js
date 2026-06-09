export const ROUTE_ASSIGNMENT_STATUS = Object.freeze({
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  DISMISSED: 'dismissed',
  EXPIRED: 'expired',
});

export const ROUTE_STATUS_LABELS = Object.freeze({
  template: 'Template',
  [ROUTE_ASSIGNMENT_STATUS.ASSIGNED]: 'Assigned Today',
  [ROUTE_ASSIGNMENT_STATUS.ACCEPTED]: 'Accepted',
  [ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS]: 'In Progress',
  [ROUTE_ASSIGNMENT_STATUS.COMPLETED]: 'Completed',
  [ROUTE_ASSIGNMENT_STATUS.DISMISSED]: 'Dismissed',
  [ROUTE_ASSIGNMENT_STATUS.EXPIRED]: 'Expired',
});

export const ROUTE_STATUS_BADGES = Object.freeze({
  template: 'bg-blue-50 text-blue-700 border-blue-200',
  [ROUTE_ASSIGNMENT_STATUS.ASSIGNED]: 'bg-amber-50 text-amber-700 border-amber-200',
  [ROUTE_ASSIGNMENT_STATUS.ACCEPTED]: 'bg-sky-50 text-sky-700 border-sky-200',
  [ROUTE_ASSIGNMENT_STATUS.IN_PROGRESS]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [ROUTE_ASSIGNMENT_STATUS.COMPLETED]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [ROUTE_ASSIGNMENT_STATUS.DISMISSED]: 'bg-slate-100 text-slate-600 border-slate-200',
  [ROUTE_ASSIGNMENT_STATUS.EXPIRED]: 'bg-rose-50 text-rose-700 border-rose-200',
});

const DAY_MAP = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

const INACTIVE_ASSIGNMENT_STATUSES = new Set([
  ROUTE_ASSIGNMENT_STATUS.COMPLETED,
  ROUTE_ASSIGNMENT_STATUS.DISMISSED,
  ROUTE_ASSIGNMENT_STATUS.EXPIRED,
]);

const TERMINAL_TRIP_STATUSES = new Set(['Completed', 'Cancelled', 'No Show']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const getLocalDateKey = (value = new Date()) => {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDayAbbr = (value = new Date()) => {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value);
  return DAY_MAP[date.getDay()];
};

export const getEndOfDayIso = (value = new Date()) => {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

export const isTerminalTripStatus = (status) => TERMINAL_TRIP_STATUSES.has(status);

export const normalizeRouteRecord = (route, value = new Date()) => {
  if (!route) return null;
  const now = value instanceof Date ? value : new Date(value);
  const todayKey = getLocalDateKey(now);
  const todayAbbr = getDayAbbr(now);
  const type = route.type || 'recurring';
  const assignmentDate = route.assignmentDate || null;
  const expiresAtMs = route.expiresAt ? Date.parse(route.expiresAt) : null;
  const rawStatus = route.assignmentStatus || null;
  const isRecurring = type === 'recurring';
  const isTodayAssignment = type === 'today';
  const hasValidDate = assignmentDate === todayKey;
  const isExpiredByStatus = INACTIVE_ASSIGNMENT_STATUSES.has(rawStatus);
  const isExpiredByDate = isTodayAssignment && (!assignmentDate || !hasValidDate);
  const isExpiredByTime = isTodayAssignment && Number.isFinite(expiresAtMs) && expiresAtMs < now.getTime();
  const isExpired = isTodayAssignment && (isExpiredByStatus || isExpiredByDate || isExpiredByTime);
  const sequence = Array.isArray(route.sequence) ? route.sequence.filter(Boolean) : [];

  let statusKey = rawStatus || ROUTE_ASSIGNMENT_STATUS.ASSIGNED;
  if (isRecurring) statusKey = 'template';
  if (isExpired) statusKey = isExpiredByStatus ? rawStatus : ROUTE_ASSIGNMENT_STATUS.EXPIRED;

  return {
    ...route,
    type,
    sequence,
    assignmentDate,
    assignedDriver: route.assignedDriver || null,
    isRecurring,
    isTodayAssignment,
    appliesToday: isRecurring ? (route.days || []).includes(todayAbbr) : hasValidDate,
    isActiveToday: isTodayAssignment && hasValidDate && !INACTIVE_ASSIGNMENT_STATUSES.has(statusKey) && !isExpiredByTime,
    isExpired,
    statusKey,
    statusLabel: ROUTE_STATUS_LABELS[statusKey] || ROUTE_STATUS_LABELS[ROUTE_ASSIGNMENT_STATUS.ASSIGNED],
    statusBadgeClass: ROUTE_STATUS_BADGES[statusKey] || ROUTE_STATUS_BADGES[ROUTE_ASSIGNMENT_STATUS.ASSIGNED],
  };
};

export const getValidRouteStops = (route, trips = []) => {
  const tripIds = new Set((trips || []).map((trip) => trip.id));
  return (route?.sequence || []).filter((stop) => stop?.clientId && tripIds.has(stop.clientId));
};

export const routeHasAssignedTripsForDriver = (route, driver, trips = []) => {
  if (!route || !driver?.id) return false;
  const tripIds = new Set((trips || []).map((trip) => trip.id));
  if ((route.sequence || []).some((stop) => (
    stop?.source === 'route-plan'
    || (stop?.address && stop?.clientId && !tripIds.has(stop.clientId))
  ))) return true;
  const driverEmail = normalizeEmail(driver.email);
  return getValidRouteStops(route, trips).some((stop) => {
    const trip = trips.find((item) => item.id === stop.clientId);
    if (!trip) return false;
    if (isTerminalTripStatus(trip.status)) return false;
    if (route.assignmentDate && trip.date && trip.date !== route.assignmentDate) return false;
    const tripDriverEmail = normalizeEmail(trip.driverEmail);
    return trip.driverId === driver.id || (driverEmail && tripDriverEmail === driverEmail);
  });
};

export const getDriverActiveRoutePlan = (routes = [], driver, trips = [], value = new Date()) => {
  if (!driver?.id) return null;
  return [...routes]
    .map((route) => normalizeRouteRecord(route, value))
    .filter((route) => route.assignedDriver === driver.id)
    .filter((route) => route.isTodayAssignment && route.isActiveToday)
    .filter((route) => routeHasAssignedTripsForDriver(route, driver, trips))
    .sort((a, b) => {
      const aTime = Date.parse(a.assignedAt || a.createdAt || 0) || 0;
      const bTime = Date.parse(b.assignedAt || b.createdAt || 0) || 0;
      return bTime - aTime;
    })[0] || null;
};

export const getOperationalRoutes = (routes = [], value = new Date()) => {
  return (routes || [])
    .map((route) => normalizeRouteRecord(route, value))
    .filter((route) => route && ((route.isRecurring && route.appliesToday) || route.isActiveToday))
    .sort((a, b) => {
      if (a.isTodayAssignment !== b.isTodayAssignment) return a.isTodayAssignment ? -1 : 1;
      const aTime = Date.parse(a.assignedAt || a.createdAt || 0) || 0;
      const bTime = Date.parse(b.assignedAt || b.createdAt || 0) || 0;
      return bTime - aTime;
    });
};
