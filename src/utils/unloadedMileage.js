import { tripCalendarDateKey } from './tripDate';

export const UNLOADED_MINIMUM_MILES = 30;

const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const completed = trip => normalize(trip?.status) === 'completed';

export const tripDistanceMiles = trip => {
  const stored = Number.parseFloat(trip?.distance);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const start = Number.parseFloat(trip?.pickupOdometer);
  const end = Number.parseFloat(trip?.dropoffOdometer);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
};

const riderKey = trip => normalize(
  trip?.patientId || trip?.clientId || trip?.memberId || trip?.patient || trip?.passenger,
);

export const buildUnloadedMileageRows = (trips, minimumMiles = UNLOADED_MINIMUM_MILES) => {
  const completedTrips = (trips || []).filter(completed);
  const legsByRiderDay = new Map();
  completedTrips.forEach(trip => {
    const key = `${tripCalendarDateKey(trip.date)}::${riderKey(trip)}`;
    legsByRiderDay.set(key, (legsByRiderDay.get(key) || 0) + 1);
  });

  return completedTrips.flatMap(trip => {
    const status = normalize(trip?.unloadedMileage?.status || trip?.unloadedMileageStatus);
    const persisted = status === 'confirmed' || status === 'dismissed';
    const miles = Number.parseFloat(trip?.unloadedMileage?.miles ?? trip?.unloadedMileageMiles)
      || tripDistanceMiles(trip);
    const key = `${tripCalendarDateKey(trip.date)}::${riderKey(trip)}`;
    const oneCompletedLeg = Boolean(riderKey(trip)) && legsByRiderDay.get(key) === 1;
    const candidate = oneCompletedLeg && miles >= minimumMiles;
    if (!persisted && !candidate) return [];
    return [{
      trip,
      miles,
      status: status || 'candidate',
      candidate,
      oneCompletedLeg,
      reason: candidate
        ? `One completed rider leg and ${miles.toFixed(1)} loaded miles`
        : 'Reviewed manually',
    }];
  });
};
