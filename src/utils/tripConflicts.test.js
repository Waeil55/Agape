import { describe, expect, it } from 'vitest';
import { buildDriverTimeConflicts } from './tripConflicts';

const trip = (overrides = {}) => ({
  id: 'trip-1',
  bookingId: '1001',
  patient: 'Client One',
  date: '2026-08-31',
  time: '10:00',
  ...overrides,
});

describe('driver time conflicts', () => {
  it('returns no warning when the visible service date has no trips', () => {
    expect(buildDriverTimeConflicts([])).toEqual([]);
  });

  it('never compares trips from different service dates', () => {
    expect(buildDriverTimeConflicts([
      trip(),
      trip({ id: 'trip-2', bookingId: '1002', patient: 'Client Two', date: '2026-09-01' }),
    ])).toEqual([]);
  });

  it('does not report duplicate records or two legs for the same client as a self-conflict', () => {
    expect(buildDriverTimeConflicts([
      trip(),
      trip({ id: 'duplicate-doc', patient: 'Client One' }),
      trip({ id: 'trip-2', bookingId: '1002', patient: '  client one  ', time: '10:10' }),
    ])).toEqual([]);
  });

  it('reports two different clients scheduled less than thirty minutes apart', () => {
    expect(buildDriverTimeConflicts([
      trip(),
      trip({ id: 'trip-2', bookingId: '1002', patient: 'Client Two', time: '10:29' }),
    ])).toEqual([
      expect.objectContaining({
        aId: 'trip-1',
        bId: 'trip-2',
        aLabel: 'Client One #1001',
        bLabel: 'Client Two #1002',
        serviceDate: '2026-08-31',
      }),
    ]);
  });

  it('does not report trips exactly at the thirty-minute boundary', () => {
    expect(buildDriverTimeConflicts([
      trip(),
      trip({ id: 'trip-2', bookingId: '1002', patient: 'Client Two', time: '10:30' }),
    ])).toEqual([]);
  });
});
