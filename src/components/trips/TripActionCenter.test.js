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

  it('does not expose edit, assign, archive, or restore to a driver', () => {
    const actions = buildTripActionModel({ trip: { id: 't1', status: 'Assigned' }, role: 'driver', callbacks });
    expect(actions.map((action) => action.id)).toEqual(['view']);
  });

  it('does not offer driving for terminal trips', () => {
    const actions = buildTripActionModel({ trip: { id: 't1', status: 'Completed' }, role: 'admin', callbacks });
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
});
