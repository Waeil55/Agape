import { describe, expect, it, beforeEach } from 'vitest';
import {
  saveAssignedVehicle,
  getAssignedVehicle,
  resolveDriverVehicle,
  resolveTripVehicle,
  clearVehiclePersistence,
  clearAssignedVehicle,
  planVehicleAssignment,
  reconcileVehicleOwnership,
} from './vehiclePersistence';

describe('vehiclePersistence', () => {
  beforeEach(() => {
    clearVehiclePersistence();
  });

  it('saves and retrieves assigned vehicle by driverId', () => {
    saveAssignedVehicle('DRV-123', 'Toyota Prius #35');
    expect(getAssignedVehicle('DRV-123')).toBe('Toyota Prius #35');
  });

  it('saves and retrieves assigned vehicle by driver email', () => {
    saveAssignedVehicle('driver@agapecare.local', 'Ford Transit #10');
    expect(getAssignedVehicle('driver@agapecare.local')).toBe('Ford Transit #10');
  });

  it('resolves explicit vehicle on driver profile first', () => {
    const driver = { id: 'DRV-1', vehicle: 'Dodge Caravan #05' };
    expect(resolveDriverVehicle(driver)).toBe('Dodge Caravan #05');
  });

  it('falls back to remembered vehicle if driver.vehicle is empty', () => {
    saveAssignedVehicle('DRV-99', 'Chevy Suburban #99');
    const driver = { id: 'DRV-99', vehicle: '' };
    expect(resolveDriverVehicle(driver)).toBe('Chevy Suburban #99');
  });

  it('does not resurrect a remembered vehicle when authoritative mode is requested', () => {
    saveAssignedVehicle('DRV-99', 'Chevy Suburban #99');
    expect(resolveDriverVehicle({ id: 'DRV-99', vehicle: '' }, '', { allowRemembered: false })).toBe('');
  });

  it('resolves trip vehicle from driver when trip completedVehicle is missing', () => {
    saveAssignedVehicle('DRV-77', 'Honda Odyssey #77');
    const driver = { id: 'DRV-77', vehicle: '' };
    const trip = { id: 'TRIP-101', completedVehicle: '' };
    expect(resolveTripVehicle(trip, driver)).toBe('Honda Odyssey #77');
  });

  it('never leaks one driver vehicle to another driver', () => {
    saveAssignedVehicle('DRV-1', 'Toyota 001');
    expect(getAssignedVehicle('DRV-2')).toBe('');
  });

  it('clears an unassigned vehicle permanently', () => {
    saveAssignedVehicle('DRV-1', 'Toyota 001');
    clearAssignedVehicle('DRV-1');
    expect(getAssignedVehicle('DRV-1')).toBe('');
  });

  it('atomically moves a vehicle between drivers and clears the old inverse assignment', () => {
    const result = planVehicleAssignment(
      [
        { id: 'DRV-1', vehicle: 'Toyota 001', vehicleId: 'V-1' },
        { id: 'DRV-2', vehicle: 'Ford 002', vehicleId: 'V-2' },
      ],
      [
        { id: 'V-1', name: 'Toyota 001', driverId: 'DRV-1', assignedDriver: 'DRV-1' },
        { id: 'V-2', name: 'Ford 002', driverId: 'DRV-2', assignedDriver: 'DRV-2' },
      ],
      'DRV-2',
      'Toyota 001',
    );
    expect(result.nextDrivers).toEqual([
      { id: 'DRV-1', vehicle: '', vehicleId: '' },
      { id: 'DRV-2', vehicle: 'Toyota 001', vehicleId: 'V-1' },
    ]);
    expect(result.nextVehicles).toEqual([
      { id: 'V-1', name: 'Toyota 001', driverId: 'DRV-2', assignedDriver: 'DRV-2' },
      { id: 'V-2', name: 'Ford 002', driverId: '', assignedDriver: '' },
    ]);
  });

  it('clears a duplicate owner identified by vehicleId even when its vehicle name is missing', () => {
    const result = planVehicleAssignment(
      [
        { id: 'DRV-1', vehicle: '', vehicleId: 'V-1' },
        { id: 'DRV-2', vehicle: '', vehicleId: '' },
      ],
      [{ id: 'V-1', name: 'Toyota 001', driverId: 'DRV-1', assignedDriver: 'DRV-1' }],
      'DRV-2',
      'Toyota 001',
    );
    expect(result.nextDrivers).toEqual([
      { id: 'DRV-1', vehicle: '', vehicleId: '' },
      { id: 'DRV-2', vehicle: 'Toyota 001', vehicleId: 'V-1' },
    ]);
  });

  it('restores a driver assignment from the authoritative vehicle owner after reload', () => {
    expect(reconcileVehicleOwnership(
      [{ id: 'DRV-1', vehicle: '', vehicleId: '' }],
      [{ id: 'V-1', name: 'Toyota 001', driverId: 'DRV-1' }],
    )).toEqual([{ id: 'DRV-1', vehicle: 'Toyota 001', vehicleId: 'V-1' }]);
  });

  it('hides a stale duplicate driver claim when the vehicle belongs to someone else', () => {
    expect(reconcileVehicleOwnership(
      [
        { id: 'DRV-1', vehicle: 'Toyota 001', vehicleId: 'V-1' },
        { id: 'DRV-2', vehicle: 'Toyota 001', vehicleId: 'V-1' },
      ],
      [{ id: 'V-1', name: 'Toyota 001', driverId: 'DRV-2' }],
    )).toEqual([
      { id: 'DRV-1', vehicle: '', vehicleId: '' },
      { id: 'DRV-2', vehicle: 'Toyota 001', vehicleId: 'V-1' },
    ]);
  });
});
