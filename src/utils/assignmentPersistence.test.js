import { describe, expect, it } from 'vitest';
import { buildAssignmentMutations } from './assignmentPersistence';

const NOW = '2026-09-01T10:00:00.000Z';

describe('assignment global persistence', () => {
  it('publishes only the changed trip assignment', () => {
    const assignments = buildAssignmentMutations([
      { id: 'TRIP-1', status: 'Assigned', driverId: 'DRV-1', patient: 'Client' },
    ], [], 'agape-care', NOW);

    expect(assignments).toEqual([expect.objectContaining({
      id: 'trip_TRIP-1_DRV-1', tripId: 'TRIP-1', driverId: 'DRV-1', status: 'offered',
    })]);
  });

  it('closes the old assignment and opens the new one when a driver changes', () => {
    const previous = [{ id: 'TRIP-1', status: 'Assigned', driverId: 'DRV-1' }];
    const current = [{ id: 'TRIP-1', status: 'Assigned', driverId: 'DRV-2' }];
    const assignments = buildAssignmentMutations(current, previous, 'agape-care', NOW);

    expect(assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'trip_TRIP-1_DRV-1', status: 'cancelled', deliveryState: 'closed' }),
      expect.objectContaining({ id: 'trip_TRIP-1_DRV-2', status: 'offered', deliveryState: 'queued' }),
    ]));
  });

  it('closes the global assignment when a trip completes or is unassigned', () => {
    const previous = [{ id: 'TRIP-1', status: 'Assigned', driverId: 'DRV-1' }];
    const completed = buildAssignmentMutations(
      [{ id: 'TRIP-1', status: 'Completed', driverId: 'DRV-1' }],
      previous,
      'agape-care',
      NOW,
    );
    const unassigned = buildAssignmentMutations(
      [{ id: 'TRIP-1', status: 'Unassigned', driverId: '', driverEmail: null }],
      previous,
      'agape-care',
      NOW,
    );

    expect(completed).toEqual([expect.objectContaining({ status: 'cancelled' })]);
    expect(unassigned).toEqual([expect.objectContaining({ status: 'cancelled' })]);
  });

  it('does not reset an existing accepted assignment when ordinary trip details change', () => {
    const previous = [{ id: 'TRIP-1', status: 'Assigned', driverId: 'DRV-1', time: '10:00 AM' }];
    const current = [{ id: 'TRIP-1', status: 'Assigned', driverId: 'DRV-1', time: '10:15 AM' }];
    const [assignment] = buildAssignmentMutations(current, previous, 'agape-care', NOW);

    expect(assignment.tripSnapshot.time).toBe('10:15 AM');
    expect(assignment).not.toHaveProperty('status');
    expect(assignment).not.toHaveProperty('deliveryState');
    expect(assignment).not.toHaveProperty('offeredAtLocal');
  });
});
