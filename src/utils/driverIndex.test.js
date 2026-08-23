import { describe, expect, it } from 'vitest';
import { buildDriverIndex, findDriverInIndex } from './driverIndex';

describe('driverIndex', () => {
  const drivers = [
    { id: 'driver-1', uid: 'auth-1', name: 'Avery Reed', email: 'avery@example.com' },
    { id: 'driver-2', driverId: 'legacy-2', name: 'Jordan Lee', email: 'jordan@example.com' },
  ];

  it('matches exact normalized driver identifiers without scanning the driver list', () => {
    const index = buildDriverIndex(drivers);

    expect(findDriverInIndex(index, { driverId: ' DRIVER-1 ' })).toBe(drivers[0]);
    expect(findDriverInIndex(index, { driverId: 'legacy-2' })).toBe(drivers[1]);
    expect(findDriverInIndex(index, { driverEmail: 'JORDAN@EXAMPLE.COM' })).toBe(drivers[1]);
    expect(findDriverInIndex(index, { driverName: 'avery reed' })).toBe(drivers[0]);
  });

  it('falls back to an exact email or name only when a supplied id is not indexed', () => {
    const index = buildDriverIndex(drivers);

    expect(findDriverInIndex(index, {
      driverId: 'missing-id',
      driverEmail: 'avery@example.com',
    })).toBe(drivers[0]);
  });

  it('never treats a trip record id as a driver id', () => {
    const collision = { id: 'trip-123', name: 'Wrong Driver', email: 'wrong@example.com' };
    const expected = { id: 'driver-3', name: 'Right Driver', email: 'right@example.com' };
    const index = buildDriverIndex([collision, expected]);

    expect(findDriverInIndex(index, {
      id: 'trip-123',
      driverEmail: 'right@example.com',
    })).toBe(expected);
  });

  it('fails closed when an identity is duplicated', () => {
    const duplicateA = { id: 'a', name: 'Same Driver', email: 'shared@example.com' };
    const duplicateB = { id: 'b', name: 'same driver', email: 'SHARED@example.com' };
    const index = buildDriverIndex([duplicateA, duplicateB]);

    expect(findDriverInIndex(index, { driverEmail: 'shared@example.com' })).toBeNull();
    expect(findDriverInIndex(index, { driverName: 'Same Driver' })).toBeNull();
  });

  it('returns null for absent or incomplete identities', () => {
    const index = buildDriverIndex(drivers);

    expect(findDriverInIndex(index, {})).toBeNull();
    expect(findDriverInIndex(index, { driverId: 'unknown' })).toBeNull();
    expect(findDriverInIndex(null, { driverId: 'driver-1' })).toBeNull();
  });
});
