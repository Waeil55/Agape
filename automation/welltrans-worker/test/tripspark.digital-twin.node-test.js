import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TripSparkDigitalTwin } from './tripspark.digital-twin.js';

const bookings = count => Array.from({ length: count }, (_, index) => ({
  bookingId: String(107000000 + index),
}));

const payload = bookingId => ({
  bookingId: String(bookingId),
  driver: 'Mikhaeil Waeil',
  vehicle: 'TOYOTA 002',
  pickup: { arrival: '08:01', departure: '08:03', mileage: 263200 },
  dropoff: {
    arrival: '08:24', departure: '08:26', mileage: 263211,
    signatureCaptured: true,
  },
});

describe('TripSpark deterministic digital twin', () => {
  it('indexes 5,000 bookings and 10,000 virtual rows without omissions', () => {
    const twin = new TripSparkDigitalTwin(bookings(5000));
    assert.deepEqual(
      twin.buildVirtualGridIndex({ viewportRows: 100, overlapRows: 25 }),
      { bookingCount: 5000, rowCount: 10000 },
    );
  });

  it('stages 5,000 exact bookings without crossing rows', () => {
    const twin = new TripSparkDigitalTwin(bookings(5000));
    twin.buildVirtualGridIndex();
    for (let index = 0; index < 5000; index += 1) {
      const bookingId = 107000000 + index;
      const result = twin.stageTrip(payload(bookingId));
      assert.equal(result.bookingId, String(bookingId));
      assert.equal(result.manualApplyRequired, true);
    }
    assert.equal(twin.reviewBooking('107004999')[1].mileage, 263211);
    assert.equal(twin.reviewBooking('107000000')[0].driver, 'Mikhaeil Waeil');
  });

  it('never persists staged data before the operator applies it', () => {
    const twin = new TripSparkDigitalTwin(bookings(1));
    twin.stageTrip(payload('107000000'));
    assert.equal(twin.reviewBooking('107000000')[0].arrival, '08:01');
    assert.equal(twin.persistedBooking('107000000')[0].arrival, '');
    twin.applyByOperator();
    assert.equal(twin.persistedBooking('107000000')[0].arrival, '08:01');
  });

  it('rolls the entire trip back after an injected mid-row failure', () => {
    const twin = new TripSparkDigitalTwin(bookings(2));
    assert.throws(
      () => twin.stageTrip(payload('107000000'), { failAfterField: 'Dropoff.arrival' }),
      /Injected TripSpark failure/,
    );
    assert.equal(twin.reviewBooking('107000000')[0].driver, '');
    assert.equal(twin.reviewBooking('107000000')[1].arrival, '');
    assert.equal(twin.reviewBooking('107000001')[0].driver, '');
  });

  it('fails closed when Booking ID does not match exactly', () => {
    const twin = new TripSparkDigitalTwin(bookings(2));
    assert.throws(
      () => twin.stageTrip(payload('10700000')),
      /matched 0 Pickup and 0 Dropoff/,
    );
  });
});
