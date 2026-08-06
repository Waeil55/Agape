import { describe, expect, it } from 'vitest';
import { buildDriverDailyAnalytics, finiteTripNumber } from './driverAnalytics';

describe('driver daily analytics', () => {
  it('normalizes imported mileage and never concatenates string values', () => {
    expect(finiteTripNumber('16.952mi')).toBe(16.952);
    expect(finiteTripNumber('265,017')).toBe(265017);
    const result = buildDriverDailyAnalytics([
      { date: '2026-08-06', status: 'Completed', distance: '6.5' },
      { date: '2026-08-06', status: 'Completed', pickupOdometer: '265,011', dropoffOdometer: '265,017', distance: '265017' },
    ], '2026-08-06');
    expect(result.totalDistance).toBe(12.5);
  });

  it('uses only the selected day and physical arrival timestamps', () => {
    const result = buildDriverDailyAnalytics([
      { date: '2026-08-06', status: 'Completed', arrivalTime: '2026-08-06T08:00:00.000Z', arrivalDropoffTime: '2026-08-06T08:30:00.000Z', startedAt: '2026-08-06T05:00:00.000Z', completedAt: '2026-08-06T12:00:00.000Z', distance: 10 },
      { date: '2026-08-06', status: 'Completed', arrivalTime: '2026-08-06T09:00:00.000Z', arrivalDropoffTime: '2026-08-06T09:30:00.000Z', distance: 5 },
      { date: '2026-08-05', status: 'Completed', arrivalTime: '2026-08-05T08:00:00.000Z', arrivalDropoffTime: '2026-08-05T18:00:00.000Z', distance: 500 },
    ], '2026-08-06');
    expect(result.tripsCompleted).toBe(2);
    expect(result.totalDistance).toBe(15);
    expect(result.totalDriveTime).toBe(60);
    expect(result.idleMinutes).toBe(30);
    expect(result.drivingPercent + result.idlePercent).toBe(100);
  });
});
