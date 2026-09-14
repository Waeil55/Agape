import { describe, it, expect } from 'vitest';
import {
  isDriverTripOwner,
  isTripInDispatcherScope,
  getUploadScopeForRole,
  isTripInUploadScope,
} from './accessControl';

const drivers = [
  { id: 'DRV-1', name: 'Ann', email: 'ann@x.com', assignedDispatcher: 'DSP-1' },
  { id: 'DRV-2', name: 'Bob', email: 'bob@x.com', assignedDispatcher: 'DSP-1' },
  { id: 'DRV-3', name: 'Cat', email: 'cat@x.com', assignedDispatcher: 'DSP-9' },
];
const dispatchers = [{ id: 'DSP-1', email: 'd1@x.com' }];

describe('getUploadScopeForRole — upload assignment contract', () => {
  it('admin may file for every driver with Unassigned allowed', () => {
    const scope = getUploadScopeForRole({ role: 'admin', currentUser: 'boss@x.com', drivers, dispatchers });
    expect(scope.allowedDrivers).toHaveLength(3);
    expect(scope.lockedDriverId).toBe('');
    expect(scope.allowUnassigned).toBe(true);
  });

  it('dispatcher may file only for assigned drivers', () => {
    const scope = getUploadScopeForRole({ role: 'dispatcher', currentUser: 'd1@x.com', drivers, dispatchers });
    expect(scope.allowedDrivers.map(d => d.id).sort()).toEqual(['DRV-1', 'DRV-2']);
    expect(scope.lockedDriverId).toBe('');
    expect(scope.allowUnassigned).toBe(true);
  });

  it('dispatcher with no assigned drivers gets an empty allow-list', () => {
    const scope = getUploadScopeForRole({ role: 'dispatcher', currentUser: 'nobody@x.com', drivers, dispatchers });
    expect(scope.allowedDrivers).toEqual([]);
  });

  it('driver is locked to exactly themselves via resolved profile', () => {
    const self = drivers[0];
    const scope = getUploadScopeForRole({ role: 'driver', currentUser: 'ann@x.com', drivers, dispatchers, selfDriver: self });
    expect(scope.allowedDrivers).toEqual([self]);
    expect(scope.lockedDriverId).toBe('DRV-1');
    expect(scope.allowUnassigned).toBe(false);
  });

  it('driver falls back to email match when no resolved profile', () => {
    const scope = getUploadScopeForRole({ role: 'driver', currentUser: 'BOB@x.com', drivers, dispatchers, selfDriver: null });
    expect(scope.lockedDriverId).toBe('DRV-2');
    expect(scope.allowedDrivers).toHaveLength(1);
  });

  it('driver with no matching profile is blocked, never guessed', () => {
    const scope = getUploadScopeForRole({ role: 'driver', currentUser: 'ghost@x.com', drivers, dispatchers, selfDriver: null });
    expect(scope.allowedDrivers).toEqual([]);
    expect(scope.lockedDriverId).toBe('');
    expect(scope.allowUnassigned).toBe(false);
  });

  it('blocks ambiguous duplicate-email profiles instead of picking the first', () => {
    const duplicate = { ...drivers[0], id: 'DRV-1-DUP' };
    const scope = getUploadScopeForRole({
      role: 'driver',
      currentUser: 'ann@x.com',
      drivers: [...drivers, duplicate],
      dispatchers,
      selfDriver: drivers[0],
    });
    expect(scope.allowedDrivers).toEqual([]);
    expect(scope.lockedDriverId).toBe('');
  });

  it('unknown roles get nothing (default deny)', () => {
    for (const role of ['billing', 'supervisor', 'qa_auditor', 'fleet_manager', '']) {
      const scope = getUploadScopeForRole({ role, currentUser: 'u@x.com', drivers, dispatchers });
      expect(scope.allowedDrivers).toEqual([]);
      expect(scope.allowUnassigned).toBe(false);
    }
  });

  it('tolerates missing driver/dispatcher lists', () => {
    const scope = getUploadScopeForRole({ role: 'admin', currentUser: 'a@x.com' });
    expect(scope.allowedDrivers).toEqual([]);
  });
});

