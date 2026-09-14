import { describe, expect, it } from 'vitest';
import {
  isWorkflowOverlayConfirmed,
  shouldApplyWorkflowOverlay,
} from './workflowOptimisticOverlay';

describe('driver workflow optimistic overlay', () => {
  it('allows a newer pending overlay while the durable trip render catches up', () => {
    expect(shouldApplyWorkflowOverlay(
      { status: 'Assigned', workflowUpdatedAt: '2026-09-14T12:00:00.000Z' },
      { status: 'In Progress', workflowUpdatedAt: '2026-09-14T12:00:01.000Z' },
    )).toBe(true);
  });

  it('rejects stale and equal overlays so they cannot resurrect old progress', () => {
    const trip = { status: 'At Pickup', workflowUpdatedAt: '2026-09-14T12:00:02.000Z' };
    expect(shouldApplyWorkflowOverlay(trip, { status: 'In Progress', workflowUpdatedAt: '2026-09-14T12:00:01.000Z' })).toBe(false);
    expect(shouldApplyWorkflowOverlay(trip, { status: 'At Pickup', workflowUpdatedAt: trip.workflowUpdatedAt })).toBe(false);
  });

  it('clears an overlay after timestamps or exact workflow fields confirm it', () => {
    expect(isWorkflowOverlayConfirmed(
      { status: 'At Pickup', workflowUpdatedAt: '2026-09-14T12:00:02.000Z' },
      { status: 'In Progress', workflowUpdatedAt: '2026-09-14T12:00:01.000Z' },
      ['pickupOdometer'],
    )).toBe(true);
    expect(isWorkflowOverlayConfirmed(
      { status: 'At Pickup', pickupOdometer: 12345 },
      { status: 'At Pickup', pickupOdometer: 12345 },
      ['pickupOdometer'],
    )).toBe(true);
  });
});
