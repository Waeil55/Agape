import { describe, expect, it, vi } from 'vitest';
import { buildTripActionModel } from './TripActionCenter';

const callbacks = {
  onView: vi.fn(), onDrive: vi.fn(), onAssign: vi.fn(), onSmartAssign: vi.fn(), onEdit: vi.fn(),
  onToggleInOut: vi.fn(), onReroute: vi.fn(), onNoShow: vi.fn(), onCancel: vi.fn(),
  onArchive: vi.fn(), onRestore: vi.fn(),
};

describe('trip action center permissions', () => {
  it('shows operational and destructive controls to administrators', () => {
    const actions = buildTripActionModel({ trip: { id: 't1', status: 'Assigned' }, driver: { name: 'Sam' }, role: 'admin', callbacks });
    expect(actions.map((action) => action.id)).toEqual(expect.arrayContaining([
      'view', 'drive', 'assign', 'smart-assign', 'edit', 'toggle-in-out',
      'reroute', 'no-show', 'cancel', 'archive', 'restore',
    ]));
  });

  it('lets a driver open assigned work without exposing operator controls', () => {
    const actions = buildTripActionModel({ trip: { id: 't1', status: 'Assigned' }, driver: { name: 'Sam' }, role: 'driver', callbacks });
    expect(actions.map((action) => action.id)).toEqual(['view', 'drive']);
  });

  it('opens terminal trips as progress review for assigned work', () => {
    const actions = buildTripActionModel({ trip: { id: 't1', status: 'Completed' }, driver: { name: 'Sam' }, role: 'admin', callbacks });
    expect(actions.find((action) => action.id === 'drive')?.label).toBe('Review trip progress');
    expect(actions.map((action) => action.id)).toEqual(['view', 'drive', 'restore', 'archive']);
  });

  it('does not offer a driver workspace until a driver is assigned', () => {
    const actions = buildTripActionModel({ trip: { id: 't1', status: 'Assigned' }, role: 'dispatcher', callbacks });
    expect(actions.some((action) => action.id === 'drive')).toBe(false);
  });

  it('does not expose archive to fleet managers', () => {
    const actions = buildTripActionModel({ trip: { id: 't1', status: 'Assigned' }, role: 'fleet_manager', callbacks });
    expect(actions.some((action) => action.id === 'archive')).toBe(false);
  });

  it('keeps phone actions available when the client number is resolved from a linked leg', () => {
    const actions = buildTripActionModel({
      trip: { id: 't1', status: 'Assigned' },
      role: 'admin',
      phone: '3175550100',
      callbacks: { onCall: vi.fn(), onMessage: vi.fn() },
    });
    expect(actions.map((action) => action.id)).toEqual(['call', 'message']);
  });

  it('does not expose navigation or communications to an unknown role', () => {
    const actions = buildTripActionModel({
      trip: { id: 't1', status: 'Assigned', pickup: '100 Main St' },
      driver: { name: 'Sam' },
      role: 'unknown',
      phone: '3175550100',
      callbacks: { onNavigate: vi.fn(), onCall: vi.fn(), onMessage: vi.fn() },
    });
    expect(actions).toEqual([]);
  });
});
