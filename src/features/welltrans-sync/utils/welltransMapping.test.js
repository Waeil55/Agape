import { describe, expect, it } from 'vitest';
import {
  buildWellTransCoverage, buildWellTransPayload, calculateTripMileage,
  normalizeBookingId, normalizeServiceDate, validateTripForWellTrans,
} from './welltransMapping';

describe('WellTrans mapping', () => {
  it('matches by booking ID and never passenger name', () => {
    expect(normalizeBookingId({ id: 'internal', bookingId: '107577968', patient: 'Stephen Lewis' })).toBe('107577968');
  });
  it('derives mileage from odometers before distance', () => {
    expect(calculateTripMileage({ pickupOdometer: 263206, dropoffOdometer: 263223, distance: 99 })).toBe(17);
  });
  it('normalizes the broker service date independently from clock times', () => {
    expect(normalizeServiceDate({ dateKey: '2026-07-25' })).toBe('2026-07-25');
  });
  it('maps pickup and dropoff activity rows independently', () => {
    const payload = buildWellTransPayload({ bookingId: '107577968', dateKey: '2026-07-25', driverName: 'waeil2', vehicle: 'prius_350025', arrivalTime: '2026-07-25T10:49:00Z', departedPickupTime: '2026-07-25T10:52:00Z', arrivalDropoffTime: '2026-07-25T11:19:00Z', completedAt: '2026-07-25T11:21:00Z', pickupOdometer: 10, dropoffOdometer: 27, paperSignatureConfirmed: true });
    expect(payload.pickup.mileage).toBe(10);
    expect(payload.dropoff.mileage).toBe(27);
    expect(payload.dropoff.signatureCaptured).toBe(true);
  });
  it('rejects incomplete records before queueing', () => {
    expect(validateTripForWellTrans({ bookingId: '1', status: 'Assigned' }).valid).toBe(false);
  });
  it('allows the server to resolve an authoritative driver ID', () => {
    const result = validateTripForWellTrans({
      bookingId: '107413428', dateKey: '2026-07-25', status: 'Completed',
      driverId: 'DRV-GGQOR7', driverName: 'Agape Care Medical Transportation Inc.',
      vehicle: 'prius_350025', arrivalTime: '2026-07-25T10:49:00Z',
      departedPickupTime: '2026-07-25T10:49:00Z', arrivalDropoffTime: '2026-07-25T11:18:00Z',
      pickupOdometer: 263206, dropoffOdometer: 263223, signatureCaptured: true,
    });
    expect(result.valid).toBe(true);
  });
  it('allows an unavailable vehicle so the worker can leave WellTrans blank', () => {
    const result = validateTripForWellTrans({
      bookingId: '107405172', date: '2026-07-24', status: 'Completed',
      driverId: 'DRV-GGQOR7', arrivalTime: '2026-07-24T10:00:00Z',
      departedPickupTime: '2026-07-24T10:01:00Z', arrivalDropoffTime: '2026-07-24T10:30:00Z',
      pickupOdometer: 262986, dropoffOdometer: 263003, signatureCaptured: true,
    });
    expect(result.valid).toBe(true);
    expect(result.payload.vehicle).toBe('');
  });

  it('never reports complete coverage while a completed trip has no verified log', () => {
    const completeTrip = id => ({
      id, bookingId: id, dateKey: '2026-07-27', status: 'Completed',
      driverName: 'Mikhaeil Waeil', pickupArrival: '10:00', pickupDeparture: '10:01',
      dropoffArrival: '10:20', pickupOdometer: 100, dropoffOdometer: 110,
      signatureCaptured: true,
    });
    const coverage = buildWellTransCoverage(
      [completeTrip('100'), completeTrip('101')],
      new Map([['100', { tripId: '100', status: 'awaiting_review' }]]),
    );
    expect(coverage.expected).toBe(2);
    expect(coverage.verified).toBe(1);
    expect(coverage.missingCount).toBe(1);
    expect(coverage.coverageComplete).toBe(false);
    expect(coverage.reviewReady).toBe(false);
  });

  it('unlocks date confirmation only when every completed trip is verified', () => {
    const completeTrip = id => ({
      id, bookingId: id, dateKey: '2026-07-27', status: 'Completed',
      driverName: 'Mikhaeil Waeil', pickupArrival: '10:00', pickupDeparture: '10:01',
      dropoffArrival: '10:20', pickupOdometer: 100, dropoffOdometer: 110,
      signatureCaptured: true,
    });
    const coverage = buildWellTransCoverage(
      [completeTrip('100'), completeTrip('101')],
      new Map([
        ['100', { tripId: '100', status: 'completed' }],
        ['101', { tripId: '101', status: 'awaiting_review' }],
      ]),
    );
    expect(coverage.coveragePercent).toBe(100);
    expect(coverage.coverageComplete).toBe(true);
    expect(coverage.reviewReady).toBe(true);
  });
});
