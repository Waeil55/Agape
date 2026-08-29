import { tripCalendarDateKey } from './tripDate';

export const COST_OVERRIDE_RULES_VERSION = 2;
export const UNLOADED_MINIMUM_MILES = 20;
export const DEFAULT_COST_OVERRIDE_RULES = Object.freeze({
  rulesVersion: COST_OVERRIDE_RULES_VERSION,
  minimumUnloadedMiles: UNLOADED_MINIMUM_MILES,
  unloadedRatePerMile: 0.8,
  minimumWaitingMinutes: 60,
  waitingGraceMinutes: 60,
  waitingRatePerHour: 9,
  requireNoInterveningTripsForWaiting: true,
  collectUnloadedMileage: true,
  collectWaitingTime: true,
  includeAmbulatory: true,
  includeWheelchair: true,
  excludeSameCityUnloaded: false,
  excludeSameCityWaiting: false,
  unloadedExcludedCityPairs: ['Indianapolis > Indianapolis'],
  waitingExcludedCityPairs: ['Indianapolis > Indianapolis'],
});

const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const completed = trip => normalize(trip?.status) === 'completed';
const finiteNumber = value => {
  const parsed = Number.parseFloat(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const rawValue = (trip, keys) => {
  for (const key of keys) {
    const direct = trip?.[key];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    const original = trip?._originalRow?.[key];
    if (original !== undefined && original !== null && original !== '') return original;
  }
  return null;
};

const dateKeyToLocalDate = dateKey => {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const costOverrideWeekStart = value => {
  const key = tripCalendarDateKey(value);
  const date = dateKeyToLocalDate(key);
  if (!date) return '';
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return tripCalendarDateKey(date) || '';
};

export const costOverrideWeekEnd = weekStart => {
  const date = dateKeyToLocalDate(costOverrideWeekStart(weekStart));
  if (!date) return '';
  date.setDate(date.getDate() + 6);
  return tripCalendarDateKey(date) || '';
};

export const buildCostOverrideWeekOptions = trips => {
  const counts = new Map();
  (trips || []).forEach((trip) => {
    if (!completed(trip)) return;
    const start = costOverrideWeekStart(trip?.date);
    if (start) counts.set(start, (counts.get(start) || 0) + 1);
  });
  return [...counts.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([start, tripCount]) => ({ start, end: costOverrideWeekEnd(start), tripCount }));
};

export const normalizeCity = value => normalize(value)
  .replace(/\b(indiana|in)\b\.?/g, '')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cityFromAddress = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  const commaParts = text.split(',').map(part => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) return commaParts[commaParts.length - 2].replace(/\d+/g, '').trim();
  const stateMatch = text.match(/\b([A-Za-z][A-Za-z .'-]+)\s*,?\s+IN\s+\d{5}(?:-\d{4})?\b/i);
  return stateMatch?.[1]?.trim() || '';
};

export const tripLegCities = trip => ({
  fromCity: String(rawValue(trip, ['fromCity', 'pickupCity', 'City (Orig)', 'Origin City']) || cityFromAddress(trip?.pickup) || '').trim(),
  toCity: String(rawValue(trip, ['toCity', 'dropoffCity', 'City (Dest)', 'Destination City']) || cityFromAddress(trip?.dropoff) || '').trim(),
});

const parsePair = pair => {
  if (typeof pair === 'string') {
    const [from, to] = pair.split(/\s*(?:>|→|->|\|)\s*/);
    return { from: normalizeCity(from), to: normalizeCity(to) };
  }
  return { from: normalizeCity(pair?.from), to: normalizeCity(pair?.to) };
};

const excludedByArea = (fromCity, toCity, pairs, excludeSameCity) => {
  const from = normalizeCity(fromCity);
  const to = normalizeCity(toCity);
  if (!from || !to) return { excluded: false, reason: '' };
  if (excludeSameCity && from === to) return { excluded: true, reason: `Same-city ${fromCity} to ${toCity}` };
  const match = (pairs || []).map(parsePair).find(pair => pair.from === from && pair.to === to);
  return match ? { excluded: true, reason: `Excluded route ${fromCity} to ${toCity}` } : { excluded: false, reason: '' };
};

export const tripDistanceMiles = trip => {
  const explicit = finiteNumber(rawValue(trip, ['unloadedMileageMiles', 'Unloaded Miles']));
  if (explicit !== null && explicit >= 0) return explicit;
  const stored = finiteNumber(trip?.distance);
  if (stored !== null && stored > 0) return stored;
  const start = finiteNumber(trip?.pickupOdometer);
  const end = finiteNumber(trip?.dropoffOdometer);
  return start !== null && end !== null && end > start ? end - start : 0;
};

const timestampMs = (value, dateKey) => {
  if (!value) return null;
  const direct = new Date(value).getTime();
  if (Number.isFinite(direct)) return direct;
  const match = String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match || !dateKey) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const period = String(match[3] || '').toUpperCase();
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const date = dateKeyToLocalDate(dateKey);
  if (!date || hours > 23 || minutes > 59) return null;
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
};

const tripStartMs = trip => {
  const dateKey = tripCalendarDateKey(trip?.date);
  for (const value of [trip?.arrivalTime, trip?.arrivedPickupAt, trip?.departedPickupTime, trip?.startedAt, trip?.startTime, trip?.time]) {
    const milliseconds = timestampMs(value, dateKey);
    if (milliseconds !== null) return milliseconds;
  }
  return null;
};

const tripEndMs = trip => {
  const dateKey = tripCalendarDateKey(trip?.date);
  for (const value of [trip?.arrivalDropoffTime, trip?.arrivedDropoffAt, trip?.completedAt, trip?.completedTime, trip?.dropoffTime]) {
    const milliseconds = timestampMs(value, dateKey);
    if (milliseconds !== null) return milliseconds;
  }
  return null;
};

const driverKey = trip => normalize(trip?.driverId || trip?.driverEmail || trip?.driverName);
const riderKey = trip => normalize(trip?.patientId || trip?.clientId || trip?.memberId || trip?.patient || trip?.clientName);

const derivedWaitingWindow = (trip, trips) => {
  const date = tripCalendarDateKey(trip?.date);
  const start = timestampMs(trip?.costOverride?.waitingWindowStart || trip?.waitingWindowStart, date) ?? tripEndMs(trip);
  if (start === null) return null;
  const explicitEnd = timestampMs(trip?.costOverride?.waitingWindowEnd || trip?.waitingWindowEnd, date);
  let returnTrip = null;
  let end = explicitEnd;
  if (end === null) {
    const pairId = String(trip?.inOutPairTripId || '');
    const pairBooking = String(trip?.inOutPairBookingId || '');
    const rider = riderKey(trip);
    returnTrip = (trips || [])
      .filter(candidate => candidate && candidate.id !== trip.id && completed(candidate) && tripCalendarDateKey(candidate.date) === date)
      .filter(candidate => (pairId && String(candidate.id) === pairId)
        || (pairBooking && String(candidate.bookingId || candidate.id) === pairBooking)
        || (rider && riderKey(candidate) === rider))
      .map(candidate => ({ candidate, start: tripStartMs(candidate) }))
      .filter(item => item.start !== null && item.start > start)
      .sort((a, b) => a.start - b.start)[0]?.candidate || null;
    end = returnTrip ? tripStartMs(returnTrip) : null;
  }
  if (end === null || end <= start) return null;
  const driver = driverKey(trip);
  const sameDriverTrips = (trips || []).filter(candidate => {
    if (!candidate || candidate.id === trip.id || candidate.id === returnTrip?.id || !completed(candidate)) return false;
    return tripCalendarDateKey(candidate.date) === date && driver && driverKey(candidate) === driver;
  });
  const interveningTrips = sameDriverTrips.filter(candidate => {
    const candidateStart = tripStartMs(candidate);
    const candidateEnd = tripEndMs(candidate);
    return candidateStart !== null && candidateEnd !== null && candidateStart < end && candidateEnd > start;
  });
  const unverifiableTripIds = sameDriverTrips
    .filter(candidate => tripStartMs(candidate) === null || tripEndMs(candidate) === null)
    .map(candidate => candidate.id);
  return { start, end, returnTrip, driverVerified: Boolean(driver), interveningTrips, unverifiableTripIds, rawMinutes: (end - start) / 60000 };
};

const waitingForLeg = (trip, trips, rules) => {
  const window = derivedWaitingWindow(trip, trips);
  if (window) {
    const hasUnverifiableEvidence = !window.driverVerified || window.unverifiableTripIds.length > 0;
    const noInterveningTrips = window.interveningTrips.length === 0 && !hasUnverifiableEvidence;
    return {
      rawMinutes: window.rawMinutes,
      billableHours: Math.max(0, window.rawMinutes - rules.waitingGraceMinutes) / 60,
      source: 'verified_between_trips',
      noInterveningTrips,
      verificationStatus: noInterveningTrips ? 'verified' : (window.interveningTrips.length ? 'blocked' : 'missing'),
      windowStart: new Date(window.start).toISOString(),
      windowEnd: new Date(window.end).toISOString(),
      returnTripId: window.returnTrip?.id || null,
      interveningTripIds: window.interveningTrips.map(candidate => candidate.id),
      unverifiableTripIds: window.unverifiableTripIds,
    };
  }
  const billableHours = finiteNumber(rawValue(trip, ['overrideWaitingHours', 'billableWaitingHours', 'Wait time hours -(30 min)']));
  if (billableHours !== null) {
    const noInterveningTrips = trip?.costOverride?.waitingNoInterveningTrips === true || trip?.waitingNoInterveningTrips === true;
    return {
      rawMinutes: billableHours * 60 + rules.waitingGraceMinutes,
      billableHours: Math.max(0, billableHours),
      source: 'reported_billable_hours',
      noInterveningTrips,
      verificationStatus: noInterveningTrips ? 'reviewed' : 'missing',
      interveningTripIds: [], unverifiableTripIds: [],
    };
  }
  const rawMinutes = finiteNumber(rawValue(trip, ['overrideWaitingMinutes', 'waitingTimeMinutes', 'waitTimeMinutes', 'waitingMinutes', 'inOutWaitMinutes']));
  if (rawMinutes === null) return { rawMinutes: 0, billableHours: 0, source: 'missing', noInterveningTrips: false, verificationStatus: 'missing', interveningTripIds: [], unverifiableTripIds: [] };
  const noInterveningTrips = trip?.costOverride?.waitingNoInterveningTrips === true || trip?.waitingNoInterveningTrips === true;
  return { rawMinutes, billableHours: Math.max(0, rawMinutes - rules.waitingGraceMinutes) / 60, source: 'reported_raw_minutes', noInterveningTrips, verificationStatus: noInterveningTrips ? 'reviewed' : 'missing', interveningTripIds: [], unverifiableTripIds: [] };
};

const explicitUnloadedMiles = trip => (
  finiteNumber(trip?.costOverride?.unloadedMiles)
  ?? finiteNumber(trip?.unloadedMileage?.miles)
  ?? finiteNumber(rawValue(trip, ['unloadedMileageMiles', 'Unloaded Miles']))
);

export const resolveCostOverrideRules = settings => {
  const currentSettings = Number(settings?.rulesVersion) === COST_OVERRIDE_RULES_VERSION ? settings : {};
  return ({
  ...DEFAULT_COST_OVERRIDE_RULES,
  ...currentSettings,
  rulesVersion: COST_OVERRIDE_RULES_VERSION,
  minimumUnloadedMiles: Math.max(0, finiteNumber(currentSettings?.minimumUnloadedMiles) ?? DEFAULT_COST_OVERRIDE_RULES.minimumUnloadedMiles),
  unloadedRatePerMile: Math.max(0, finiteNumber(currentSettings?.unloadedRatePerMile) ?? DEFAULT_COST_OVERRIDE_RULES.unloadedRatePerMile),
  minimumWaitingMinutes: Math.max(0, finiteNumber(currentSettings?.minimumWaitingMinutes) ?? DEFAULT_COST_OVERRIDE_RULES.minimumWaitingMinutes),
  waitingGraceMinutes: Math.max(0, finiteNumber(currentSettings?.waitingGraceMinutes) ?? DEFAULT_COST_OVERRIDE_RULES.waitingGraceMinutes),
  waitingRatePerHour: Math.max(0, finiteNumber(currentSettings?.waitingRatePerHour) ?? DEFAULT_COST_OVERRIDE_RULES.waitingRatePerHour),
  });
};

export const buildCostOverrideRows = (trips, configuredRules = {}, options = {}) => {
  const rules = resolveCostOverrideRules(configuredRules);
  const includeCoverage = options.includeCoverage === true;
  return (trips || []).flatMap(trip => {
    const persistedStatus = normalize(trip?.costOverride?.status || trip?.unloadedMileage?.status || trip?.unloadedMileageStatus);
    const persisted = ['confirmed', 'dismissed'].includes(persistedStatus);
    if (!completed(trip) && !persisted) return [];
    const bookingId = String(trip?.bookingId || trip?.id || '').trim();
    if (!bookingId && !persisted) return [];
    const { fromCity, toCity } = tripLegCities(trip);
    // Loaded trip distance and pickup-to-dropoff odometer distance are not
    // unloaded mileage. Treating either as a fallback silently creates false
    // billing candidates. Unloaded mileage must come from an explicit report
    // field or a reviewed cost-override value.
    const explicitMiles = explicitUnloadedMiles(trip);
    const hasUnloadedData = explicitMiles !== null;
    const unloadedMiles = hasUnloadedData ? Math.max(0, explicitMiles) : null;
    const waiting = waitingForLeg(trip, trips, rules);
    const hasWaitingData = waiting.source !== 'missing';
    const routeVerified = Boolean(normalizeCity(fromCity) && normalizeCity(toCity));
    const unloadedArea = excludedByArea(fromCity, toCity, rules.unloadedExcludedCityPairs, rules.excludeSameCityUnloaded);
    const waitingArea = excludedByArea(fromCity, toCity, rules.waitingExcludedCityPairs, rules.excludeSameCityWaiting);
    const serviceCode = trip?.wheelchair || /wheel|wc/i.test(String(trip?.type || trip?.serviceType || '')) ? 'W' : 'A';
    const serviceAllowed = serviceCode === 'W' ? rules.includeWheelchair !== false : rules.includeAmbulatory !== false;
    const unloadedEligible = serviceAllowed && rules.collectUnloadedMileage !== false && routeVerified && hasUnloadedData
      && unloadedMiles > rules.minimumUnloadedMiles && !unloadedArea.excluded;
    const waitingEvidenceAllowed = rules.requireNoInterveningTripsForWaiting === false || waiting.noInterveningTrips;
    const waitingCouldQualify = serviceAllowed && rules.collectWaitingTime !== false && routeVerified
      && waiting.rawMinutes > rules.minimumWaitingMinutes && waiting.billableHours > 0 && !waitingArea.excluded;
    const waitingEligible = serviceAllowed && rules.collectWaitingTime !== false && routeVerified
      && waiting.rawMinutes > rules.minimumWaitingMinutes && waiting.billableHours > 0
      && waitingEvidenceAllowed && !waitingArea.excluded;
    if (!persisted && !unloadedEligible && !waitingEligible && !includeCoverage) return [];
    const originalCost = finiteNumber(rawValue(trip, ['originalTripCost', 'providerCost', 'Provider Cost', 'Original Trip Cost']));
    const unloadedAmount = unloadedEligible ? unloadedMiles * rules.unloadedRatePerMile : 0;
    const waitingAmount = waitingEligible ? waiting.billableHours * rules.waitingRatePerHour : 0;
    const waitingNeedsVerification = waitingCouldQualify && rules.requireNoInterveningTripsForWaiting !== false
      && !waiting.noInterveningTrips && waiting.verificationStatus === 'missing';
    const calculatedStatus = !routeVerified || (!hasUnloadedData && !hasWaitingData) || waitingNeedsVerification
      ? 'missing_data'
      : (unloadedEligible || waitingEligible ? 'candidate' : 'not_eligible');
    return [{
      id: trip.id,
      trip,
      bookingId,
      date: tripCalendarDateKey(trip.date),
      fromCity,
      toCity,
      routeVerified,
      serviceCode,
      patientName: String(trip?.patient || trip?.clientName || trip?.memberName || '').trim(),
      driverId: trip?.driverId || '',
      driverName: String(trip?.driverName || '').trim(),
      pickupAddress: String(trip?.pickup || trip?.pickupAddress || '').trim(),
      dropoffAddress: String(trip?.dropoff || trip?.dropoffAddress || '').trim(),
      scheduledPickupTime: trip?.time || trip?.scheduledTime || '',
      pickupArrivalTime: trip?.arrivalTime || trip?.arrivedPickupAt || '',
      pickupDepartureTime: trip?.departedPickupTime || trip?.departedPickupAt || '',
      dropoffArrivalTime: trip?.arrivalDropoffTime || trip?.arrivedDropoffAt || trip?.completedAt || '',
      originalCost,
      unloadedMiles,
      hasUnloadedData,
      unloadedEligible,
      unloadedExclusionReason: unloadedArea.reason,
      waitingRawMinutes: waiting.rawMinutes,
      waitingHours: waiting.billableHours,
      hasWaitingData,
      waitingSource: waiting.source,
      waitingVerificationStatus: waiting.verificationStatus,
      waitingNeedsVerification,
      waitingNoInterveningTrips: waiting.noInterveningTrips,
      waitingWindowStart: waiting.windowStart || '',
      waitingWindowEnd: waiting.windowEnd || '',
      waitingReturnTripId: waiting.returnTripId || '',
      interveningTripIds: waiting.interveningTripIds || [],
      waitingUnverifiableTripIds: waiting.unverifiableTripIds || [],
      waitingEligible,
      waitingExclusionReason: waitingArea.reason,
      unloadedAmount,
      waitingAmount,
      overrideAmount: unloadedAmount + waitingAmount,
      totalCost: originalCost === null ? null : originalCost + unloadedAmount + waitingAmount,
      status: persistedStatus || calculatedStatus,
      candidate: unloadedEligible || waitingEligible,
      rulesSnapshot: rules,
      reason: [
        !routeVerified ? 'Route cities missing' : '',
        unloadedEligible ? `${unloadedMiles.toFixed(1)} unloaded mi (> ${rules.minimumUnloadedMiles})` : unloadedArea.reason,
        waitingEligible ? `${waiting.billableHours.toFixed(2)} billable wait hr; no intervening trip` : waitingArea.reason,
        hasWaitingData && rules.requireNoInterveningTripsForWaiting !== false && !waiting.noInterveningTrips
          ? (waiting.interveningTripIds?.length ? `Waiting blocked by ${waiting.interveningTripIds.length} intervening trip(s)`
            : waiting.unverifiableTripIds?.length ? `Waiting cannot be verified because ${waiting.unverifiableTripIds.length} same-driver trip(s) lack complete timestamps`
              : 'Waiting needs no-intervening-trip verification') : '',
      ].filter(Boolean).join(' · ') || (!hasUnloadedData && !hasWaitingData ? 'Override data missing from the source report' : 'No override under the current rules'),
    }];
  });
};

export const buildUnloadedMileageRows = (trips, minimumMiles = UNLOADED_MINIMUM_MILES) =>
  buildCostOverrideRows(trips, { rulesVersion: COST_OVERRIDE_RULES_VERSION, minimumUnloadedMiles: minimumMiles }).map(row => ({
    ...row,
    miles: row.unloadedMiles,
    oneCompletedLeg: true,
  }));
