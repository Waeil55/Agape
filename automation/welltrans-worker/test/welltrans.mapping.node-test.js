import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTripForWellTrans } from '../src/welltrans.mapping.js';

test('scheduled values and inferred odometers never replace missing actual evidence', () => {
  const validation = validateTripForWellTrans({
    bookingId: '107485529', dateKey: '2026-08-03', status: 'Completed',
    driverName: 'Mikhaeil Waeil', vehicle: 'TOYOTA 0025',
    time: '04:33', arrivalDropoffTime: '2026-08-03T04:48:00-04:00',
    dropoffOdometer: 265072, distance: 2, paperSignatureConfirmed: true,
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.payload.pickup.arrival, '');
  assert.equal(validation.payload.pickup.departure, '');
  assert.equal(validation.payload.pickup.mileage, null);
  assert.ok(validation.errors.includes('Pickup arrival is missing'));
  assert.ok(validation.errors.includes('Pickup departure is missing'));
  assert.ok(validation.errors.includes('Pickup odometer is missing'));
});

for (const status of ['No Show', 'At Dropoff']) {
  test(`${status} is not completed merely because completedAt exists`, () => {
    const validation = validateTripForWellTrans({
      bookingId: '107485529', dateKey: '2026-08-03', status,
      completedAt: '2026-08-03T08:48:43.170Z',
    });
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes('Trip is not completed'));
  });
}
