import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fleetView = readFileSync(new URL('./DriversVehiclesPage.jsx', import.meta.url), 'utf8');
const driverView = readFileSync(new URL('./DriverPage.jsx', import.meta.url), 'utf8');

describe('maintenance and opened-trip display contract', () => {
  it('shows oil mileage and filter days in fleet views', () => {
    expect(fleetView).toContain('formatOilRemaining(service.oil.milesRemaining)');
    expect(fleetView).toContain('formatFilterRemaining(service.filter.daysRemaining)');
  });

  it('uses remaining labels in driver maintenance settings', () => {
    expect(driverView).toContain('formatOilRemaining(vehicleMaintenance.oil.milesRemaining)');
    expect(driverView).toContain('formatFilterRemaining(vehicleMaintenance.filter.daysRemaining)');
  });

  it('enlarges only the opened-trip header ID value', () => {
    expect(driverView).toContain('className="text-base font-bold leading-tight text-blue-600">{trip.bookingId || trip.id || \'--\'}</span>');
  });
});
