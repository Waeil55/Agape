import { hasExplicitTime, toValidDate } from './safeDate';
import { buildDriverIndex, findDriverInIndex } from './driverIndex';
import { timeToMinutes, tripCalendarDateKey } from './tripDate';

export const DEFAULT_OVERRIDE_POLICY = Object.freeze({
  unloadedThresholdMiles: 20,
  unloadedRate: 0.8,
  sameCityExemption: true,
  sameCityNames: ['Indianapolis', 'Indy', 'Indianapolis IN'],
  waitingThresholdHours: 1,
  waitRate: 9,
  waitRoundingMinutes: 30,
  excludeOvernightGaps: true,
  excludedCityPairs: [],
});

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const US_STATE_NAMES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
  'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky',
  'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
  'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia',
]);
const finiteNonNegative = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

export const normalizeCityName = (value) => normalizeText(value)
  .toLowerCase()
  .replace(/\b(indiana|in)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const normalizeStringList = (value, fallback = []) => {
  const source = Array.isArray(value) ? value : String(value ?? '').split(',');
  const unique = [...new Set(source.map(normalizeText).filter(Boolean))];
  return unique.length ? unique : [...fallback];
};

export const normalizeOverridePolicy = (policy = {}) => ({
  unloadedThresholdMiles: finiteNonNegative(policy.unloadedThresholdMiles, DEFAULT_OVERRIDE_POLICY.unloadedThresholdMiles),
  unloadedRate: finiteNonNegative(policy.unloadedRate, DEFAULT_OVERRIDE_POLICY.unloadedRate),
  sameCityExemption: policy.sameCityExemption !== false,
  sameCityNames: normalizeStringList(policy.sameCityNames, DEFAULT_OVERRIDE_POLICY.sameCityNames),
  waitingThresholdHours: finiteNonNegative(policy.waitingThresholdHours, DEFAULT_OVERRIDE_POLICY.waitingThresholdHours),
  waitRate: finiteNonNegative(policy.waitRate, DEFAULT_OVERRIDE_POLICY.waitRate),
  waitRoundingMinutes: Math.max(1, finiteNonNegative(policy.waitRoundingMinutes, DEFAULT_OVERRIDE_POLICY.waitRoundingMinutes)),
  excludeOvernightGaps: policy.excludeOvernightGaps !== false,
  excludedCityPairs: normalizeStringList(policy.excludedCityPairs, []),
});

export const isOverridePolicyDocumentValid = (policy) => {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return false;
  const nonNegativeNumbers = [
    policy.unloadedThresholdMiles,
    policy.unloadedRate,
    policy.waitingThresholdHours,
    policy.waitRate,
  ];
  const stringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
  return nonNegativeNumbers.every((value) => Number.isFinite(value) && value >= 0)
    && Number.isFinite(policy.waitRoundingMinutes)
    && policy.waitRoundingMinutes >= 1
    && typeof policy.sameCityExemption === 'boolean'
    && typeof policy.excludeOvernightGaps === 'boolean'
    && stringList(policy.sameCityNames)
    && stringList(policy.excludedCityPairs);
};

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '');

