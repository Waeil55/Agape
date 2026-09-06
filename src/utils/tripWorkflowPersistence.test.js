import { describe, expect, it } from 'vitest';
import { buildTripWorkflowPersistenceRecords } from './tripWorkflowPersistence';

describe('trip workflow persistence records', () => {
  const currentTrip = {
    id: '107847209',
    bookingId: '107847209',
    patient: 'Test Rider',
    driverId: 'driver-1',
    driverEmail: 'driver@example.com',
    driverName: 'Driver One',
    status: 'At Dropoff',
    tenantId: 'agape-care',
  };

  it('keeps the authoritative trip and both mirrors on one identity and timestamp', () => {
    const records = buildTripWorkflowPersistenceRecords({
      tripId: currentTrip.id,
      currentTrip,
      tenantId: 'agape-care',
      nowIso: '2026-09-06T12:00:00.000Z',
      updates: {
        status: 'Completed',
        dropoffOdometer: 273077,
        cancellationReason: undefined,
      },
    });

    expect(records.authoritativeTrip).toMatchObject({
      id: currentTrip.id,
      status: 'Completed',
      dropoffOdometer: 273077,
      driverId: 'driver-1',
      workflowUpdatedAt: '2026-09-06T12:00:00.000Z',
      tenantId: 'agape-care',
    });
    expect(records.authoritativePatch).toMatchObject({
      id: currentTrip.id,
      status: 'Completed',
      dropoffOdometer: 273077,
      workflowUpdatedAt: '2026-09-06T12:00:00.000Z',
      tenantId: 'agape-care',
    });
    expect(records.authoritativePatch).not.toHaveProperty('patient');
    expect(records.progressPatch).toEqual(records.ledgerPatch);
    expect(records.progressPatch).toMatchObject({
      tripId: currentTrip.id,
      driverEmail: 'driver@example.com',
      status: 'Completed',
      workflowUpdatedAt: '2026-09-06T12:00:00.000Z',
    });
    expect(records.progressPatch).not.toHaveProperty('cancellationReason');
  });

  it('fails closed when the requested trip is not the authoritative record', () => {
    expect(() => buildTripWorkflowPersistenceRecords({
      tripId: 'other-trip',
      currentTrip,
      tenantId: 'agape-care',
    })).toThrow('not present in the authoritative trip collection');
  });
});
