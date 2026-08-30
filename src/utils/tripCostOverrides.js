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

const getRawUnloadedMiles = (currentTrip, nextTrip) => {
  const currentVehicle = vehicleKey(currentTrip);
  const nextVehicle = vehicleKey(nextTrip);
  const dropoffOdometer = numeric(firstValue(
    currentTrip?.dropoffOdometer,
    currentTrip?.endOdometer,
    currentTrip?.endMileage,
    currentTrip?.dropoffMileage,
    currentTrip?.odometer,
  ));
  const nextPickupOdometer = numeric(firstValue(
    nextTrip?.pickupOdometer,
    nextTrip?.startOdometer,
    nextTrip?.startMileage,
    nextTrip?.pickupMileage,
    nextTrip?.startOdo,
  ));
  if (currentVehicle && nextVehicle && currentVehicle !== nextVehicle) {
    return { miles: 0, valid: false, reason: 'Vehicle changed before the next pickup', dropoffOdometer, nextPickupOdometer };
  }
  if (dropoffOdometer === null || nextPickupOdometer === null) {
    return { miles: 0, valid: false, reason: 'Recorded dropoff or next-pickup odometer is missing', dropoffOdometer, nextPickupOdometer };
  }
  const miles = nextPickupOdometer - dropoffOdometer;
  if (miles < 0) return { miles: 0, valid: false, reason: 'Next pickup odometer is below the prior dropoff odometer', dropoffOdometer, nextPickupOdometer };
  return { miles, valid: true, reason: '', dropoffOdometer, nextPickupOdometer };
};

export const analyzeTripCostOverrides = (trips = [], options = {}) => {
  const policy = normalizeOverridePolicy(options.policy);
  const driverIndex = buildDriverIndex(options.drivers || []);
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
    eligible.push({ trip, pickupTimestamp, dropoffTimestamp, serviceDate, driver: driverKey(trip, driverIndex) || `unassigned:${trip.id}` });
  });

  const workIntervals = (trips || []).map((trip) => makeWorkInterval(trip, driverIndex)).filter(Boolean);
  const groups = new Map();
  eligible.forEach((entry) => groups.set(entry.driver, [...(groups.get(entry.driver) || []), entry]));
  groups.forEach((entries) => entries.sort((left, right) => left.pickupTimestamp - right.pickupTimestamp || String(left.trip.id).localeCompare(String(right.trip.id))));
  const excludedPairs = new Set(policy.excludedCityPairs.map((pair) => normalizeCityPair(pair, policy.sameCityNames)));
  const rows = [];

  groups.forEach((entries) => {
    entries.forEach((entry, index) => {
      const next = entries[index + 1] || null;
      const pickupCity = getTripCity(entry.trip, 'pickup');
      const dropoffCity = getTripCity(entry.trip, 'dropoff');
      const nextPickupCity = next ? getTripCity(next.trip, 'pickup') : '';
      const pickupAddress = getTripAddress(entry.trip, 'pickup');
      const dropoffAddress = getTripAddress(entry.trip, 'dropoff');
      const nextPickupAddress = next ? getTripAddress(next.trip, 'pickup') : '';
      const cityPairComplete = Boolean(next && dropoffCity && nextPickupCity);
      const pairKey = normalizeCityPair({ from: dropoffCity, to: nextPickupCity }, policy.sameCityNames);
      const pairExcluded = Boolean(cityPairComplete && excludedPairs.has(pairKey));
      const gapMinutes = next ? Math.max(0, (next.pickupTimestamp - entry.dropoffTimestamp) / 60000) : 0;
      const chronologyValid = !next || next.pickupTimestamp >= entry.dropoffTimestamp;
      const sameCity = Boolean(cityPairComplete && policy.sameCityExemption
        && canonicalCity(dropoffCity, policy.sameCityNames)
        && canonicalCity(dropoffCity, policy.sameCityNames) === canonicalCity(nextPickupCity, policy.sameCityNames));
      const mileage = next && chronologyValid ? getRawUnloadedMiles(entry.trip, next.trip) : { miles: 0, valid: false, reason: next ? 'Trips overlap in time' : 'No next trip in the selected range' };
      const crossesServiceDate = Boolean(next && entry.serviceDate !== next.serviceDate);
      const interveningWork = Boolean(next && workIntervals.some((interval) => (
        interval.driver === entry.driver
        && interval.trip.id !== entry.trip.id
        && interval.trip.id !== next.trip.id
        && interval.startMs < next.pickupTimestamp.getTime()
        && interval.endMs > entry.dropoffTimestamp.getTime()
      )));
      const unloadedQualified = Boolean(next && chronologyValid && cityPairComplete && !pairExcluded && !sameCity
        && !interveningWork && mileage.valid && mileage.miles > policy.unloadedThresholdMiles);
      const unloadedMiles = unloadedQualified ? mileage.miles : 0;
      const unloadedAmount = roundCurrency(unloadedMiles * policy.unloadedRate);
      const waitEligible = Boolean(next && chronologyValid && cityPairComplete && !pairExcluded && !interveningWork
        && !(policy.excludeOvernightGaps && crossesServiceDate)
        && gapMinutes > policy.waitingThresholdHours * 60);
      const rawBillableWaitMinutes = waitEligible ? gapMinutes - policy.waitingThresholdHours * 60 : 0;
      const billedWaitMinutes = rawBillableWaitMinutes > 0
        ? Math.ceil(rawBillableWaitMinutes / policy.waitRoundingMinutes) * policy.waitRoundingMinutes
        : 0;
      const waitHours = billedWaitMinutes / 60;
      const waitCost = roundCurrency(waitHours * policy.waitRate);
      const originalTripCost = getOriginalTripCost(entry.trip);
      const totalCost = roundCurrency(originalTripCost + unloadedAmount + waitCost);
      const isOverrideCandidate = unloadedAmount > 0 || waitCost > 0;
      const overrideType = unloadedAmount > 0 && waitCost > 0
        ? 'both'
        : unloadedAmount > 0
          ? 'mileage'
          : waitCost > 0
            ? 'waiting'
            : 'none';
      const requiresReview = Boolean(next && (
        !chronologyValid
        || !cityPairComplete
        || (!sameCity && !pairExcluded && !interveningWork && !mileage.valid)
      ));

      let unloadedReason = 'No next trip in the selected range';
      if (next) {
        if (!chronologyValid) unloadedReason = 'Trips overlap in time';
        else if (!cityPairComplete) unloadedReason = 'Dropoff or next pickup city is missing';
        else if (pairExcluded) unloadedReason = 'City pair excluded by policy';
        else if (interveningWork) unloadedReason = 'Another trip occurs before the next eligible completed trip';
        else if (sameCity) unloadedReason = 'Same-city exemption';
        else if (!mileage.valid) unloadedReason = mileage.reason;
        else if (mileage.miles <= policy.unloadedThresholdMiles) unloadedReason = `Empty segment does not exceed ${policy.unloadedThresholdMiles} mi`;
        else unloadedReason = 'Qualifying empty segment';
      }
      let waitReason = 'No next trip in the selected range';
      if (next) {
        if (!chronologyValid) waitReason = 'Trips overlap in time';
        else if (!cityPairComplete) waitReason = 'Dropoff or next pickup city is missing';
        else if (pairExcluded) waitReason = 'City pair excluded by policy';
        else if (interveningWork) waitReason = 'Another trip overlaps this gap';
        else if (policy.excludeOvernightGaps && crossesServiceDate) waitReason = 'Overnight gap excluded';
        else if (gapMinutes <= policy.waitingThresholdHours * 60) waitReason = `Gap does not exceed ${policy.waitingThresholdHours} hr`;
        else waitReason = `Billable time after threshold, rounded up to ${policy.waitRoundingMinutes} min`;
      }

      rows.push({
        trip: entry.trip,
        nextTrip: next?.trip || null,
        serviceDate: entry.serviceDate,
        pickupTimestamp: entry.pickupTimestamp,
        dropoffTimestamp: entry.dropoffTimestamp,
        nextPickupTimestamp: next?.pickupTimestamp || null,
        pickupCity,
        dropoffCity,
        nextPickupCity,
        pickupAddress,
        dropoffAddress,
        nextPickupAddress,
        driverKey: entry.driver,
        originalTripCost,
        tripType: getAmbulatoryWheelchairCode(entry.trip),
        rawUnloadedMiles: mileage.miles,
        dropoffOdometer: mileage.dropoffOdometer,
        nextPickupOdometer: mileage.nextPickupOdometer,
        unloadedMiles,
        unloadedRate: policy.unloadedRate,
        unloadedAmount,
        rawGapHours: gapMinutes / 60,
        waitHours,
        waitRate: policy.waitRate,
        waitCost,
        totalCost,
        unloadedReason,
        waitReason,
        pairExcluded,
        sameCity,
        cityPairComplete,
        interveningWork,
        isOverrideCandidate,
        overrideType,
        requiresReview,
      });
    });
  });

  rows.sort((left, right) => left.pickupTimestamp - right.pickupTimestamp || String(left.trip.id).localeCompare(String(right.trip.id)));
  return { rows, excluded, policy };
};

