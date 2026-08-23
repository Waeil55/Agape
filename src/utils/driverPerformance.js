const DEFAULT_ROUTE_SIGNAL_LIMIT = 3;
const DEFAULT_CONFLICT_LIMIT = 5;

export const DRIVER_ETA_TRIP_LIMIT = 3;
export const DRIVER_ETA_REFRESH_MS = 30_000;

const cleanText = (value) => String(value || '').trim();
const normalizedAddress = (value) => cleanText(value).toLowerCase();

export const createRouteStopId = () => `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function normalizeRouteStopOrder(items = [], driverPosition = null) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const originIndex = safeItems.findIndex((stop) => stop.type === 'origin' || stop.id === 'origin');
  const originSource = originIndex >= 0 ? safeItems[originIndex] : null;
  const hasPosition = driverPosition?.lat !== null && driverPosition?.lat !== undefined
    && driverPosition?.lng !== null && driverPosition?.lng !== undefined
    && Number.isFinite(Number(driverPosition.lat)) && Number.isFinite(Number(driverPosition.lng));
  const positionLabel = hasPosition ? `${driverPosition.lat},${driverPosition.lng}` : '';
  const origin = {
    id: 'origin',
    type: 'origin',
    letter: null,
    label: originSource?.label || positionLabel || '',
    clientName: '',
    stopTime: '',
    stopType: 'ORIGIN',
    tripId: null,
    bookingId: '',
    source: originSource?.source || (positionLabel ? 'gps' : 'manual'),
  };

  const routeStops = safeItems.filter((stop, index) => (
    index !== originIndex && stop.id !== 'origin' && stop.type !== 'origin'
  ));
  const firstPickupIndex = new Map();
  routeStops.forEach((stop, index) => {
    if (stop.tripId && stop.stopType === 'PU' && !firstPickupIndex.has(stop.tripId)) {
      firstPickupIndex.set(stop.tripId, index);
    }
  });

  const orderedStops = [];
  const movedPickupIndexes = new Set();
  routeStops.forEach((stop, index) => {
    if (movedPickupIndexes.has(index)) return;
    if (stop.tripId && stop.stopType === 'DO') {
      const pickupIndex = firstPickupIndex.get(stop.tripId);
      if (Number.isInteger(pickupIndex) && pickupIndex > index && !movedPickupIndexes.has(pickupIndex)) {
        orderedStops.push(routeStops[pickupIndex]);
        movedPickupIndexes.add(pickupIndex);
      }
    }
    orderedStops.push(stop);
  });

  const normalizedStops = orderedStops.map((stop, index) => ({
    ...stop,
    id: stop.id || createRouteStopId(),
    type: 'stop',
    letter: String.fromCharCode(65 + index),
    label: stop.label || '',
    clientName: stop.clientName || '',
    stopTime: stop.stopTime || '',
    stopType: stop.stopType || '',
    tripId: stop.tripId || null,
    bookingId: stop.bookingId || '',
    serviceType: stop.serviceType || '',
    source: stop.source || 'manual',
  }));

  return [origin, ...normalizedStops];
}

export function selectDriverEtaTrips(activeTrips, limit = DRIVER_ETA_TRIP_LIMIT) {
  if (!Array.isArray(activeTrips) || limit <= 0) return [];
  return activeTrips.filter((trip) => trip?.id && trip?.pickup).slice(0, limit);
}

export function getDriverEtaTargetSignature(trips) {
  return (Array.isArray(trips) ? trips : []).map((trip) => [
    trip.id,
    cleanText(trip.pickup),
    Number.isFinite(Number(trip.pickupLat)) ? Number(trip.pickupLat) : '',
    Number.isFinite(Number(trip.pickupLng)) ? Number(trip.pickupLng) : '',
  ].join(':')).join('|');
}

export function mergeDriverEtaMeasurements(previous = {}, measurements = []) {
  let next = previous;
  for (const measurement of measurements) {
    const tripId = measurement?.tripId;
    const minutes = Number(measurement?.minutes);
    if (!tripId || !Number.isFinite(minutes) || minutes < 0) continue;
    if (previous[tripId] === minutes) continue;
    if (next === previous) next = { ...previous };
    next[tripId] = minutes;
  }
  return next;
}

export function deriveDriverRouteSignals(activeTrips, {
  rideShareLimit = DEFAULT_ROUTE_SIGNAL_LIMIT,
  conflictLimit = DEFAULT_CONFLICT_LIMIT,
  timeToMinutes,
} = {}) {
  const trips = Array.isArray(activeTrips) ? activeTrips : [];
  const aiRideShare = [];
  const conflicts = [];
  const sharedRideKeys = new Set();
  const conflictKeys = new Set();

  for (let leftIndex = 0; leftIndex < trips.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < trips.length; rightIndex += 1) {
      const left = trips[leftIndex];
      const right = trips[rightIndex];
      const leftPatient = cleanText(left?.patient);
      const rightPatient = cleanText(right?.patient);
      if (leftPatient && rightPatient && leftPatient !== rightPatient && aiRideShare.length < rideShareLimit) {
        const pairKey = [leftPatient, rightPatient].sort().join('|');
        const leftPickup = normalizedAddress(left?.pickup);
        const rightPickup = normalizedAddress(right?.pickup);
        const leftDropoff = normalizedAddress(left?.dropoff);
        const rightDropoff = normalizedAddress(right?.dropoff);
        const sameArea = (
          (leftPickup && rightPickup && leftPickup.includes(rightPickup.slice(0, 10)))
          || (leftPickup && rightPickup && rightPickup.includes(leftPickup.slice(0, 10)))
          || (leftDropoff && rightDropoff && leftDropoff.includes(rightDropoff.slice(0, 10)))
        );
        if (sameArea && !sharedRideKeys.has(pairKey)) {
          sharedRideKeys.add(pairKey);
          aiRideShare.push({ tripA: left, tripB: right });
        }
      }

      if (typeof timeToMinutes === 'function' && conflicts.length < conflictLimit) {
        const leftTime = left?.time;
        const rightTime = right?.time;
        if (leftTime && rightTime && leftTime !== 'Will Call' && rightTime !== 'Will Call') {
          const leftMinutes = timeToMinutes(leftTime);
          const rightMinutes = timeToMinutes(rightTime);
          if (leftMinutes !== 1440 && rightMinutes !== 1440 && Math.abs(leftMinutes - rightMinutes) < 30) {
            const conflictKey = [leftPatient, rightPatient].sort().join('|');
            if (!conflictKeys.has(conflictKey)) {
              conflictKeys.add(conflictKey);
              conflicts.push({ aName: left?.patient, bName: right?.patient, timeA: leftTime, timeB: rightTime });
            }
          }
        }
      }
    }
  }

  return { aiRideShare, conflicts };
}
