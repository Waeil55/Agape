import { describe, expect, it, beforeEach } from 'vitest';
import {
  saveAssignedVehicle,
  getAssignedVehicle,
  resolveDriverVehicle,
  resolveTripVehicle,
  clearVehiclePersistence,
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

  it('resolves trip vehicle from driver when trip completedVehicle is missing', () => {
    saveAssignedVehicle('DRV-77', 'Honda Odyssey #77');
    const driver = { id: 'DRV-77', vehicle: '' };
    const trip = { id: 'TRIP-101', completedVehicle: '' };
    expect(resolveTripVehicle(trip, driver)).toBe('Honda Odyssey #77');
  });
});
