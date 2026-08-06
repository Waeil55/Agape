import { tripCalendarDateKey } from './tripDate';
import { safeDateMillis } from './safeDate';

const MAX_TRIP_MILES = 1000;
const MAX_TRIP_MINUTES = 18 * 60;

export const finiteTripNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!normalized) return null;
  const parsed = Number(normalized[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const firstTimestamp = (trip, fields) => {
  for (const field of fields) {
    const timestamp = safeDateMillis(trip?.[field], NaN);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return NaN;
};

const tripDistanceMiles = (trip) => {
  const pickupOdometer = finiteTripNumber(trip?.pickupOdometer);
  const dropoffOdometer = finiteTripNumber(trip?.dropoffOdometer);
  if (pickupOdometer !== null && dropoffOdometer !== null) {
    const odometerDistance = dropoffOdometer - pickupOdometer;
    if (odometerDistance >= 0 && odometerDistance <= MAX_TRIP_MILES) return odometerDistance;
  }
  const reportedDistance = finiteTripNumber(trip?.distance);
  return reportedDistance !== null && reportedDistance >= 0 && reportedDistance <= MAX_TRIP_MILES
    ? reportedDistance
    : 0;
};

export const buildDriverDailyAnalytics = (trips = [], serviceDate) => {
  const completed = trips.filter((trip) => (
    tripCalendarDateKey(trip?.date) === serviceDate
    && String(trip?.status || '').trim().toLowerCase() === 'completed'
  ));

  let totalDistance = 0;
  let totalDriveTime = 0;
  let firstArrival = Infinity;
  let lastDropoff = -Infinity;

  completed.forEach((trip) => {
    totalDistance += tripDistanceMiles(trip);
    const pickupArrival = firstTimestamp(trip, ['arrivalTime', 'pickupArrival', 'pickupArrivalTime', 'arrivedPickupAt']);
    const dropoffArrival = firstTimestamp(trip, ['arrivalDropoffTime', 'arrivedDropoffAt']);
    if (!Number.isFinite(pickupArrival) || !Number.isFinite(dropoffArrival) || dropoffArrival < pickupArrival) return;
    const durationMinutes = (dropoffArrival - pickupArrival) / 60000;
    if (durationMinutes > MAX_TRIP_MINUTES) return;
    totalDriveTime += durationMinutes;
    firstArrival = Math.min(firstArrival, pickupArrival);
    lastDropoff = Math.max(lastDropoff, dropoffArrival);
  });

  const serviceWindowMinutes = Number.isFinite(firstArrival) && Number.isFinite(lastDropoff)
    ? Math.max(totalDriveTime, (lastDropoff - firstArrival) / 60000)
    : totalDriveTime;
  const idleMinutes = Math.max(0, serviceWindowMinutes - totalDriveTime);
  const drivingPercent = serviceWindowMinutes > 0 ? Math.round((totalDriveTime / serviceWindowMinutes) * 100) : 0;

  return {
    tripsCompleted: completed.length,
    totalDistance: Math.round(totalDistance * 10) / 10,
    totalDriveTime: Math.round(totalDriveTime),
    idleMinutes: Math.round(idleMinutes),
    drivingPercent,
    idlePercent: serviceWindowMinutes > 0 ? 100 - drivingPercent : 0,
    efficiency: totalDriveTime > 0 ? Math.round((completed.length / (totalDriveTime / 60)) * 10) / 10 : 0,
  };
};

