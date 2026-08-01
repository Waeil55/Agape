import { describe, expect, it } from 'vitest';
import { buildUnloadedMileageRows, tripDistanceMiles } from './unloadedMileage';

const trip = (id, overrides = {}) => ({
  id, bookingId: id, patient: 'Rider One', date: '2026-08-01', status: 'Completed',
  pickupOdometer: 100, dropoffOdometer: 135, ...overrides,
});

describe('unloaded mileage candidate detection', () => {
  it('proposes one completed leg at or above 30 miles without confirming it', () => {
    const rows = buildUnloadedMileageRows([trip('1')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'candidate', candidate: true, miles: 35 });
    expect(buildUnloadedMileageRows([trip('2', { dropoffOdometer: 130 })])).toHaveLength(1);
  });

  it('does not propose a rider day containing multiple completed legs', () => {
    expect(buildUnloadedMileageRows([
      trip('1'), trip('2', { pickupOdometer: 135, dropoffOdometer: 170 }),
    ])).toHaveLength(0);
  });

  it('does not propose short, incomplete, or ambiguous rider records', () => {
    expect(buildUnloadedMileageRows([trip('1', { dropoffOdometer: 129 })])).toHaveLength(0);
    expect(buildUnloadedMileageRows([trip('2', { status: 'Assigned' })])).toHaveLength(0);
    expect(buildUnloadedMileageRows([trip('3', { patient: '' })])).toHaveLength(0);
  });

  it('keeps confirmed and dismissed decisions visible for audit', () => {
    const confirmed = trip('1', { unloadedMileage: { status: 'confirmed', miles: 42 } });
    const dismissed = trip('2', { patient: 'Rider Two', unloadedMileage: { status: 'dismissed', miles: 35 } });
    expect(buildUnloadedMileageRows([confirmed, dismissed]).map(row => row.status))
      .toEqual(['confirmed', 'dismissed']);
    expect(tripDistanceMiles(confirmed)).toBe(35);
  });
});
