export const ROUTE_PLANNER_STORAGE_KEY = 'agape_routePlanner_v3';
export const ROUTE_PLANNER_ADD_STOP_EVENT = 'agape:route-planner-add-stop';
export const ROUTE_PLANNER_OPEN_EVENT = 'agape:route-planner-open';

const getAddress = (trip, type) => {
  if (type === 'dropoff') return trip?.dropoff?.address || trip?.dropoff || '';
  return trip?.pickup?.address || trip?.pickup || '';
};

const getPhone = (trip, type) => {
  if (type === 'dropoff') return trip?.dropoffPhone || trip?.dropoff?.phone || trip?.patientPhone || '';
  return trip?.pickupPhone || trip?.pickup?.phone || trip?.patientPhone || '';
};

const readRouteStops = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTE_PLANNER_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeRouteStops = (stops) => {
  try {
    localStorage.setItem(ROUTE_PLANNER_STORAGE_KEY, JSON.stringify(stops));
  } catch {
    // Local storage can be unavailable in private or locked-down browser sessions.
  }
};

export const routePlannerStopExists = (stops, stop) => stops.some((item) => (
  item?.id === stop?.id ||
  (item?.tripId && stop?.tripId && String(item.tripId) === String(stop.tripId) && item.type === stop.type)
));

export const buildRoutePlannerStop = (trip, stopType = 'pickup') => {
  const type = stopType === 'dropoff' ? 'dropoff' : 'pickup';
  const tripId = String(trip?.id || trip?.bookingId || `manual-${Date.now()}`);
  const address = String(getAddress(trip, type) || '').trim();
  const mobility = String(trip?.details?.mobility || trip?.mobility || '').toLowerCase();

  return {
    id: `${tripId}_${type === 'pickup' ? 'pu' : 'do'}`,
    tripId,
    type,
    patient: trip?.patient || trip?.patientName || 'Client',
    time: trip?.time || '',
    address,
    phone: getPhone(trip, type),
    wheelchair: Boolean(trip?.wheelchair || mobility.includes('wheelchair')),
    notes: trip?.notes || trip?.details?.generalComments || '',
    bookingId: trip?.bookingId || '',
  };
};

export const sendTripStopToRoutePlanner = (trip, stopType = 'pickup') => {
  const stop = buildRoutePlannerStop(trip, stopType);
  if (!stop.address) {
    return { ok: false, stop, exists: false, message: 'No address available for this stop.' };
  }

  const currentStops = readRouteStops();
  const exists = routePlannerStopExists(currentStops, stop);
  if (!exists) writeRouteStops([...currentStops, stop]);

  window.dispatchEvent(new CustomEvent(ROUTE_PLANNER_ADD_STOP_EVENT, { detail: { stop, exists } }));
  window.dispatchEvent(new CustomEvent(ROUTE_PLANNER_OPEN_EVENT, { detail: { stop, exists } }));

  return {
    ok: true,
    stop,
    exists,
    message: exists ? 'Stop is already in Route Planner.' : 'Stop added to Route Planner.',
  };
};
