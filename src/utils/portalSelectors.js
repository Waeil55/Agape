import { localCalendarYmd, timeToMinutes, tripCalendarDateKey } from './tripDate';

const TERMINAL_MANIFEST_STATUSES = new Set(['Completed', 'Cancelled', 'No Show', 'Rerouted']);
const normalizeIdentity = (value) => String(value || '').trim().toLowerCase();
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function buildDriverServiceDateBuckets(trips = [], todayKey = localCalendarYmd()) {
  const today = new Date(`${todayKey}T12:00:00`);
  if (Number.isNaN(today.getTime()) || tripCalendarDateKey(todayKey) !== todayKey) {
    return { todayTrips: [], tomorrowTrips: [], tomorrowKey: undefined };
  }
  today.setDate(today.getDate() + 1);
  const tomorrowKey = localCalendarYmd(today);
  return {
    todayTrips: trips.filter((trip) => tripCalendarDateKey(trip?.date) === todayKey),
    tomorrowTrips: trips.filter((trip) => tripCalendarDateKey(trip?.date) === tomorrowKey),
    tomorrowKey,
  };
}

export function scopeOperationsTripsByDate(trips = [], selectedDate) {
  if (!selectedDate || tripCalendarDateKey(selectedDate) !== selectedDate) {
    return { scopedTrips: [], excludedInvalidDateTrips: trips.length };
  }
  let excludedInvalidDateTrips = 0;
  const scopedTrips = trips.filter((trip) => {
    const dateKey = tripCalendarDateKey(trip?.date);
    if (!dateKey) {
      excludedInvalidDateTrips += 1;
      return false;
    }
    return dateKey === selectedDate;
  });
  return { scopedTrips, excludedInvalidDateTrips };
}

export function buildDriverLoads(activeTrips = [], drivers = [], nowMs = Date.now()) {
  const tripsByIdentity = new Map();
  const add = (identity, trip) => {
    if (!identity) return;
    if (!tripsByIdentity.has(identity)) tripsByIdentity.set(identity, new Set());
    tripsByIdentity.get(identity).add(trip);
  };
  activeTrips.forEach((trip) => {
    add(normalizeIdentity(trip.driverId), trip);
    add(normalizeIdentity(trip.driverEmail), trip);
  });
  const expectedLoad = Math.max(1, Math.ceil(activeTrips.length / Math.max(drivers.length, 1)));
  return drivers.map((driver) => {
    const assignedSet = new Set();
    [normalizeIdentity(driver.id), normalizeIdentity(driver.email)].filter(Boolean).forEach((identity) => {
      tripsByIdentity.get(identity)?.forEach((trip) => assignedSet.add(trip));
    });
    const assigned = [...assignedSet];
    const clock = new Date(nowMs);
    const nextTrip = assigned
      .map((trip) => {
        const minutes = timeToMinutes(trip.time);
        if (!Number.isFinite(minutes) || minutes >= 1440) return { trip, offset: null };
        const scheduled = new Date(clock);
        scheduled.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
        return { trip, offset: Math.round((scheduled.getTime() - nowMs) / 60000) };
      })
      .filter((entry) => entry.offset !== null)
      .sort((a, b) => a.offset - b.offset)[0]?.trip;
    const utilization = clamp(Math.round((assigned.length / expectedLoad) * 70) + (driver.status !== 'Available' ? 15 : 0), 0, 100);
    return {
      id: driver.id,
      name: driver.name || driver.email || 'Driver',
      status: driver.status || 'Unknown',
      vehicle: driver.vehicle || 'No vehicle',
      assignedCount: assigned.length,
      utilization,
      tone: assigned.length > expectedLoad + 1 ? 'rose' : driver.status === 'Available' ? 'emerald' : 'blue',
      nextTrip,
    };
  }).sort((a, b) => b.assignedCount - a.assignedCount || b.utilization - a.utilization).slice(0, 5);
}

export function buildHotspots(activeTrips = [], lateTrips = []) {
  const lateIds = new Set(lateTrips.map((trip) => trip?.id).filter(Boolean));
  const zones = new Map();
  activeTrips.forEach((trip) => {
    const raw = String(trip.pickup || trip.dropoff || '').trim();
    const zone = raw.split(',').map((part) => part.trim()).filter(Boolean)[0]?.replace(/\b\d{1,6}\b/g, '').trim().slice(0, 28) || 'Unknown';
    const current = zones.get(zone) || { zone, count: 0, late: 0, unassigned: 0 };
    current.count += 1;
    if (lateIds.has(trip.id)) current.late += 1;
    if (trip.status === 'Unassigned') current.unassigned += 1;
    zones.set(zone, current);
  });
  return [...zones.values()]
    .sort((a, b) => (b.late * 3 + b.unassigned * 2 + b.count) - (a.late * 3 + a.unassigned * 2 + a.count))
    .slice(0, 3);
}

export function getManifestUrgency(trip, now = new Date()) {
  if (TERMINAL_MANIFEST_STATUSES.has(trip?.status)) return 'normal';
  const serviceDate = tripCalendarDateKey(trip?.date);
  if (!serviceDate || (trip?.serviceDate && tripCalendarDateKey(trip.serviceDate) !== serviceDate)) return 'normal';
  const timeValue = timeToMinutes(trip?.time);
  if (!Number.isFinite(timeValue) || timeValue >= 1440) return 'normal';
  const scheduled = new Date(`${serviceDate}T00:00:00`);
  scheduled.setHours(Math.floor(timeValue / 60), timeValue % 60, 0, 0);
  if (now > scheduled) return 'late';
  const diff = scheduled - now;
  if (diff > 0 && diff < 30 * 60 * 1000) return 'soon';
  return 'normal';
}

export function tripMatchesRoutePlannerServiceDate(trip, selectedDate) {
  const selectedDateKey = tripCalendarDateKey(selectedDate);
  if (!trip || !selectedDateKey || selectedDateKey !== selectedDate) return false;
  const raw = trip.date ?? trip.scheduledDate ?? trip.scheduleDate ?? trip.tripDate ?? trip.serviceDate ?? trip.appointmentDate;
  return tripCalendarDateKey(raw) === selectedDateKey;
}

export function tripMatchesPayrollServiceDate(trip, selectedDate) {
  if (!selectedDate) return true;
  if (!trip) return false;
  const hasDeclaredServiceDate = trip.date !== undefined && trip.date !== null && trip.date !== '';
  const sourceDate = hasDeclaredServiceDate
    ? trip.date
    : (trip.arrivalTime ?? trip.startedAt ?? trip.completedAt);
  return tripCalendarDateKey(sourceDate) === selectedDate;
}

export function eventMatchesPayrollServiceDate(event, selectedDate) {
  if (!selectedDate) return true;
  return tripCalendarDateKey(event?.timestamp ?? event?.at ?? event?.time) === selectedDate;
}

export function getReviewBatchScope({ allDates, dateStr, rowCount, canUpdate }) {
  const dateKey = !allDates && tripCalendarDateKey(dateStr) === dateStr ? dateStr : '';
  const count = Number.isInteger(rowCount) && rowCount > 0 ? rowCount : Math.max(0, Number(rowCount) || 0);
  let reason = '';
  if (allDates) reason = 'Select one service date before changing review status.';
  else if (!dateKey) reason = 'Choose a valid service date.';
  else if (count === 0) reason = 'There are no rows in this service-date scope.';
  else if (!canUpdate) reason = 'Review updates are unavailable in this session.';
  return { allowed: !reason, dateKey, rowCount: count, reason };
}