export const extractCityFromAddress = (address) => {
  const text = String(address ?? '').trim();
  if (!text) return '';
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean)
    .filter((part) => !/^(?:USA|United States(?: of America)?)$/i.test(part));
  const stateIndex = parts.findIndex((part, index) => {
    if (index === 0) return false;
    const state = part.replace(/\s+\d{5}(?:-\d{4})?$/, '').trim();
    return /^[A-Z]{2}$/i.test(state) || US_STATE_NAMES.has(state.toLowerCase());
  });
  if (stateIndex > 0) return parts[stateIndex - 1];
  const postalIndex = parts.findIndex((part, index) => index > 0 && /^\d{5}(?:-\d{4})?$/.test(part));
  if (postalIndex > 0) return parts[postalIndex - 1];

  const stateNames = [...US_STATE_NAMES]
    .sort((left, right) => right.length - left.length)
    .map((state) => state.replace(/\s+/g, '\\s+'))
    .join('|');
  const stateTail = text.match(new RegExp(`^(.*?)[,\\s]+(?:[A-Z]{2}|${stateNames})(?:\\s+\\d{5}(?:-?\\d{4})?)?\\s*$`, 'i'));
  if (stateTail?.[1]) {
    const beforeState = stateTail[1].trim().replace(/[,\s]+$/, '');
    const spacedParts = beforeState.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
    if (spacedParts.length > 1) return spacedParts[spacedParts.length - 1];

    const streetSuffix = '(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|circle|cir|way|pike|highway|hwy|trail|trl|parkway|pkwy|terrace|place|pl|plaza)';
    const afterStreet = beforeState.match(new RegExp(`^.*\\b${streetSuffix}\\b[,.\\s#-]*(.+)$`, 'i'))?.[1] || '';
    const locality = afterStreet
      .replace(/^(?:apt|apartment|suite|ste|unit|room|rm|#)\s*[A-Z0-9-]+(?:\s+(?:and|&)\s+[A-Z0-9-]+)?\s+/i, '')
      .replace(/^\d+[A-Z]?(?:\s+(?:and|&)\s+\d+[A-Z]?)?\s+/i, '')
      .trim();
    if (locality && /[A-Za-z]/.test(locality)) return locality;
  }

  if (parts.length >= 2 && !/^(?:[A-Z]{2}|\d{5}(?:-\d{4})?)$/i.test(parts[parts.length - 1])) return parts[parts.length - 1];
  return '';
};

export const getTripCity = (trip, side) => {
  const pickup = side === 'pickup';
  const raw = trip?._originalRow || {};
  const explicit = pickup
    ? firstValue(trip?.pickupCity, trip?.originCity, trip?.fromCity, trip?.cityOrig, raw['City (Orig)'], raw['Pickup City'], raw['From City'])
    : firstValue(trip?.dropoffCity, trip?.destinationCity, trip?.toCity, trip?.cityDest, raw['City (Dest)'], raw['Dropoff City'], raw['To City']);
  return normalizeText(explicit || extractCityFromAddress(pickup
    ? firstValue(trip?.pickup, trip?.pickupAddress, trip?.originAddress)
    : firstValue(trip?.dropoff, trip?.dropoffAddress, trip?.destinationAddress)));
};

export const getTripAddress = (trip, side) => normalizeText(side === 'pickup'
  ? firstValue(trip?.pickup, trip?.pickupAddress, trip?.originAddress)
  : firstValue(trip?.dropoff, trip?.dropoffAddress, trip?.destinationAddress));

const parseRecordedTimestamp = (value, serviceDate) => {
  if (value === null || value === undefined || value === '') return null;
  if (hasExplicitTime(value) && typeof value === 'string' && /^\d{1,2}(?::\d{1,2})?\s*(?:AM|PM)?$/i.test(value.trim())) {
    const minutes = timeToMinutes(value);
    const dateKey = tripCalendarDateKey(serviceDate);
    if (!dateKey || minutes >= 1440) return null;
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
  }
  if (!hasExplicitTime(value)) return null;
  return toValidDate(value);
};

const tripServiceDate = (trip) => [trip?.date, trip?.serviceDate, trip?.dateKey, trip?.pickupDate]
  .map((value) => tripCalendarDateKey(value))
  .find(Boolean);

export const getTripPickupTimestamp = (trip) => parseRecordedTimestamp(firstValue(
  trip?.arrivalTime,
  trip?.pickupArrival,
  trip?.pickupArrivalTime,
  trip?.arrivedPickupTime,
  trip?.arrivedPickupAt,
  trip?.pickupTimestamp,
  trip?.actualPickupTime,
  trip?.departedPickupTime,
  trip?.startedAt,
  trip?.startTime,
), tripServiceDate(trip));

export const getTripDropoffTimestamp = (trip, pickupTimestamp = getTripPickupTimestamp(trip)) => {
  const value = firstValue(
    trip?.arrivalDropoffTime,
    trip?.dropoffArrival,
    trip?.dropoffArrivalTime,
    trip?.arrivedDropoffAt,
    trip?.dropoffTimestamp,
    trip?.actualDropoffTime,
    trip?.completedAt,
  );
  const parsed = parseRecordedTimestamp(value, tripServiceDate(trip));
  if (!parsed || !pickupTimestamp) return parsed;
  if (parsed.getTime() >= pickupTimestamp.getTime()) return parsed;
  if (typeof value === 'string' && !/^\d{4}-\d{1,2}-\d{1,2}/.test(value.trim())) {
    const nextDay = new Date(parsed);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay;
  }
  return parsed;
};

const normalizedStatus = (trip) => normalizeText(firstValue(trip?.status, trip?.lifecycleStatus)).toLowerCase().replace(/[_-]+/g, ' ');
const isCompleted = (trip) => ['completed', 'complete', 'done'].includes(normalizedStatus(trip));
const isNonWorkStatus = (trip) => ['cancelled', 'canceled', 'no show', 'noshow'].includes(normalizedStatus(trip));

const driverKey = (trip, driverIndex) => {
  const resolved = findDriverInIndex(driverIndex, {
    driverId: firstValue(trip?.driverId, trip?.completedDriverId, trip?.assignedDriverId),
    driverEmail: firstValue(trip?.driverEmail, trip?.completedDriverEmail, trip?.assignedDriverEmail),
    driverName: firstValue(trip?.completedDriverName, trip?.driverName, trip?.assignedDriverName, trip?.driver),
  });
  return normalizeText(firstValue(
    resolved?.id,
    resolved?.email,
    trip?.driverId,
    trip?.completedDriverId,
    trip?.assignedDriverId,
    trip?.driverEmail,
    trip?.completedDriverEmail,
    trip?.assignedDriverEmail,
    trip?.completedDriverName,
    trip?.driverName,
    trip?.assignedDriverName,
    trip?.driver,
  )).toLowerCase();
};

const vehicleKey = (trip) => normalizeText(firstValue(
  trip?.vehicleId,
  trip?.completedVehicle,
  trip?.vehicle,
)).toLowerCase();

const numeric = (value) => {
  const number = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : null;
};
const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const getOriginalTripCost = (trip) => {
  const raw = trip?._originalRow || {};
  const value = numeric(firstValue(
    trip?.originalTripCost,
    trip?.originalCost,
    trip?.baseFare,
    trip?.baseCost,
    trip?.fare,
    trip?.cost,
    raw['Original Trip Cost'],
    raw['Original Cost'],
    raw['Trip Cost'],
    raw['Base Fare'],
    raw.Cost,
  ));
  return value !== null && value >= 0 ? value : 0;
};

export const getAmbulatoryWheelchairCode = (trip) => /wheel|\bw\b/i.test(normalizeText(firstValue(
  trip?.type,
  trip?.serviceType,
  trip?.spaceType,
  trip?.wheelchair,
))) ? 'W' : 'A';

const canonicalCity = (city, aliasNames) => {
  const normalized = normalizeCityName(city);
  if (!normalized) return '';
  const aliases = new Set(aliasNames.map(normalizeCityName).filter(Boolean));
  return aliases.has(normalized) ? '__configured_same_city__' : normalized;
};

export const normalizeCityPair = (value, aliasNames = []) => {
  const aliases = Array.isArray(aliasNames) ? aliasNames : [];
  const [from, to] = value && typeof value === 'object'
    ? [value.from, value.to]
    : String(value ?? '').split(/\s*(?:=>|>|→|\|)\s*/);
  return `${canonicalCity(from || '', aliases)}=>${canonicalCity(to || '', aliases)}`;
};

const makeWorkInterval = (trip, driverIndex) => {
  if (isNonWorkStatus(trip)) return null;
  const start = getTripPickupTimestamp(trip);
  const end = getTripDropoffTimestamp(trip, start);
  if (!start || !end || end <= start) return null;
  const driver = driverKey(trip, driverIndex);
  if (!driver) return null;
  return { trip, driver, startMs: start.getTime(), endMs: end.getTime() };
};

const getPickupOdometer = (trip) => numeric(firstValue(
  trip?.pickupOdometer,
  trip?.startOdometer,
  trip?.startMileage,
  trip?.pickupMileage,
  trip?.startOdo,
));

const getDropoffOdometer = (trip) => numeric(firstValue(
  trip?.dropoffOdometer,
  trip?.endOdometer,
  trip?.endMileage,
  trip?.dropoffMileage,
  trip?.odometer,
));

const getRawUnloadedMiles = (previousTrip, currentTrip) => {
  const previousVehicle = vehicleKey(previousTrip);
  const currentVehicle = vehicleKey(currentTrip);
  const originOdometer = getDropoffOdometer(previousTrip);
  const destinationOdometer = getPickupOdometer(currentTrip);
  if (previousVehicle && currentVehicle && previousVehicle !== currentVehicle) {
    return { miles: 0, valid: false, reason: 'Vehicle changed before the current pickup', originOdometer, destinationOdometer };
  }
  if (originOdometer === null || destinationOdometer === null) {
    return { miles: 0, valid: false, reason: 'Recorded prior-dropoff or current-pickup odometer is missing', originOdometer, destinationOdometer };
  }
  const miles = destinationOdometer - originOdometer;
  if (miles < 0) return { miles: 0, valid: false, reason: 'Current pickup odometer is below the prior dropoff odometer', originOdometer, destinationOdometer };
  return { miles, valid: true, reason: '', originOdometer, destinationOdometer };
};

const tripPoint = (trip, side) => {
  const pickup = side === 'pickup';
  const point = firstValue(
    pickup ? trip?.pickupLocation : trip?.dropoffLocation,
    pickup ? trip?.pickupCoordinates : trip?.dropoffCoordinates,
  );
  const lat = numeric(firstValue(pickup ? trip?.pickupLat : trip?.dropoffLat, point?.lat, point?.latitude));
  const lng = numeric(firstValue(pickup ? trip?.pickupLng : trip?.dropoffLng, point?.lng, point?.longitude));
  return lat !== null && lng !== null ? `${lat},${lng}` : getTripAddress(trip, side);
};

const getDriverHome = (driver) => {
  if (!driver) return { city: '', address: '', routeQuery: '' };
  const lat = numeric(firstValue(driver?.homeLat, driver?.homeLocation?.lat, driver?.homeLocation?.latitude));
  const lng = numeric(firstValue(driver?.homeLng, driver?.homeLocation?.lng, driver?.homeLocation?.longitude));
  const homeAddress = normalizeText(firstValue(driver?.homeAddress, driver?.address));
  const address = normalizeText([homeAddress, driver?.address2, driver?.city, driver?.state, driver?.zip].filter(Boolean).join(', '));
  return {
    city: normalizeText(firstValue(driver?.city, driver?.homeCity, extractCityFromAddress(address))),
    address: address || homeAddress,
    routeQuery: lat !== null && lng !== null ? `${lat},${lng}` : (address || homeAddress),
  };
};

export const getBoundaryDistanceKey = ({ driverKey: key, serviceDate, legType, tripId, origin = '', destination = '' }) => (
  [key, serviceDate, legType, tripId, origin, destination]
    .map((value) => encodeURIComponent(normalizeText(value).toLowerCase()))
    .join('|')
);

const getBoundaryDistance = (source, key) => {
  const raw = source instanceof Map ? source.get(key) : source?.[key];
  if (Number.isFinite(Number(raw))) return { status: 'ready', miles: Number(raw), source: 'Google routed mileage' };
  if (!raw || typeof raw !== 'object') return { status: 'pending', miles: 0, source: 'Google routed mileage' };
  if (raw.status === 'ready' && Number.isFinite(Number(raw.miles))) {
    return { status: 'ready', miles: Number(raw.miles), source: raw.source || 'Google routed mileage' };
  }
  if (raw.status === 'error') return { status: 'error', miles: 0, source: raw.source || '', error: normalizeText(raw.error) };
  return { status: raw.status === 'loading' ? 'loading' : 'pending', miles: 0, source: raw.source || 'Google routed mileage' };
};

const orderDriverDayEntries = (entries) => {
  const vehicles = new Set(entries.map((entry) => vehicleKey(entry.trip)).filter(Boolean));
  const canUseOdometerOrder = vehicles.size <= 1 && entries.every((entry) => getPickupOdometer(entry.trip) !== null);
  return [...entries].sort((left, right) => {
    if (canUseOdometerOrder) {
      const odometerDifference = getPickupOdometer(left.trip) - getPickupOdometer(right.trip);
      if (odometerDifference) return odometerDifference;
    }
    return left.pickupTimestamp - right.pickupTimestamp || String(left.trip.id).localeCompare(String(right.trip.id));
  });
};

export const analyzeTripCostOverrides = (trips = [], options = {}) => {
  const policy = normalizeOverridePolicy(options.policy);
  const driverIndex = buildDriverIndex(options.drivers || []);
  const boundaryDistances = options.boundaryDistances;
  const allDates = options.allDates === true;
  const fromDate = normalizeText(options.fromDate);
  const toDate = normalizeText(options.toDate);
  const excluded = { missingTimestamps: 0, notCompleted: 0, invalidChronology: 0 };
  const eligible = [];

  (trips || []).forEach((trip) => {
    if (!isCompleted(trip)) {
      excluded.notCompleted += 1;
      return;
    }
    const pickupTimestamp = getTripPickupTimestamp(trip);
    const dropoffTimestamp = getTripDropoffTimestamp(trip, pickupTimestamp);
    if (!pickupTimestamp || !dropoffTimestamp) {
      excluded.missingTimestamps += 1;
      return;
    }
    if (dropoffTimestamp <= pickupTimestamp) {
      excluded.invalidChronology += 1;
      return;
    }
    const serviceDate = tripCalendarDateKey(pickupTimestamp);
    if (!allDates && ((fromDate && serviceDate < fromDate) || (toDate && serviceDate > toDate))) return;
    const identity = {
      driverId: firstValue(trip?.driverId, trip?.completedDriverId, trip?.assignedDriverId),
      driverEmail: firstValue(trip?.driverEmail, trip?.completedDriverEmail, trip?.assignedDriverEmail),
      driverName: firstValue(trip?.completedDriverName, trip?.driverName, trip?.assignedDriverName, trip?.driver),
    };
    eligible.push({
      trip,
      pickupTimestamp,
      dropoffTimestamp,
      serviceDate,
      driver: driverKey(trip, driverIndex) || `unassigned:${trip.id}`,
      driverRecord: findDriverInIndex(driverIndex, identity),
    });
  });

  const workIntervals = (trips || []).map((trip) => makeWorkInterval(trip, driverIndex)).filter(Boolean);
  const groups = new Map();
  eligible.forEach((entry) => {
    const groupKey = `${entry.driver}|${entry.serviceDate}`;
    groups.set(groupKey, [...(groups.get(groupKey) || []), entry]);
  });
  const excludedPairs = new Set(policy.excludedCityPairs.map((pair) => normalizeCityPair(pair, policy.sameCityNames)));
  const rows = [];
  const boundaryRequests = [];

  const buildRow = ({ entry, previous = null, isHomeReturn = false, home, groupTripIds, groupIndex }) => {
    const tripPickupCity = getTripCity(entry.trip, 'pickup');
    const tripDropoffCity = getTripCity(entry.trip, 'dropoff');
    const tripPickupAddress = getTripAddress(entry.trip, 'pickup');
    const tripDropoffAddress = getTripAddress(entry.trip, 'dropoff');
    const originCity = isHomeReturn ? tripDropoffCity : (previous ? getTripCity(previous.trip, 'dropoff') : home.city);
    const destinationCity = isHomeReturn ? home.city : tripPickupCity;
    const originAddress = isHomeReturn ? tripDropoffAddress : (previous ? getTripAddress(previous.trip, 'dropoff') : home.address);
    const destinationAddress = isHomeReturn ? home.address : tripPickupAddress;
    const legType = isHomeReturn ? 'home_return' : 'before_pickup';
    const legLabel = isHomeReturn ? 'Return home' : (previous ? 'Before pickup' : 'Home to first pickup');
    const cityPairComplete = Boolean(originCity && destinationCity);
    const pairKey = normalizeCityPair({ from: originCity, to: destinationCity }, policy.sameCityNames);
    const pairExcluded = Boolean(cityPairComplete && excludedPairs.has(pairKey));
    const sameCity = Boolean(cityPairComplete && policy.sameCityExemption
      && canonicalCity(originCity, policy.sameCityNames)
      && canonicalCity(originCity, policy.sameCityNames) === canonicalCity(destinationCity, policy.sameCityNames));
    const isBoundary = !previous || isHomeReturn;
    const routeOrigin = isHomeReturn ? tripPoint(entry.trip, 'dropoff') : home.routeQuery;
    const routeDestination = isHomeReturn ? home.routeQuery : tripPoint(entry.trip, 'pickup');
    const boundaryKey = isBoundary ? getBoundaryDistanceKey({
      driverKey: entry.driver,
      serviceDate: entry.serviceDate,
      legType,
      tripId: entry.trip.id || entry.trip.bookingId,
      origin: routeOrigin,
      destination: routeDestination,
    }) : '';
    const boundaryDistance = isBoundary ? getBoundaryDistance(boundaryDistances, boundaryKey) : null;
    const canRequestBoundary = Boolean(isBoundary && cityPairComplete && !pairExcluded && !sameCity && routeOrigin && routeDestination);
    if (canRequestBoundary) boundaryRequests.push({
      id: boundaryKey,
      origin: routeOrigin,
      destination: routeDestination,
      legType,
      tripId: entry.trip.id || entry.trip.bookingId,
    });

    const mileage = isBoundary ? {
      miles: boundaryDistance?.miles || 0,
      valid: boundaryDistance?.status === 'ready',
      reason: boundaryDistance?.status === 'error'
        ? (boundaryDistance.error || 'Home route mileage could not be verified')
        : 'Home route mileage is being calculated',
      originOdometer: null,
      destinationOdometer: null,
    } : getRawUnloadedMiles(previous.trip, entry.trip);
    const gapMinutesRaw = previous && !isHomeReturn
      ? (entry.pickupTimestamp - previous.dropoffTimestamp) / 60000
      : 0;
    const chronologyValid = !previous || isHomeReturn || gapMinutesRaw >= 0;
    const gapMinutes = chronologyValid ? Math.max(0, gapMinutesRaw) : 0;
    const interveningWork = Boolean(previous && !isHomeReturn && chronologyValid && workIntervals.some((interval) => (
      interval.driver === entry.driver
      && !groupTripIds.has(interval.trip.id)
      && interval.startMs < entry.pickupTimestamp.getTime()
      && interval.endMs > previous.dropoffTimestamp.getTime()
    )));
    const unloadedQualified = Boolean(cityPairComplete && !pairExcluded && !sameCity
      && !interveningWork && mileage.valid && mileage.miles > policy.unloadedThresholdMiles);
    const unloadedMiles = unloadedQualified ? mileage.miles : 0;
    const unloadedAmount = roundCurrency(unloadedMiles * policy.unloadedRate);
    const waitEligible = Boolean(previous && !isHomeReturn && chronologyValid && cityPairComplete && !pairExcluded
      && !interveningWork && gapMinutes > policy.waitingThresholdHours * 60);
    const rawBillableWaitMinutes = waitEligible ? gapMinutes - policy.waitingThresholdHours * 60 : 0;
    const billedWaitMinutes = rawBillableWaitMinutes > 0
      ? Math.ceil(rawBillableWaitMinutes / policy.waitRoundingMinutes) * policy.waitRoundingMinutes
      : 0;
    const waitHours = billedWaitMinutes / 60;
    const waitCost = roundCurrency(waitHours * policy.waitRate);
    const isOverrideCandidate = unloadedAmount > 0 || waitCost > 0;
    const overrideType = unloadedAmount > 0 && waitCost > 0
      ? 'both'
      : unloadedAmount > 0
        ? 'mileage'
        : waitCost > 0
          ? 'waiting'
          : 'none';
    const boundaryFailed = isBoundary && canRequestBoundary && boundaryDistance?.status === 'error';
    const requiresReview = Boolean(
      !chronologyValid
      || !cityPairComplete
      || boundaryFailed
      || (!isBoundary && !sameCity && !pairExcluded && !interveningWork && !mileage.valid)
      || (isBoundary && cityPairComplete && !pairExcluded && !sameCity && (!routeOrigin || !routeDestination))
    );

    let unloadedReason = mileage.reason || 'Mileage evidence is unavailable';
    if (!cityPairComplete) unloadedReason = 'Unloaded-leg origin or destination city is missing';
    else if (pairExcluded) unloadedReason = 'City pair excluded by policy';
    else if (interveningWork) unloadedReason = 'Another worked trip occurs inside this unloaded leg';
    else if (sameCity) unloadedReason = 'Same-city exemption';
    else if (!mileage.valid) unloadedReason = mileage.reason;
    else if (mileage.miles <= policy.unloadedThresholdMiles) unloadedReason = `Empty segment does not exceed ${policy.unloadedThresholdMiles} mi`;
    else unloadedReason = isBoundary ? 'Qualifying Google-routed home segment' : 'Qualifying odometer-verified empty segment';

    let waitReason = isBoundary ? 'Waiting does not apply to home boundary legs' : 'No qualifying waiting time';
    if (previous && !isHomeReturn) {
      if (!chronologyValid) waitReason = 'Recorded trip times overlap; waiting is blocked';
      else if (!cityPairComplete) waitReason = 'Unloaded-leg origin or destination city is missing';
      else if (pairExcluded) waitReason = 'City pair excluded by policy';
      else if (interveningWork) waitReason = 'Another worked trip overlaps this gap';
      else if (gapMinutes <= policy.waitingThresholdHours * 60) waitReason = `Gap does not exceed ${policy.waitingThresholdHours} hr`;
      else waitReason = `Billable time after threshold, rounded up to ${policy.waitRoundingMinutes} min`;
    }

    return {
      rowId: `${entry.trip.id || entry.trip.bookingId}:${legType}:${groupIndex}`,
      legType,
      legLabel,
      trip: entry.trip,
      serviceDate: entry.serviceDate,
      pickupTimestamp: entry.pickupTimestamp,
      dropoffTimestamp: entry.dropoffTimestamp,
      originTimestamp: previous && !isHomeReturn ? previous.dropoffTimestamp : (isHomeReturn ? entry.dropoffTimestamp : null),
      destinationTimestamp: previous && !isHomeReturn ? entry.pickupTimestamp : (isHomeReturn ? null : entry.pickupTimestamp),
      tripPickupCity,
      tripDropoffCity,
      originCity,
      destinationCity,
      tripPickupAddress,
      tripDropoffAddress,
      originAddress,
      destinationAddress,
      driverKey: entry.driver,
      originalTripCost: 0,
      tripType: getAmbulatoryWheelchairCode(entry.trip),
      rawUnloadedMiles: mileage.miles,
      originOdometer: mileage.originOdometer,
      destinationOdometer: mileage.destinationOdometer,
      mileageSource: isBoundary ? (boundaryDistance?.source || 'Google routed mileage') : 'Recorded odometer chain',
      boundaryDistanceStatus: isBoundary ? boundaryDistance?.status : 'not_applicable',
      unloadedMiles,
      unloadedRate: policy.unloadedRate,
      unloadedAmount,
      rawGapHours: gapMinutes / 60,
      waitHours,
      waitRate: policy.waitRate,
      waitCost,
      totalCost: 0,
      unloadedReason,
      waitReason,
      pairExcluded,
      sameCity,
      cityPairComplete,
      interveningWork,
      isOverrideCandidate,
      overrideType,
      requiresReview,
      pairKey,
      sortAt: isHomeReturn ? entry.dropoffTimestamp.getTime() + 1 : entry.pickupTimestamp.getTime(),
    };
  };

  groups.forEach((groupEntries) => {
    const entries = orderDriverDayEntries(groupEntries);
    const groupTripIds = new Set(entries.map((entry) => entry.trip.id));
    const home = getDriverHome(entries[0]?.driverRecord);
    entries.forEach((entry, index) => {
      rows.push(buildRow({ entry, previous: entries[index - 1] || null, home, groupTripIds, groupIndex: index }));
    });
    const last = entries[entries.length - 1];
    if (last) rows.push(buildRow({ entry: last, isHomeReturn: true, home, groupTripIds, groupIndex: entries.length }));
  });

  const rowsByTrip = new Map();
  rows.forEach((row) => {
    const key = String(row.trip.id || row.trip.bookingId);
    rowsByTrip.set(key, [...(rowsByTrip.get(key) || []), row]);
  });
  rowsByTrip.forEach((tripRows) => {
    const costOwner = tripRows.find((row) => row.isOverrideCandidate) || tripRows[0];
    tripRows.forEach((row) => {
      row.originalTripCost = row === costOwner ? getOriginalTripCost(row.trip) : 0;
      row.totalCost = roundCurrency(row.originalTripCost + row.unloadedAmount + row.waitCost);
    });
  });

  rows.sort((left, right) => left.sortAt - right.sortAt || left.rowId.localeCompare(right.rowId));
  return { rows, excluded, policy, boundaryRequests };
};

export const buildTripCostOverrideRows = (trips, options) => analyzeTripCostOverrides(trips, options).rows;

export const filterTripCostOverrideRows = (rows = [], options = {}) => {
  const query = normalizeText(options.search).toLowerCase();
  const unloadedFloor = finiteNonNegative(options.minimumUnloadedMiles, 0);
  const waitFloor = finiteNonNegative(options.minimumWaitHours, 0);
  const driverFilter = normalizeText(options.driverKey || 'all').toLowerCase();
  const candidateType = normalizeText(options.candidateType || 'override').toLowerCase();
  const legType = normalizeText(options.legType || 'all').toLowerCase();
  const fromFilter = normalizeCityName(options.gapFromCity === 'all' ? '' : options.gapFromCity);
  const toFilter = normalizeCityName(options.gapToCity === 'all' ? '' : options.gapToCity);
  const driverNamesById = options.driverNamesById instanceof Map ? options.driverNamesById : new Map();
  return (rows || []).filter((row) => {
    if (candidateType === 'override' && !row.isOverrideCandidate) return false;
    if (candidateType === 'mileage' && row.overrideType !== 'mileage' && row.overrideType !== 'both') return false;
    if (candidateType === 'waiting' && row.overrideType !== 'waiting' && row.overrideType !== 'both') return false;
    if (candidateType === 'both' && row.overrideType !== 'both') return false;
    if (candidateType === 'review' && !row.requiresReview) return false;
    if (legType !== 'all' && row.legType !== legType) return false;
    if (driverFilter !== 'all' && row.driverKey !== driverFilter) return false;
    if (row.unloadedMiles < unloadedFloor || row.waitHours < waitFloor) return false;
    if (fromFilter && normalizeCityName(row.originCity) !== fromFilter) return false;
    if (toFilter && normalizeCityName(row.destinationCity) !== toFilter) return false;
    if (!query) return true;
    const driverName = driverNamesById.get(row.trip.driverId);
    return [
      row.trip.bookingId,
      row.trip.id,
      row.trip.patient,
      driverName,
      row.legLabel,
      row.originCity,
      row.destinationCity,
      row.tripPickupCity,
      row.tripDropoffCity,
    ]
      .some((value) => normalizeText(value).toLowerCase().includes(query));
  });
};
