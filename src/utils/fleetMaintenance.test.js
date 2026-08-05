import { describe, expect, it } from 'vitest';
import { deriveVehicleOdometer, getVehicleMaintenanceStatus } from './fleetMaintenance';

describe('fleet maintenance', () => {
  it('uses the highest completed-trip odometer for the assigned vehicle', () => {
    const vehicle = { id: 'V1', name: 'Van 1', odometer: 1000 };
    const drivers = [{ id: 'D1', vehicleId: 'V1', vehicle: 'Van 1' }];
    const trips = [{ driverId: 'D1', dropoffOdometer: 1325 }, { vehicleId: 'V1', dropoffOdometer: 1400 }];
    expect(deriveVehicleOdometer(vehicle, trips, drivers)).toBe(1400);
  });

  it('marks service overdue from an explicit interval', () => {
    const result = getVehicleMaintenanceStatus({ name: 'Van 1', odometer: 6100, lastOilChangeOdometer: 1000, oilChangeIntervalMiles: 5000 });
    expect(result.nextService).toBe(6000);
    expect(result.status).toBe('overdue');
    expect(result.milesRemaining).toBe(-100);
  });
});
