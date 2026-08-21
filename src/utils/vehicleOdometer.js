import { tripBelongsToVehicle } from './fleetMaintenance';

// A mechanical odometer above ten million miles is not a plausible reading
// for this fleet; anything beyond it is treated as a data-entry error.
export const ODOMETER_MAX_READING = 10000000;

// Above this many miles for a single leg the entry is treated as a likely
// typo (dropped/transposed digit) and requires explicit confirmation.
export const DEFAULT_MAX_LEG_MILES = 250;

const PICKUP_TIMESTAMP_FIELDS = ['arrivalTime', 'pickupArrival', 'pickupArrivalTime', 'arrivedPickupAt'];
const DROPOFF_TIMESTAMP_FIELDS = ['completedAt', 'arrivalDropoffTime', 'arrivedDropoffAt'];

/**
 * Parses a raw odometer value into a strict positive integer.
 * Accepts digits with optional thousands separators/spaces; rejects
 * anything else (letters, signs, decimals, zero, implausible magnitudes).
 */
export function normalizeOdometerReading(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[, ]/g, '').trim();
  if (!cleaned || !/^\d+$/.test(cleaned)) return null;
  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > ODOMETER_MAX_READING) return null;
  return parsed;
}

const timestampMillis = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const ms = value?.toDate?.() ? value.toDate().getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const firstTimestampMillis = (record, fields) => {
  for (const field of fields) {
    const ms = timestampMillis(record?.[field]);
    if (ms > 0) return ms;
  }
  return 0;
};

/**
 * Derives the authoritative current odometer for one vehicle from every
 * global source available: the vehicle record itself plus every trip that
 * belongs to the vehicle (any driver), including in-progress pickup
 * readings. The highest reading wins because an odometer is monotonic.
 *
 * This is intentionally device-independent: two drivers sharing a van, or
 * one driver on a new phone, both resolve the same live reading instead of
 * a stale per-device localStorage value.
 */
export function deriveVehicleOdometerState({ vehicle = {}, trips = [], drivers = [] } = {}) {
  const candidates = [];
  const vehicleReading = normalizeOdometerReading(vehicle?.odometer);
  if (vehicleReading !== null) {
    candidates.push({
      miles: vehicleReading,
      source: 'vehicle_record',
      sourceTripId: vehicle?.odometerSourceTripId || '',
      readingAt: firstTimestampMillis(vehicle, ['odometerUpdatedAt']),
    });
  }
  (Array.isArray(trips) ? trips : []).forEach((trip) => {
    if (!trip || !tripBelongsToVehicle(trip, vehicle, drivers)) return;
    const pickupReading = normalizeOdometerReading(trip.pickupOdometer);
    if (pickupReading !== null) {
      candidates.push({
        miles: pickupReading,
        source: 'trip_pickup',
        sourceTripId: trip.id,
        readingAt: firstTimestampMillis(trip, PICKUP_TIMESTAMP_FIELDS),
      });
    }
    const dropoffReading = normalizeOdometerReading(
      trip.dropoffOdometer ?? trip.endOdometer ?? trip.endMileage ?? trip.odometer,
    );
    if (dropoffReading !== null) {
      candidates.push({
        miles: dropoffReading,
        source: 'trip_dropoff',
        sourceTripId: trip.id,
        readingAt: firstTimestampMillis(trip, DROPOFF_TIMESTAMP_FIELDS),
      });
    }
  });
  if (!candidates.length) {
    return { miles: 0, source: '', sourceTripId: '', readingAt: 0 };
  }
  return candidates.reduce((best, candidate) => {
    if (candidate.miles > best.miles) return candidate;
    if (candidate.miles === best.miles && candidate.readingAt > best.readingAt) return candidate;
    return best;
  }, candidates[0]);
}

/**
 * Strict, deterministic evaluation of an odometer entry before it may be
 * recorded. Returns one of three outcomes:
 *   - status 'ok'       → accept as-is.
 *   - status 'confirm'  → plausible but unusual; require an explicit
 *                         acknowledgment from the driver before accepting.
 *   - status 'blocked'  → contradictory or malformed; never accept.
 * Warnings are precise so the driver can fix the actual mistake instead of
 * guessing. Nothing is silently coerced or skipped.
 */
export function evaluateOdometerEntry({
  raw,
  baselineMiles = 0,
  pickupOdometer = null,
  maxLegMiles = DEFAULT_MAX_LEG_MILES,
} = {}) {
  const cleaned = String(raw ?? '').replace(/[, ]/g, '').trim();
  if (!cleaned) {
    return { value: null, status: 'empty', errors: [], warnings: [], distance: null };
  }
  if (!/^\d+$/.test(cleaned)) {
    return {
      value: null,
      status: 'invalid',
      errors: ['Use digits only — no letters, symbols, or decimals.'],
      warnings: [],
      distance: null,
    };
  }
  const value = Number.parseInt(cleaned, 10);
  if (value <= 0) {
    return { value, status: 'invalid', errors: ['Enter a reading greater than zero.'], warnings: [], distance: null };
  }
  if (value > ODOMETER_MAX_READING) {
    return {
      value,
      status: 'invalid',
      errors: [`That reading is above ${ODOMETER_MAX_READING.toLocaleString()} mi — re-check the digits.`],
      warnings: [],
      distance: null,
    };
  }

  const baseline = Number(baselineMiles) || 0;
  const reference = pickupOdometer !== null && pickupOdometer !== undefined && String(pickupOdometer) !== ''
    ? normalizeOdometerReading(pickupOdometer)
    : null;
  const distance = reference !== null ? value - reference : null;
  const errors = [];
  const warnings = [];

  if (reference !== null && value < reference) {
    errors.push(
      `A final reading cannot be lower than this trip's pickup odometer (${reference.toLocaleString()} mi). Re-check the digits, or correct the pickup odometer if it was mistyped.`,
    );
  }
  if (baseline > 0 && value < baseline) {
    warnings.push(
      `This is below the last verified reading for this vehicle (${Math.round(baseline).toLocaleString()} mi). Only continue if the dashboard truly shows this number.`,
    );
  }
  const legMiles = distance !== null ? distance : (baseline > 0 ? value - baseline : null);
  if (legMiles !== null && legMiles > maxLegMiles) {
    warnings.push(
      `${Math.round(legMiles).toLocaleString()} mi for one leg is unusually high — verify you copied every digit from the dashboard.`,
    );
  }
  if (/(\d)\1{3,}/.test(cleaned)) {
    warnings.push('Four or more identical digits in a row were entered — double-check the reading.');
  }

  const status = errors.length ? 'blocked' : warnings.length ? 'confirm' : 'ok';
  return { value, status, errors, warnings, distance };
}
