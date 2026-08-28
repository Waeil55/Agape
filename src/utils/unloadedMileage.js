import { tripCalendarDateKey } from './tripDate';

export const UNLOADED_MINIMUM_MILES = 30;
export const DEFAULT_COST_OVERRIDE_RULES = Object.freeze({
  minimumUnloadedMiles: UNLOADED_MINIMUM_MILES,
  unloadedRatePerMile: 0.8,
  minimumWaitingMinutes: 30,
  waitingGraceMinutes: 30,
  waitingRatePerHour: 9,
  collectUnloadedMileage: true,
  collectWaitingTime: true,
  includeAmbulatory: true,
  includeWheelchair: true,
  excludeSameCityUnloaded: true,
  excludeSameCityWaiting: false,
  unloadedExcludedCityPairs: [],
  waitingExcludedCityPairs: [],
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

const waitingForLeg = (trip, rules) => {
  const billableHours = finiteNumber(rawValue(trip, ['overrideWaitingHours', 'billableWaitingHours', 'Wait time hours -(30 min)']));
  if (billableHours !== null) {
    return { rawMinutes: billableHours * 60 + rules.waitingGraceMinutes, billableHours: Math.max(0, billableHours), source: 'billable_hours' };
  }
  const rawMinutes = finiteNumber(rawValue(trip, ['overrideWaitingMinutes', 'waitingTimeMinutes', 'waitTimeMinutes', 'waitingMinutes', 'inOutWaitMinutes']));
  if (rawMinutes === null) return { rawMinutes: 0, billableHours: 0, source: 'missing' };
  return { rawMinutes, billableHours: Math.max(0, rawMinutes - rules.waitingGraceMinutes) / 60, source: 'raw_minutes' };
};

export const resolveCostOverrideRules = settings => ({
  ...DEFAULT_COST_OVERRIDE_RULES,
  ...(settings || {}),
  minimumUnloadedMiles: Math.max(0, finiteNumber(settings?.minimumUnloadedMiles) ?? DEFAULT_COST_OVERRIDE_RULES.minimumUnloadedMiles),
  unloadedRatePerMile: Math.max(0, finiteNumber(settings?.unloadedRatePerMile) ?? DEFAULT_COST_OVERRIDE_RULES.unloadedRatePerMile),
  minimumWaitingMinutes: Math.max(0, finiteNumber(settings?.minimumWaitingMinutes) ?? DEFAULT_COST_OVERRIDE_RULES.minimumWaitingMinutes),
  waitingGraceMinutes: Math.max(0, finiteNumber(settings?.waitingGraceMinutes) ?? DEFAULT_COST_OVERRIDE_RULES.waitingGraceMinutes),
  waitingRatePerHour: Math.max(0, finiteNumber(settings?.waitingRatePerHour) ?? DEFAULT_COST_OVERRIDE_RULES.waitingRatePerHour),
});

export const buildCostOverrideRows = (trips, configuredRules = {}) => {
  const rules = resolveCostOverrideRules(configuredRules);
  return (trips || []).flatMap(trip => {
    const persistedStatus = normalize(trip?.costOverride?.status || trip?.unloadedMileage?.status || trip?.unloadedMileageStatus);
    const persisted = ['confirmed', 'dismissed'].includes(persistedStatus);
    if (!completed(trip) && !persisted) return [];
    const bookingId = String(trip?.bookingId || trip?.id || '').trim();
    if (!bookingId && !persisted) return [];
    const { fromCity, toCity } = tripLegCities(trip);
    const unloadedMiles = finiteNumber(trip?.costOverride?.unloadedMiles) ?? finiteNumber(trip?.unloadedMileage?.miles) ?? tripDistanceMiles(trip);
    const waiting = waitingForLeg(trip, rules);
    const unloadedArea = excludedByArea(fromCity, toCity, rules.unloadedExcludedCityPairs, rules.excludeSameCityUnloaded);
    const waitingArea = excludedByArea(fromCity, toCity, rules.waitingExcludedCityPairs, rules.excludeSameCityWaiting);
    const serviceCode = trip?.wheelchair || /wheel|wc/i.test(String(trip?.type || trip?.serviceType || '')) ? 'W' : 'A';
    const serviceAllowed = serviceCode === 'W' ? rules.includeWheelchair !== false : rules.includeAmbulatory !== false;
    const unloadedEligible = serviceAllowed && rules.collectUnloadedMileage !== false && unloadedMiles >= rules.minimumUnloadedMiles && !unloadedArea.excluded;
    const waitingEligible = serviceAllowed && rules.collectWaitingTime !== false && waiting.rawMinutes >= rules.minimumWaitingMinutes && waiting.billableHours > 0 && !waitingArea.excluded;
    if (!persisted && !unloadedEligible && !waitingEligible) return [];
    const originalCost = finiteNumber(rawValue(trip, ['originalTripCost', 'providerCost', 'Provider Cost', 'Original Trip Cost'])) ?? 0;
    const unloadedAmount = unloadedEligible ? unloadedMiles * rules.unloadedRatePerMile : 0;
    const waitingAmount = waitingEligible ? waiting.billableHours * rules.waitingRatePerHour : 0;
    return [{
      id: trip.id,
      trip,
      bookingId,
      date: tripCalendarDateKey(trip.date),
      fromCity,
      toCity,
      serviceCode,
      originalCost,
      unloadedMiles,
      unloadedEligible,
      unloadedExclusionReason: unloadedArea.reason,
      waitingRawMinutes: waiting.rawMinutes,
      waitingHours: waiting.billableHours,
      waitingEligible,
      waitingExclusionReason: waitingArea.reason,
      unloadedAmount,
      waitingAmount,
      overrideAmount: unloadedAmount + waitingAmount,
      totalCost: originalCost + unloadedAmount + waitingAmount,
      status: persistedStatus || 'candidate',
      candidate: unloadedEligible || waitingEligible,
      rulesSnapshot: rules,
      reason: [
        unloadedEligible ? `${unloadedMiles.toFixed(1)} unloaded mi` : unloadedArea.reason,
        waitingEligible ? `${waiting.billableHours.toFixed(2)} billable wait hr` : waitingArea.reason,
      ].filter(Boolean).join(' · ') || 'Reviewed manually',
    }];
  });
};

export const buildUnloadedMileageRows = (trips, minimumMiles = UNLOADED_MINIMUM_MILES) =>
  buildCostOverrideRows(trips, { minimumUnloadedMiles: minimumMiles }).map(row => ({
    ...row,
    miles: row.unloadedMiles,
    oneCompletedLeg: true,
  }));