export const buildTripCostOverrideRows = (trips, options) => analyzeTripCostOverrides(trips, options).rows;

export const filterTripCostOverrideRows = (rows = [], options = {}) => {
  const query = normalizeText(options.search).toLowerCase();
  const unloadedFloor = finiteNonNegative(options.minimumUnloadedMiles, 0);
  const waitFloor = finiteNonNegative(options.minimumWaitHours, 0);
  const driverFilter = normalizeText(options.driverKey || 'all').toLowerCase();
  const candidateType = normalizeText(options.candidateType || 'override').toLowerCase();
  const fromFilter = normalizeCityName(options.gapFromCity === 'all' ? '' : options.gapFromCity);
  const toFilter = normalizeCityName(options.gapToCity === 'all' ? '' : options.gapToCity);
  const driverNamesById = options.driverNamesById instanceof Map ? options.driverNamesById : new Map();
  return (rows || []).filter((row) => {
    if (candidateType === 'override' && !row.isOverrideCandidate) return false;
    if (candidateType === 'mileage' && row.overrideType !== 'mileage' && row.overrideType !== 'both') return false;
    if (candidateType === 'waiting' && row.overrideType !== 'waiting' && row.overrideType !== 'both') return false;
    if (candidateType === 'both' && row.overrideType !== 'both') return false;
    if (candidateType === 'review' && !row.requiresReview) return false;
    if (driverFilter !== 'all' && row.driverKey !== driverFilter) return false;
    if (row.unloadedMiles < unloadedFloor || row.waitHours < waitFloor) return false;
    if (fromFilter && normalizeCityName(row.dropoffCity) !== fromFilter) return false;
    if (toFilter && normalizeCityName(row.nextPickupCity) !== toFilter) return false;
    if (!query) return true;
    const driverName = driverNamesById.get(row.trip.driverId);
    return [row.trip.bookingId, row.trip.id, row.trip.patient, driverName, row.pickupCity, row.dropoffCity, row.nextPickupCity]
      .some((value) => normalizeText(value).toLowerCase().includes(query));
  });
};
