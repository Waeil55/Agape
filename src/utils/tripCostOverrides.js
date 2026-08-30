import { hasExplicitTime, toValidDate } from './safeDate';
import { localCalendarYmd, timeToMinutes, tripCalendarDateKey } from './tripDate';

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

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '');

export const extractCityFromAddress = (address) => {
  const text = normalizeText(address);
  if (!text) return '';
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  const stateIndex = parts.findIndex((part, index) => index > 0 && /^(?:[A-Z]{2}|Indiana)(?:\s+\d{5}(?:-\d{4})?)?$/i.test(part));
  if (stateIndex > 0) return parts[stateIndex - 1];
  if (parts.length >= 3) return parts[parts.length - 2];
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

export const getTripPickupTimestamp = (trip) => parseRecordedTimestamp(firstValue(
  trip?.arrivalTime,
  trip?.pickupTimestamp,
  trip?.actualPickupTime,
  trip?.departedPickupTime,
  trip?.startedAt,
  trip?.startTime,
), trip?.date);

export const getTripDropoffTimestamp = (trip, pickupTimestamp = getTripPickupTimestamp(trip)) => {
  const value = firstValue(
    trip?.arrivalDropoffTime,
    trip?.dropoffTimestamp,
    trip?.actualDropoffTime,
    trip?.completedAt,
  );
  const parsed = parseRecordedTimestamp(value, trip?.date);
  if (!parsed || !pickupTimestamp) return parsed;
  if (parsed.getTime() >= pickupTimestamp.getTime()) return parsed;
  if (typeof value === 'string' && !/^\d{4}-\d{1,2}-\d{1,2}/.test(value.trim())) {
    const nextDay = new Date(parsed);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay;
  }
  return parsed;
};

const normalizedStatus = (trip) => normalizeText(trip?.status).toLowerCase().replace(/[_-]+/g, ' ');
const isCompleted = (trip) => normalizedStatus(trip) === 'completed';
const isNonWorkStatus = (trip) => ['cancelled', 'canceled', 'no show', 'noshow'].includes(normalizedStatus(trip));

const driverKey = (trip) => normalizeText(firstValue(
  trip?.driverId,
  trip?.driverEmail,
  trip?.completedDriverName,
  trip?.driverName,
)).toLowerCase();

const vehicleKey = (trip) => normalizeText(firstValue(
  trip?.vehicleId,
  trip?.completedVehicle,
  trip?.vehicle,
)).toLowerCase();

const numeric = (value) => {
  const number = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : null;
};

export const getOriginalTripCost = (trip) => {
  const value = numeric(firstValue(
    trip?.originalTripCost,
    trip?.originalCost,
    trip?.baseFare,
    trip?.baseCost,
    trip?.fare,
    trip?.cost,
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

export const normalizeCityPair = (value) => {
  if (value && typeof value === 'object') {
    return `${normalizeCityName(value.from)}=>${normalizeCityName(value.to)}`;
  }
  const [from = '', to = ''] = String(value ?? '').split(/\s*(?:=>|>|→|\|)\s*/);
  return `${normalizeCityName(from)}=>${normalizeCityName(to)}`;
};

const makeWorkInterval = (trip) => {
  if (isNonWorkStatus(trip)) return null;
  const start = getTripPickupTimestamp(trip);
  const end = getTripDropoffTimestamp(trip, start);
  if (!start || !end || end <= start) return null;
  return { trip, driver: driverKey(trip), startMs: start.getTime(), endMs: end.getTime() };
};

const getRawUnloadedMiles = (currentTrip, nextTrip) => {
  const currentVehicle = vehicleKey(currentTrip);
  const nextVehicle = vehicleKey(nextTrip);
  if (currentVehicle && nextVehicle && currentVehicle !== nextVehicle) {
    return { miles: 0, valid: false, reason: 'Vehicle changed before the next pickup' };
  }
  const dropoffOdometer = numeric(firstValue(currentTrip?.dropoffOdometer, currentTrip?.endOdometer));
  const nextPickupOdometer = numeric(firstValue(nextTrip?.pickupOdometer, nextTrip?.startOdometer));
  if (dropoffOdometer === null || nextPickupOdometer === null) {
    return { miles: 0, valid: false, reason: 'Recorded dropoff or next-pickup odometer is missing' };
  }
  const miles = nextPickupOdometer - dropoffOdometer;
  if (miles < 0) return { miles: 0, valid: false, reason: 'Next pickup odometer is below the prior dropoff odometer' };
  return { miles, valid: true, reason: '' };
};

export const analyzeTripCostOverrides = (trips = [], options = {}) => {
  const policy = normalizeOverridePolicy(options.policy);
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
    const serviceDate = localCalendarYmd(pickupTimestamp);
    if (!allDates && ((fromDate && serviceDate < fromDate) || (toDate && serviceDate > toDate))) return;
    eligible.push({ trip, pickupTimestamp, dropoffTimestamp, serviceDate, driver: driverKey(trip) || `unassigned:${trip.id}` });
  });

  const workIntervals = (trips || []).map(makeWorkInterval).filter(Boolean);
  const groups = new Map();
  eligible.forEach((entry) => groups.set(entry.driver, [...(groups.get(entry.driver) || []), entry]));
  groups.forEach((entries) => entries.sort((left, right) => left.pickupTimestamp - right.pickupTimestamp || String(left.trip.id).localeCompare(String(right.trip.id))));
  const excludedPairs = new Set(policy.excludedCityPairs.map(normalizeCityPair));
  const rows = [];

  groups.forEach((entries) => {
    entries.forEach((entry, index) => {
      const next = entries[index + 1] || null;
      const pickupCity = getTripCity(entry.trip, 'pickup');
      const dropoffCity = getTripCity(entry.trip, 'dropoff');
      const nextPickupCity = next ? getTripCity(next.trip, 'pickup') : '';
      const pairKey = normalizeCityPair({ from: dropoffCity, to: nextPickupCity });
      const pairExcluded = Boolean(next && excludedPairs.has(pairKey));
      const gapMinutes = next ? Math.max(0, (next.pickupTimestamp - entry.dropoffTimestamp) / 60000) : 0;
      const chronologyValid = !next || next.pickupTimestamp >= entry.dropoffTimestamp;
      const sameCity = Boolean(next && policy.sameCityExemption
        && canonicalCity(dropoffCity, policy.sameCityNames)
        && canonicalCity(dropoffCity, policy.sameCityNames) === canonicalCity(nextPickupCity, policy.sameCityNames));
      const mileage = next && chronologyValid ? getRawUnloadedMiles(entry.trip, next.trip) : { miles: 0, valid: false, reason: next ? 'Trips overlap in time' : 'No next trip in the selected range' };
      const unloadedQualified = Boolean(next && chronologyValid && !pairExcluded && !sameCity && mileage.valid
        && mileage.miles > policy.unloadedThresholdMiles);
      const unloadedMiles = unloadedQualified ? mileage.miles : 0;
      const unloadedAmount = unloadedMiles * policy.unloadedRate;
      const crossesServiceDate = Boolean(next && entry.serviceDate !== next.serviceDate);
      const interveningWork = Boolean(next && workIntervals.some((interval) => (
        interval.driver === entry.driver
        && interval.trip.id !== entry.trip.id
        && interval.trip.id !== next.trip.id
        && interval.startMs < next.pickupTimestamp.getTime()
        && interval.endMs > entry.dropoffTimestamp.getTime()
      )));
      const waitEligible = Boolean(next && chronologyValid && !pairExcluded && !interveningWork
        && !(policy.excludeOvernightGaps && crossesServiceDate)
        && gapMinutes > policy.waitingThresholdHours * 60);
      const rawBillableWaitMinutes = waitEligible ? gapMinutes - policy.waitingThresholdHours * 60 : 0;
      const billedWaitMinutes = rawBillableWaitMinutes > 0
        ? Math.ceil(rawBillableWaitMinutes / policy.waitRoundingMinutes) * policy.waitRoundingMinutes
        : 0;
      const waitHours = billedWaitMinutes / 60;
      const waitCost = waitHours * policy.waitRate;
      const originalTripCost = getOriginalTripCost(entry.trip);

      let unloadedReason = 'No next trip in the selected range';
      if (next) {
        if (!chronologyValid) unloadedReason = 'Trips overlap in time';
        else if (pairExcluded) unloadedReason = 'City pair excluded by policy';
        else if (sameCity) unloadedReason = 'Same-city exemption';
        else if (!mileage.valid) unloadedReason = mileage.reason;
        else if (mileage.miles <= policy.unloadedThresholdMiles) unloadedReason = `Empty segment does not exceed ${policy.unloadedThresholdMiles} mi`;
        else unloadedReason = 'Qualifying empty segment';
      }
      let waitReason = 'No next trip in the selected range';
      if (next) {
        if (!chronologyValid) waitReason = 'Trips overlap in time';
        else if (pairExcluded) waitReason = 'City pair excluded by policy';
        else if (interveningWork) waitReason = 'Another trip overlaps this gap';
        else if (policy.excludeOvernightGaps && crossesServiceDate) waitReason = 'Overnight gap excluded';
        else if (gapMinutes <= policy.waitingThresholdHours * 60) waitReason = `Gap does not exceed ${policy.waitingThresholdHours} hr`;
        else waitReason = `Gap less threshold, rounded up to ${policy.waitRoundingMinutes} min`;
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
        driverKey: entry.driver,
        originalTripCost,
        tripType: getAmbulatoryWheelchairCode(entry.trip),
        rawUnloadedMiles: mileage.miles,
        unloadedMiles,
        unloadedRate: policy.unloadedRate,
        unloadedAmount,
        rawGapHours: gapMinutes / 60,
        waitHours,
        waitRate: policy.waitRate,
        waitCost,
        totalCost: originalTripCost + unloadedAmount + waitCost,
        unloadedReason,
        waitReason,
        pairExcluded,
        sameCity,
        interveningWork,
      });
    });
  });

  rows.sort((left, right) => left.pickupTimestamp - right.pickupTimestamp || String(left.trip.id).localeCompare(String(right.trip.id)));
  return { rows, excluded, policy };
};

export const buildTripCostOverrideRows = (trips, options) => analyzeTripCostOverrides(trips, options).rows;
