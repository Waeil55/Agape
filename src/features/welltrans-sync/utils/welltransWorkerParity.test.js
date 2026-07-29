import { describe, expect, it } from 'vitest';
import {
  buildWellTransPayload as buildAppPayload,
  validateTripForWellTrans as validateAppTrip,
} from './welltransMapping';
import {
  buildWellTransPayload as buildWorkerPayload,
  validateTripForWellTrans as validateWorkerTrip,
} from '../../../../automation/welltrans-worker/src/welltrans.mapping';

const representativeTrips = [
  {
    id: '107413427',
    bookingId: '107413427',
    status: 'completed',
    dateKey: '2026-07-25',
    driverName: 'Mikhaeil Waeil',
    vehicle: 'TOYOTA 002',
    pickupArrival: '06:49',
    pickupDeparture: '06:49',
    dropoffArrival: '07:19',
    dropoffDeparture: '07:19',
    pickupOdometer: 263206,
    dropoffOdometer: 263223,
    signatureCaptured: true,
  },
  {
    id: 'TRIP-107577979',
    status: 'complete',
    date: '07/23/2026',
    completedDriverName: 'Mikhaeil Waeil',
    arrivalTime: '07:23',
    departedPickupTime: '07:23',
    arrivalDropoffTime: '07:49',
    endMileage: 263239,
    startMileage: 263223,
    paperSignatureConfirmed: true,
  },
  {
    id: 'invalid-trip',
    status: 'pending',
    dateKey: '2026-07-25',
  },
];

describe('WellTrans standalone agent mapping parity', () => {
  it.each(representativeTrips)('builds the same payload for $id', (trip) => {
    const appResult = (() => {
      try { return buildAppPayload(trip); } catch (error) { return error.message; }
    })();
    const workerResult = (() => {
      try { return buildWorkerPayload(trip); } catch (error) { return error.message; }
    })();
    expect(workerResult).toEqual(appResult);
  });

  it.each(representativeTrips)('returns the same validation for $id', (trip) => {
    expect(validateWorkerTrip(trip)).toEqual(validateAppTrip(trip));
  });
});
