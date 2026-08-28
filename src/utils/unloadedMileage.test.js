import { describe, expect, it } from 'vitest';
import { buildCostOverrideRows, buildUnloadedMileageRows, tripDistanceMiles } from './unloadedMileage';

const trip = (id, overrides = {}) => ({
  id, bookingId: id, patient: 'Rider One', date: '2026-08-01', status: 'Completed',
  pickup: 'Rushville, IN 46173', dropoff: 'Carmel, IN 46032',
  pickupOdometer: 100, dropoffOdometer: 135, ...overrides,
});

describe('per-leg cost override collection', () => {
  it('evaluates every booking leg independently instead of grouping rider days', () => {
    const rows = buildCostOverrideRows([
      trip('leg-1', { dropoffOdometer: 159 }),
      trip('leg-2', { pickupOdometer: 159, dropoffOdometer: 193 }),
    ]);
    expect(rows.map(row => row.bookingId)).toEqual(['leg-1', 'leg-2']);
    expect(rows.map(row => row.unloadedMiles)).toEqual([59, 34]);
  });

  it('matches workbook unloaded and waiting calculations for one exact leg', () => {
    const [row] = buildCostOverrideRows([trip('107769193', {
      _originalRow: { 'City (Orig)': 'Rushville', 'City (Dest)': 'Carmel', 'Provider Cost': '65.28', 'Unloaded Miles': 59, 'Wait time hours -(30 min)': 3.5 },
    })], { minimumUnloadedMiles: 30, unloadedRatePerMile: 0.8, waitingRatePerHour: 9 });
    expect(row).toMatchObject({ fromCity: 'Rushville', toCity: 'Carmel', originalCost: 65.28, unloadedAmount: 47.2, waitingAmount: 31.5 });
    expect(row.totalCost).toBeCloseTo(143.98, 5);
  });

  it('can exclude same-city unloaded mileage without excluding valid waiting', () => {
    const [row] = buildCostOverrideRows([trip('107786938', {
      pickup: 'Indianapolis, IN 46219', dropoff: 'Indianapolis, IN 46203',
      _originalRow: { 'Provider Cost': 31.33, 'Unloaded Miles': 40, 'Wait time hours -(30 min)': 1 },
    })]);
    expect(row.unloadedEligible).toBe(false);
    expect(row.waitingEligible).toBe(true);
    expect(row.overrideAmount).toBe(9);
    expect(row.totalCost).toBeCloseTo(40.33, 5);
  });

  it('applies directional unloaded and waiting city exclusions separately', () => {
    const candidate = trip('leg-1', { _originalRow: { 'Unloaded Miles': 50, 'Wait time hours -(30 min)': 2 } });
    const [row] = buildCostOverrideRows([candidate], {
      unloadedExcludedCityPairs: ['Rushville > Carmel'],
      waitingExcludedCityPairs: [],
    });
    expect(row.unloadedEligible).toBe(false);
    expect(row.waitingEligible).toBe(true);
  });

  it('can independently disable override types and mobility classes', () => {
    const candidate = trip('leg-1', { _originalRow: { 'Unloaded Miles': 50, 'Wait time hours -(30 min)': 2 } });
    const [waitingOnly] = buildCostOverrideRows([candidate], { collectUnloadedMileage: false });
    expect(waitingOnly.unloadedEligible).toBe(false);
    expect(waitingOnly.waitingEligible).toBe(true);
    expect(buildCostOverrideRows([candidate], { includeAmbulatory: false })).toHaveLength(0);
  });

  it('keeps short, incomplete records out unless previously reviewed', () => {
    expect(buildCostOverrideRows([trip('short', { dropoffOdometer: 129 })])).toHaveLength(0);
    expect(buildCostOverrideRows([trip('open', { status: 'Assigned' })])).toHaveLength(0);
    expect(buildCostOverrideRows([trip('reviewed', { status: 'Assigned', costOverride: { status: 'dismissed', unloadedMiles: 35 } })])).toHaveLength(1);
  });

  it('keeps the legacy API available for existing callers', () => {
    expect(buildUnloadedMileageRows([trip('1')])[0]).toMatchObject({ miles: 35, status: 'candidate' });
    expect(tripDistanceMiles(trip('2'))).toBe(35);
  });
});
