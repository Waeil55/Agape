import { describe, expect, it } from 'vitest';
import {
  buildCostOverrideRows,
  buildCostOverrideWeekOptions,
  buildUnloadedMileageRows,
  COST_OVERRIDE_RULES_VERSION,
  tripDistanceMiles,
} from './unloadedMileage';

const trip = (id, overrides = {}) => ({
  id, bookingId: id, patient: 'Rider One', driverId: 'driver-1', date: '2026-08-17', status: 'Completed',
  pickup: 'Rushville, IN 46173', dropoff: 'Carmel, IN 46032', pickupOdometer: 100, dropoffOdometer: 135,
  ...overrides,
});

const rules = overrides => ({ rulesVersion: COST_OVERRIDE_RULES_VERSION, ...overrides });

describe('cost override eligibility', () => {
  it('evaluates every booking leg independently and never uses loaded distance as unloaded mileage', () => {
    const rows = buildCostOverrideRows([
      trip('leg-1', { unloadedMileageMiles: 59 }),
      trip('leg-2', { unloadedMileageMiles: 34 }),
      trip('loaded-only', { distance: 62.5, pickupOdometer: 100, dropoffOdometer: 162.5 }),
    ], {}, { includeCoverage: true });
    expect(rows.map(row => row.bookingId)).toEqual(['leg-1', 'leg-2', 'loaded-only']);
    expect(rows.map(row => row.unloadedMiles)).toEqual([59, 34, null]);
    expect(rows[2]).toMatchObject({ status: 'missing_data', overrideAmount: 0 });
  });

  it('requires unloaded mileage to be strictly more than 20 miles', () => {
    expect(buildCostOverrideRows([trip('exactly-20', { unloadedMileageMiles: 20 })])).toHaveLength(0);
    const [over] = buildCostOverrideRows([trip('over-20', { unloadedMileageMiles: 20.1 })]);
    expect(over.unloadedEligible).toBe(true);
    expect(over.unloadedAmount).toBeCloseTo(16.08, 5);
  });

  it.each([
    ['Indianapolis', 'Indianapolis', false],
    ['Indianapolis', 'Carmel', true],
    ['Carmel', 'Indianapolis', true],
    ['Carmel', 'Carmel', true],
    ['Rushville', 'Carmel', true],
  ])('applies the default city rule for %s to %s', (fromCity, toCity, eligible) => {
    const [row] = buildCostOverrideRows([trip(`${fromCity}-${toCity}`, {
      pickup: `${fromCity}, IN`, dropoff: `${toCity}, IN`, unloadedMileageMiles: 30,
    })], {}, { includeCoverage: true });
    expect(row.unloadedEligible).toBe(eligible);
  });

  it('requires waiting to exceed 60 raw minutes and deducts the first hour', () => {
    const [exactly] = buildCostOverrideRows([trip('exactly-60', {
      waitingTimeMinutes: 60, waitingNoInterveningTrips: true,
    })], {}, { includeCoverage: true });
    const [over] = buildCostOverrideRows([trip('over-60', {
      waitingTimeMinutes: 90, waitingNoInterveningTrips: true,
    })]);
    expect(exactly.waitingEligible).toBe(false);
    expect(over).toMatchObject({ waitingEligible: true, waitingHours: 0.5, waitingAmount: 4.5 });
  });

  it('automatically verifies a waiting window and blocks it when the driver worked another trip', () => {
    const outbound = trip('outbound', { patient: 'Waiting Rider', arrivalDropoffTime: '9:00 AM', unloadedMileageMiles: 0 });
    const returnTrip = trip('return', {
      patient: 'Waiting Rider', arrivalTime: '11:00 AM', arrivalDropoffTime: '12:00 PM', unloadedMileageMiles: 0,
    });
    const [verified] = buildCostOverrideRows([outbound, returnTrip], {}, { includeCoverage: true });
    expect(verified).toMatchObject({
      waitingEligible: true, waitingVerificationStatus: 'verified', waitingRawMinutes: 120, waitingHours: 1, waitingAmount: 9,
    });

    const otherTrip = trip('other-work', {
      patient: 'Another Rider', arrivalTime: '9:30 AM', arrivalDropoffTime: '10:15 AM', unloadedMileageMiles: 0,
    });
    const [blocked] = buildCostOverrideRows([outbound, otherTrip, returnTrip], {}, { includeCoverage: true });
    expect(blocked).toMatchObject({ waitingEligible: false, waitingVerificationStatus: 'blocked' });
    expect(blocked.interveningTripIds).toEqual(['other-work']);
  });

  it('does not auto-verify waiting when driver identity or same-driver timestamps are incomplete', () => {
    const outbound = trip('outbound', { patient: 'Waiting Rider', arrivalDropoffTime: '9:00 AM', unloadedMileageMiles: 0 });
    const returnTrip = trip('return', { patient: 'Waiting Rider', arrivalTime: '11:00 AM', unloadedMileageMiles: 0 });
    const incomplete = trip('incomplete-work', { patient: 'Another Rider', arrivalTime: '', arrivalDropoffTime: '', unloadedMileageMiles: 0 });
    const [uncertain] = buildCostOverrideRows([outbound, incomplete, returnTrip], {}, { includeCoverage: true });
    expect(uncertain).toMatchObject({ waitingEligible: false, waitingVerificationStatus: 'missing' });
    expect(uncertain.waitingUnverifiableTripIds).toEqual(['incomplete-work']);

    const [missingDriver] = buildCostOverrideRows([
      { ...outbound, driverId: '' },
      { ...returnTrip, driverId: '' },
    ], {}, { includeCoverage: true });
    expect(missingDriver).toMatchObject({ waitingEligible: false, waitingVerificationStatus: 'missing' });
  });

  it('fails closed when reported waiting hours have no no-intervening-trip evidence', () => {
    const [missing] = buildCostOverrideRows([trip('reported-wait', {
      overrideWaitingHours: 2, unloadedMileageMiles: 0,
    })], {}, { includeCoverage: true });
    expect(missing).toMatchObject({ waitingEligible: false, waitingNeedsVerification: true, status: 'missing_data' });

    const [reviewed] = buildCostOverrideRows([trip('reviewed-wait', {
      overrideWaitingHours: 2, waitingNoInterveningTrips: true, unloadedMileageMiles: 0,
    })]);
    expect(reviewed).toMatchObject({ waitingEligible: true, waitingVerificationStatus: 'reviewed', waitingAmount: 18 });
  });

  it('excludes both override types for Indianapolis to Indianapolis', () => {
    const [row] = buildCostOverrideRows([trip('indy-local', {
      pickup: 'Indianapolis, IN 46219', dropoff: 'Indianapolis, IN 46203', unloadedMileageMiles: 40,
      waitingTimeMinutes: 120, waitingNoInterveningTrips: true,
    })], {}, { includeCoverage: true });
    expect(row).toMatchObject({ unloadedEligible: false, waitingEligible: false, overrideAmount: 0 });
  });

  it('uses versioned settings for thresholds, route exclusions, evidence, and collection switches', () => {
    const candidate = trip('configured', { unloadedMileageMiles: 25, waitingTimeMinutes: 90 });
    const [row] = buildCostOverrideRows([candidate], rules({
      minimumUnloadedMiles: 30,
      minimumWaitingMinutes: 30,
      waitingGraceMinutes: 30,
      requireNoInterveningTripsForWaiting: false,
      waitingExcludedCityPairs: ['Rushville > Carmel'],
    }), { includeCoverage: true });
    expect(row).toMatchObject({ unloadedEligible: false, waitingEligible: false });

    const [disabled] = buildCostOverrideRows(
      [trip('disabled', { unloadedMileageMiles: 50 })],
      rules({ collectUnloadedMileage: false }),
      { includeCoverage: true },
    );
    expect(disabled.unloadedEligible).toBe(false);
  });

  it('builds complete Monday-through-Sunday history choices', () => {
    expect(buildCostOverrideWeekOptions([
      trip('a', { date: '2026-08-17' }), trip('b', { date: '2026-08-22' }), trip('c', { date: '2026-08-24' }),
    ])).toEqual([
      { start: '2026-08-24', end: '2026-08-30', tripCount: 1 },
      { start: '2026-08-17', end: '2026-08-23', tripCount: 2 },
    ]);
  });

  it('keeps legacy callers available without weakening the new threshold', () => {
    expect(buildUnloadedMileageRows([trip('1', { unloadedMileageMiles: 35 })])[0]).toMatchObject({ miles: 35, status: 'candidate' });
    expect(tripDistanceMiles(trip('2'))).toBe(35);
  });
});
