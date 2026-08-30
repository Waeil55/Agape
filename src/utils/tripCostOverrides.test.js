import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERRIDE_POLICY,
  analyzeTripCostOverrides,
  extractCityFromAddress,
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

  it('does not bill waiting when another trip overlaps the gap', () => {
    const first = trip('1', { arrivalDropoffTime: '2026-08-01T08:00:00-04:00' });
    const second = trip('2', {
      arrivalTime: '2026-08-01T11:00:00-04:00',
      arrivalDropoffTime: '2026-08-01T11:30:00-04:00',
    });
    const overlapping = trip('x', {
      status: 'Assigned',
      arrivalTime: '2026-08-01T09:00:00-04:00',
      arrivalDropoffTime: '2026-08-01T10:00:00-04:00',
    });
    const row = analyzeTripCostOverrides([first, second, overlapping], { allDates: true }).rows[0];
    expect(row.interveningWork).toBe(true);
    expect(row.waitCost).toBe(0);
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
    expect(normalizeOverridePolicy({ unloadedRate: -1, waitRoundingMinutes: 0 })).toMatchObject({
      unloadedRate: DEFAULT_OVERRIDE_POLICY.unloadedRate,
      waitRoundingMinutes: 1,
    });
  });
});
