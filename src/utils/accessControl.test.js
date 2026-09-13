import { describe, it, expect } from 'vitest';
import {
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
