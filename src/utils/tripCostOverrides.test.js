import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERRIDE_POLICY,
  analyzeTripCostOverrides,
  extractCityFromAddress,
  filterTripCostOverrideRows,
  isOverridePolicyDocumentValid,
  normalizeOverridePolicy,
} from './tripCostOverrides';

const trip = (id, overrides = {}) => ({
  id,
  bookingId: id,
  patient: `Rider ${id}`,
  driverId: 'driver-1',
  completedVehicle: 'Van 1',
  date: '2026-08-01',
  status: 'Completed',
  arrivalTime: `2026-08-01T0${id}:00:00-04:00`,
  arrivalDropoffTime: `2026-08-01T0${id}:30:00-04:00`,
  pickupOdometer: 100 + Number(id) * 10,
  dropoffOdometer: 105 + Number(id) * 10,
  pickupCity: 'Fishers',
  dropoffCity: 'Carmel',
  originalTripCost: 25,
  ...overrides,
});

describe('trip cost override calculation', () => {
  it('uses the current dropoff to next pickup odometer and records the override on the preceding trip', () => {
    const first = trip('1', { dropoffOdometer: 120, dropoffCity: 'Carmel' });
    const second = trip('2', { pickupOdometer: 145, pickupCity: 'Fishers' });
    const rows = analyzeTripCostOverrides([second, first], { allDates: true }).rows;
    expect(rows.map((row) => row.trip.id)).toEqual(['1', '2']);
    expect(rows[0]).toMatchObject({ rawUnloadedMiles: 25, unloadedMiles: 25, unloadedAmount: 20 });
    expect(rows[1]).toMatchObject({ unloadedMiles: 0, waitHours: 0 });
  });

  it('uses a strict unloaded threshold and excludes same-city aliases', () => {
    const base = trip('1', { dropoffOdometer: 120, dropoffCity: 'Indianapolis' });
    const exactThreshold = trip('2', { pickupOdometer: 140, pickupCity: 'Fishers' });
    expect(analyzeTripCostOverrides([base, exactThreshold], { allDates: true }).rows[0].unloadedMiles).toBe(0);

    const sameCity = trip('2', { pickupOdometer: 180, pickupCity: 'Indy' });
    const row = analyzeTripCostOverrides([base, sameCity], { allDates: true }).rows[0];
    expect(row).toMatchObject({ sameCity: true, unloadedMiles: 0, unloadedAmount: 0 });
  });

  it('bills only wait beyond the threshold and rounds up to the configured increment', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00' });
    const second = trip('2', {
      arrivalTime: '2026-08-01T09:01:00-04:00',
      arrivalDropoffTime: '2026-08-01T09:30:00-04:00',
    });
    const row = analyzeTripCostOverrides([first, second], { allDates: true }).rows[0];
    expect(row.rawGapHours).toBeCloseTo(61 / 60);
    expect(row.waitHours).toBe(0.5);
    expect(row.waitCost).toBe(4.5);
  });

  it('uses every configurable threshold, rate, and rounding value', () => {
    const first = trip('1', {
      arrivalDropoffTime: '2026-08-01T08:00:00-04:00',
      dropoffOdometer: 120,
    });
    const second = trip('2', {
      arrivalTime: '2026-08-01T10:01:00-04:00',
      arrivalDropoffTime: '2026-08-01T10:30:00-04:00',
      pickupOdometer: 160,
    });
    const row = analyzeTripCostOverrides([first, second], {
      allDates: true,
      policy: {
        unloadedThresholdMiles: 30,
        unloadedRate: 1.25,
        waitingThresholdHours: 2,
        waitRate: 12,
        waitRoundingMinutes: 15,
      },
    }).rows[0];
    expect(row).toMatchObject({ unloadedMiles: 40, unloadedAmount: 50, waitHours: 0.25, waitCost: 3 });
  });

  it('does not bill waiting when another trip overlaps the gap', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00', dropoffOdometer: 120 });
    const second = trip('2', {
      arrivalTime: '2026-08-01T11:00:00-04:00',
      arrivalDropoffTime: '2026-08-01T11:30:00-04:00',
      pickupOdometer: 180,
    });
    const overlapping = trip('x', {
      status: 'Assigned',
      arrivalTime: '2026-08-01T09:00:00-04:00',
      arrivalDropoffTime: '2026-08-01T10:00:00-04:00',
    });
    const row = analyzeTripCostOverrides([first, second, overlapping], { allDates: true }).rows[0];
    expect(row.interveningWork).toBe(true);
    expect(row.unloadedMiles).toBe(0);
    expect(row.unloadedReason).toContain('Another trip occurs');
    expect(row.waitCost).toBe(0);
  });

  it('matches the corrected workbook math for cross-city mileage and waiting supplements', () => {
    const first = trip('1', {
      arrivalTime: '2026-08-01T07:00:00-04:00',
      arrivalDropoffTime: '2026-08-01T08:00:00-04:00',
      dropoffOdometer: 120,
      dropoffCity: 'Rushville',
      originalTripCost: 65.28,
    });
    const next = trip('2', {
      arrivalTime: '2026-08-01T12:30:00-04:00',
      arrivalDropoffTime: '2026-08-01T13:00:00-04:00',
      pickupOdometer: 179,
      pickupCity: 'Carmel',
    });
    const row = analyzeTripCostOverrides([next, first], { allDates: true }).rows[0];
    expect(row).toMatchObject({ unloadedMiles: 59, unloadedAmount: 47.2, waitHours: 3.5, waitCost: 31.5 });
    expect(row.totalCost).toBeCloseTo(143.98);
  });

  it('keeps same-city unloaded mileage at zero while still billing qualifying wait', () => {
    const first = trip('1', {
      arrivalDropoffTime: '2026-08-01T08:00:00-04:00',
      dropoffOdometer: 120,
      dropoffCity: 'Indianapolis',
      originalTripCost: 31.33,
    });
    const next = trip('2', {
      arrivalTime: '2026-08-01T10:00:00-04:00',
      arrivalDropoffTime: '2026-08-01T10:30:00-04:00',
      pickupOdometer: 180,
      pickupCity: 'Indy',
    });
    const row = analyzeTripCostOverrides([first, next], { allDates: true }).rows[0];
    expect(row).toMatchObject({ sameCity: true, unloadedMiles: 0, waitHours: 1, waitCost: 9 });
    expect(row.totalCost).toBeCloseTo(40.33);
  });

  it('does not bill an exact one-hour wait and can disable same-city and overnight exemptions', () => {
    const first = trip('1', {
      arrivalDropoffTime: '2026-08-01T23:00:00-04:00',
      dropoffOdometer: 120,
      dropoffCity: 'Indianapolis',
    });
    const exactHour = trip('2', {
      date: '2026-08-02',
      arrivalTime: '2026-08-02T00:00:00-04:00',
      arrivalDropoffTime: '2026-08-02T00:30:00-04:00',
      pickupOdometer: 170,
      pickupCity: 'Indianapolis',
    });
    const exactRow = analyzeTripCostOverrides([first, exactHour], {
      allDates: true,
      policy: { sameCityExemption: false, excludeOvernightGaps: false },
    }).rows[0];
    expect(exactRow).toMatchObject({ unloadedMiles: 50, waitHours: 0, waitCost: 0 });

    const later = { ...exactHour, arrivalTime: '2026-08-02T02:00:00-04:00', arrivalDropoffTime: '2026-08-02T02:30:00-04:00' };
    const overnightRow = analyzeTripCostOverrides([first, later], {
      allDates: true,
      policy: { sameCityExemption: false, excludeOvernightGaps: false },
    }).rows[0];
    expect(overnightRow.waitHours).toBe(2);
  });

  it('excludes overnight waiting while allowing a multi-day empty mileage segment', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T23:00:00-04:00', dropoffOdometer: 120 });
    const second = trip('2', {
      date: '2026-08-02',
      arrivalTime: '2026-08-02T02:00:00-04:00',
      arrivalDropoffTime: '2026-08-02T03:00:00-04:00',
      pickupOdometer: 150,
    });
    const row = analyzeTripCostOverrides([first, second], { allDates: true }).rows[0];
    expect(row.unloadedMiles).toBe(30);
    expect(row.waitHours).toBe(0);
    expect(row.waitReason).toBe('Overnight gap excluded');
  });

  it('excludes cancelled, no-show, incomplete, and missing-timestamp trips', () => {
    const result = analyzeTripCostOverrides([
      trip('1'),
      trip('2', { status: 'Cancelled' }),
      trip('3', { status: 'No Show' }),
      trip('4', { status: 'Assigned' }),
      trip('5', { arrivalTime: null }),
    ], { allDates: true });
    expect(result.rows).toHaveLength(1);
    expect(result.excluded).toEqual({ missingTimestamps: 1, notCompleted: 3, invalidChronology: 0 });
  });

  it('applies directional city-pair exclusions without excluding other Indianapolis routes', () => {
    const first = trip('1', { dropoffCity: 'Indianapolis', dropoffOdometer: 120 });
    const indy = trip('2', { pickupCity: 'Indianapolis', pickupOdometer: 170 });
    const excluded = analyzeTripCostOverrides([first, indy], {
      allDates: true,
      policy: { sameCityExemption: false, excludedCityPairs: ['Indianapolis > Indianapolis'] },
    }).rows[0];
    expect(excluded).toMatchObject({ pairExcluded: true, unloadedMiles: 0, waitHours: 0 });

    const muncie = trip('2', { pickupCity: 'Muncie', pickupOdometer: 170 });
    const included = analyzeTripCostOverrides([first, muncie], {
      allDates: true,
      policy: { excludedCityPairs: ['Indianapolis > Indianapolis'] },
    }).rows[0];
    expect(included.unloadedMiles).toBe(50);
  });

  it('applies city-pair exclusions to configured aliases but keeps reverse routes independent', () => {
    const first = trip('1', { dropoffCity: 'Indy', dropoffOdometer: 120 });
    const next = trip('2', { pickupCity: 'Indianapolis, IN', pickupOdometer: 170 });
    const excluded = analyzeTripCostOverrides([first, next], {
      allDates: true,
      policy: { sameCityExemption: false, excludedCityPairs: ['Indianapolis > Indianapolis'] },
    }).rows[0];
    expect(excluded.pairExcluded).toBe(true);

    const reverseFirst = trip('1', { dropoffCity: 'Carmel', dropoffOdometer: 120 });
    const reverseNext = trip('2', { pickupCity: 'Indianapolis', pickupOdometer: 170 });
    const reverse = analyzeTripCostOverrides([reverseFirst, reverseNext], {
      allDates: true,
      policy: { excludedCityPairs: ['Indianapolis > Carmel'] },
    }).rows[0];
    expect(reverse.pairExcluded).toBe(false);
    expect(reverse.unloadedMiles).toBe(50);
  });

  it('fails closed when either city needed for exclusion and same-city checks is missing', () => {
    const first = trip('1', { dropoffCity: '', dropoff: '', dropoffOdometer: 120, arrivalDropoffTime: '2026-08-01T08:00:00-04:00' });
    const next = trip('2', {
      pickupCity: 'Fishers',
      pickupOdometer: 170,
      arrivalTime: '2026-08-01T10:00:00-04:00',
      arrivalDropoffTime: '2026-08-01T10:30:00-04:00',
    });
    const row = analyzeTripCostOverrides([first, next], { allDates: true }).rows[0];
    expect(row).toMatchObject({ cityPairComplete: false, unloadedMiles: 0, waitHours: 0 });
    expect(row.unloadedReason).toContain('city is missing');
    expect(row.waitReason).toContain('city is missing');
  });

  it('requires the same recorded vehicle odometer chain and keeps base cost in totals', () => {
    const first = trip('1', { dropoffOdometer: 120, originalTripCost: '$40.00' });
    const next = trip('2', { pickupOdometer: 170, completedVehicle: 'Van 2' });
    const row = analyzeTripCostOverrides([first, next], { allDates: true }).rows[0];
    expect(row.unloadedMiles).toBe(0);
    expect(row.unloadedReason).toContain('Vehicle changed');
    expect(row.totalCost).toBe(40);
  });

  it('extracts city names and normalizes incomplete settings to safe defaults', () => {
    expect(extractCityFromAddress('10409 Parmer Cir, Fishers, IN 46038, USA')).toBe('Fishers');
    expect(extractCityFromAddress('500 Main St, Louisville, Kentucky, USA')).toBe('Louisville');
    expect(normalizeOverridePolicy({ unloadedRate: -1, waitRoundingMinutes: 0 })).toMatchObject({
      unloadedRate: DEFAULT_OVERRIDE_POLICY.unloadedRate,
      waitRoundingMinutes: 1,
    });
    expect(isOverridePolicyDocumentValid(DEFAULT_OVERRIDE_POLICY)).toBe(true);
    expect(isOverridePolicyDocumentValid({ ...DEFAULT_OVERRIDE_POLICY, waitRate: '9' })).toBe(false);
    expect(isOverridePolicyDocumentValid({ ...DEFAULT_OVERRIDE_POLICY, excludedCityPairs: [42] })).toBe(false);
  });

  it('supports recorded legacy field names and pickup service-date scoping', () => {
    const first = trip('1', {
      date: undefined,
      serviceDate: '2026-08-01',
      arrivalTime: undefined,
      pickupArrival: '7:00 AM',
      arrivalDropoffTime: undefined,
      dropoffArrival: '8:00 AM',
      dropoffOdometer: undefined,
      endMileage: '1,120',
    });
    const next = trip('2', {
      date: undefined,
      dateKey: '2026-08-01',
      arrivalTime: undefined,
      arrivedPickupTime: '10:00 AM',
      arrivalDropoffTime: undefined,
      dropoffArrivalTime: '10:30 AM',
      pickupOdometer: undefined,
      startMileage: '1,170',
    });
    const rows = analyzeTripCostOverrides([first, next], {
      fromDate: '2026-08-01',
      toDate: '2026-08-01',
    }).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ serviceDate: '2026-08-01', unloadedMiles: 50, waitHours: 1 });
  });

  it('applies minimum, driver, directional city, and search filters together', () => {
    const rows = [
      { trip: { id: '1', bookingId: 'B-100', driverId: 'd1', patient: 'First Rider' }, driverKey: 'd1', pickupCity: 'Rushville', dropoffCity: 'Indianapolis', nextPickupCity: 'Carmel', unloadedMiles: 25, waitHours: 1 },
      { trip: { id: '2', bookingId: 'B-200', driverId: 'd2', patient: 'Second Rider' }, driverKey: 'd2', pickupCity: 'Fishers', dropoffCity: 'Carmel', nextPickupCity: 'Indianapolis', unloadedMiles: 50, waitHours: 2 },
    ];
    const filtered = filterTripCostOverrideRows(rows, {
      search: 'second driver',
      driverKey: 'd2',
      minimumUnloadedMiles: 40,
      minimumWaitHours: 1.5,
      gapFromCity: 'CARMEL',
      gapToCity: 'Indianapolis, IN',
      driverNamesById: new Map([['d2', 'Second Driver']]),
    });
    expect(filtered.map((row) => row.trip.bookingId)).toEqual(['B-200']);
  });
});
