import { describe, expect, it } from 'vitest';
import { buildWellTransPayload, calculateTripMileage, normalizeBookingId, validateTripForWellTrans } from './welltransMapping';

describe('WellTrans mapping', () => {
  it('matches by booking ID and never passenger name', () => {
    expect(normalizeBookingId({ id: 'internal', bookingId: '107577968', patient: 'Stephen Lewis' })).toBe('107577968');
  });
  it('derives mileage from odometers before distance', () => {
    expect(calculateTripMileage({ pickupOdometer: 263206, dropoffOdometer: 263223, distance: 99 })).toBe(17);
  });
  it('maps pickup and dropoff activity rows independently', () => {
    const payload = buildWellTransPayload({ bookingId: '107577968', arrivalTime: '2026-07-25T10:49:00Z', departedPickupTime: '2026-07-25T10:52:00Z', arrivalDropoffTime: '2026-07-25T11:19:00Z', completedAt: '2026-07-25T11:21:00Z', pickupOdometer: 10, dropoffOdometer: 27, paperSignatureConfirmed: true });
    expect(payload.pickup.mileage).toBe(0);
    expect(payload.dropoff.mileage).toBe(17);
    expect(payload.dropoff.signatureCaptured).toBe(true);
  });
  it('rejects incomplete records before queueing', () => {
    expect(validateTripForWellTrans({ bookingId: '1', status: 'Assigned' }).valid).toBe(false);
  });
});

