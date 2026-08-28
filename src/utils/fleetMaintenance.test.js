import { describe, expect, it } from 'vitest';
import { DEFAULT_MAINTENANCE_POLICY, deriveVehicleOdometer, formatFilterRemaining, formatOilRemaining, getVehicleMaintenanceStatus } from './fleetMaintenance';

describe('fleet maintenance', () => {
  it('formats remaining and overdue service intervals without negative wording', () => {
    expect(formatOilRemaining(1250)).toBe('1,250 miles remaining');
    expect(formatOilRemaining(-120)).toBe('120 miles overdue');
    expect(formatOilRemaining(0)).toBe('Oil change due now');
    expect(formatFilterRemaining(45)).toBe('45 days remaining');
    expect(formatFilterRemaining(-8)).toBe('8 days overdue');
    expect(formatFilterRemaining(null)).toBe('Service baseline required');
  });

  it('uses the highest completed-trip odometer for the assigned vehicle', () => {
    const vehicle = { id: 'V1', name: 'Van 1', odometer: '1,000' };
    const drivers = [{ id: 'D1', vehicleId: 'V1', vehicle: 'Van 1' }];
    const trips = [{ driverId: 'D1', dropoffOdometer: 1325 }, { vehicleId: 'V1', dropoffOdometer: '1,400' }];
    expect(deriveVehicleOdometer(vehicle, trips, drivers)).toBe(1400);
  });

  it('does not attribute an explicitly recorded vehicle to a different current assignment', () => {
    const vehicle = { id: 'V2', name: 'Van 2', odometer: 2000 };
    const drivers = [{ id: 'D1', vehicleId: 'V2', vehicle: 'Van 2' }];
    const trips = [{ driverId: 'D1', vehicleId: 'V1', completedVehicle: 'Van 1', dropoffOdometer: 9000 }];
    expect(deriveVehicleOdometer(vehicle, trips, drivers)).toBe(2000);
  });

  it('uses the enterprise 4,000 mile default and marks the exact threshold due', () => {
    const result = getVehicleMaintenanceStatus({ odometer: 5000, lastOilChangeOdometer: 1000 });
    expect(result.oil.intervalMiles).toBe(DEFAULT_MAINTENANCE_POLICY.oilChangeIntervalMiles);
    expect(result.oil.nextServiceOdometer).toBe(5000);
    expect(result.oil.status).toBe('due');
  });

  it('warns before oil service is due', () => {
    const result = getVehicleMaintenanceStatus({ odometer: 4600, lastOilChangeOdometer: 1000, lastFilterChangeDate: '2026-01-01' });
    expect(result.oil.milesRemaining).toBe(400);
    expect(result.oil.status).toBe('due_soon');
  });

  it('tracks annual filter service and due-soon dates independently', () => {
    const result = getVehicleMaintenanceStatus(
      { odometer: 1000, lastOilChangeOdometer: 1000, lastFilterChangeDate: '2025-09-01' },
      [], [], {}, new Date('2026-08-06T12:00:00Z'),
    );
    expect(result.filter.nextServiceDate).toBe('2026-09-01');
    expect(result.filter.status).toBe('due_soon');
  });

  it('requires a filter baseline instead of inventing a service date', () => {
    const result = getVehicleMaintenanceStatus({ odometer: 1000, lastOilChangeOdometer: 1000 });
    expect(result.filter.status).toBe('setup_required');
    expect(result.attention).toBe(true);
  });
});