describe('isTripInUploadScope — per-trip gate', () => {
  const dispatcherScope = getUploadScopeForRole({ role: 'dispatcher', currentUser: 'd1@x.com', drivers, dispatchers });

  it('allows assigned trips inside scope', () => {
    expect(isTripInUploadScope({ driverId: 'DRV-1' }, dispatcherScope)).toBe(true);
  });

  it('blocks assigned trips outside scope', () => {
    expect(isTripInUploadScope({ driverId: 'DRV-3' }, dispatcherScope)).toBe(false);
  });

  it('allows Unassigned when the scope permits it', () => {
    expect(isTripInUploadScope({ driverId: null }, dispatcherScope)).toBe(true);
    expect(isTripInUploadScope({}, dispatcherScope)).toBe(true);
  });

  it('blocks Unassigned for self-locked driver scope', () => {
    const scope = getUploadScopeForRole({ role: 'driver', currentUser: 'ann@x.com', drivers, dispatchers, selfDriver: drivers[0] });
    expect(isTripInUploadScope({ driverId: null }, scope)).toBe(false);
    expect(isTripInUploadScope({ driverId: 'DRV-1' }, scope)).toBe(true);
    expect(isTripInUploadScope({ driverId: 'DRV-2' }, scope)).toBe(false);
  });

  it('fails closed on missing trip or scope', () => {
    expect(isTripInUploadScope(null, dispatcherScope)).toBe(false);
    expect(isTripInUploadScope({ driverId: 'DRV-1' }, null)).toBe(false);
  });
});

describe('isTripInDispatcherScope — stored assignment boundary', () => {
  const scoped = drivers.slice(0, 2);

  it('supports legacy email assignment without treating it as unassigned', () => {
    expect(isTripInDispatcherScope({ driverEmail: 'BOB@x.com', status: 'Assigned' }, scoped)).toBe(true);
    expect(isTripInDispatcherScope({ driverEmail: 'cat@x.com', status: 'Assigned' }, scoped)).toBe(false);
  });

  it('requires ID and email assignment keys to identify the same scoped driver', () => {
    expect(isTripInDispatcherScope({ driverId: 'DRV-1', driverEmail: 'ann@x.com', status: 'Assigned' }, scoped)).toBe(true);
    expect(isTripInDispatcherScope({ driverId: 'DRV-1', driverEmail: 'bob@x.com', status: 'Assigned' }, scoped)).toBe(false);
    expect(isTripInDispatcherScope({ driverId: 'DRV-3', driverEmail: 'ann@x.com', status: 'Assigned' }, scoped)).toBe(false);
  });

  it('blocks ambiguous email-only assignments', () => {
    const duplicateScoped = [...scoped, { ...scoped[0], id: 'DRV-1-DUP' }];
    expect(isTripInDispatcherScope({ driverEmail: 'ann@x.com', status: 'Assigned' }, duplicateScoped)).toBe(false);
  });

  it('allows only genuinely unassigned trips without an identity', () => {
    expect(isTripInDispatcherScope({ status: 'Unassigned' }, scoped)).toBe(true);
    expect(isTripInDispatcherScope({ status: 'Assigned' }, scoped)).toBe(false);
  });
});

describe('isDriverTripOwner — workflow mutation boundary', () => {
  const self = drivers[0];

  it('accepts authoritative current and legacy active ID/email assignments', () => {
    expect(isDriverTripOwner({ driverId: 'DRV-1' }, 'ann@x.com', self)).toBe(true);
    expect(isDriverTripOwner({ assignedDriverId: 'DRV-1' }, 'ann@x.com', self)).toBe(true);
    expect(isDriverTripOwner({ driverEmail: 'ANN@x.com' }, 'ann@x.com', self)).toBe(true);
    expect(isDriverTripOwner({ assignedDriverEmail: 'ANN@x.com' }, 'ann@x.com', self)).toBe(true);
  });

  it('rejects name-only, historical, conflicting, and unresolved assignments', () => {
    expect(isDriverTripOwner({ driverName: 'Ann' }, 'ann@x.com', self)).toBe(false);
    expect(isDriverTripOwner({ completedDriverId: 'DRV-1', completedDriverEmail: 'ann@x.com' }, 'ann@x.com', self)).toBe(false);
    expect(isDriverTripOwner({ driverId: 'DRV-2', driverEmail: 'bob@x.com' }, 'ann@x.com', self)).toBe(false);
    expect(isDriverTripOwner({ driverId: 'DRV-1', driverEmail: 'bob@x.com' }, 'ann@x.com', self)).toBe(false);
    expect(isDriverTripOwner({ driverId: 'DRV-2', driverEmail: 'ann@x.com' }, 'ann@x.com', self)).toBe(false);
    expect(isDriverTripOwner({ driverId: 'DRV-1', assignedDriverId: 'DRV-2' }, 'ann@x.com', self)).toBe(false);
    expect(isDriverTripOwner({ driverEmail: 'ann@x.com', assignedDriverEmail: 'bob@x.com' }, 'ann@x.com', self)).toBe(false);
    expect(isDriverTripOwner({ driverId: 'DRV-1' }, 'bob@x.com', self)).toBe(false);
    expect(isDriverTripOwner({ driverId: 'DRV-1' }, '', self)).toBe(false);
    expect(isDriverTripOwner({ driverId: 'DRV-1' }, 'ann@x.com', { id: 'DRV-1' })).toBe(false);
    expect(isDriverTripOwner({ driverId: 'DRV-1' }, 'ann@x.com', null)).toBe(false);
  });
});
