import { describe, expect, it } from 'vitest';
import { getTripActionCapabilities } from './tripActionPolicy';

const trip = (status = 'Assigned') => ({ id: 't1', status });

describe('mobile trip action policy', () => {
  it('keeps driver execution separate from assignment and archive controls', () => {
    expect(getTripActionCapabilities({ role: 'driver', trip: trip(), hasAssignedDriver: true })).toMatchObject({
      canOpenWorkflow: true,
      canCommunicate: true,
      canAssign: false,
      canReassign: false,
      canArchive: false,
      canCreate: false,
      canUpload: false,
      canEdit: false,
      canMarkException: false,
      canReportWorkflowException: true,
      canRequestTransfer: true,
      canShowInlineNavigation: false,
    });
  });

  it('gives dispatch operational controls without admin-only restore', () => {
    expect(getTripActionCapabilities({ role: 'dispatcher', trip: trip(), hasAssignedDriver: true })).toMatchObject({
      canOpenWorkflow: true,
      canCommunicate: true,
      canAssign: true,
      canReassign: true,
      canArchive: true,
      canCreate: true,
      canUpload: true,
      canEdit: true,
      canMarkException: true,
      canRestore: false,
      canShowInlineNavigation: false,
    });
  });

  it('reserves restore for admin and fails closed for unknown roles', () => {
    expect(getTripActionCapabilities({ role: 'admin', trip: trip('Completed'), hasAssignedDriver: true })).toMatchObject({
      canOpenWorkflow: true,
      canAssign: false,
      canReassign: false,
      canArchive: true,
      canEdit: false,
      canMarkException: false,
      canRestore: true,
    });
    expect(getTripActionCapabilities({ role: 'unknown', trip: trip(), hasAssignedDriver: true })).toMatchObject({
      canOpenWorkflow: false,
      canCommunicate: false,
      canAssign: false,
      canArchive: false,
      canEdit: false,
    });
  });

  it('does not open a workflow for an unassigned trip', () => {
    expect(getTripActionCapabilities({ role: 'admin', trip: trip(), hasAssignedDriver: false }).canOpenWorkflow).toBe(false);
    expect(getTripActionCapabilities({ role: 'driver', trip: trip(), hasAssignedDriver: false }).canOpenWorkflow).toBe(false);
  });

  it.each(['completed', 'Canceled', 'no_show', 'Transferred'])(
    'normalizes the legacy terminal status %s',
    (status) => {
      expect(getTripActionCapabilities({ role: 'dispatcher', trip: trip(status), hasAssignedDriver: true })).toMatchObject({
        isTerminal: true,
        canAssign: false,
        canEdit: false,
        canMarkException: false,
      });
    }
  );
});
