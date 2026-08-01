import { describe, expect, it } from 'vitest';
import { hydrateTripDriverIdentity, isCompanyDriverPlaceholder, resolveTripDriverName } from './driverIdentity';

const drivers = [{ id: 'DRV-1', name: 'Mikhaeil Waeil', email: 'waeil@example.com' }];

describe('driver identity', () => {
  it('replaces an imported company label using driverId', () => {
    const trip = hydrateTripDriverIdentity({ driverId: 'DRV-1', driverName: 'Agape Care Medical Transportation Inc.', status: 'Completed' }, drivers);
    expect(trip.driverName).toBe('Mikhaeil Waeil');
    expect(trip.completedDriverName).toBe('Mikhaeil Waeil');
  });

  it('resolves a driver using email when an imported record has no driverId', () => {
    expect(resolveTripDriverName({ driverEmail: 'WAEIL@example.com', driverName: 'Agape Care Medical Transportation Inc.' }, drivers)).toBe('Mikhaeil Waeil');
  });

  it('preserves a valid historical human name without a directory match', () => {
    expect(resolveTripDriverName({ completedDriverName: 'Jane Driver' }, drivers)).toBe('Jane Driver');
  });

  it('never presents the transportation company as a driver', () => {
    expect(isCompanyDriverPlaceholder('Agape Care Medical Transportation Inc.')).toBe(true);
    expect(resolveTripDriverName({ driverName: 'Agape Care Medical Transportation Inc.' }, [])).toBe('');
  });
});
