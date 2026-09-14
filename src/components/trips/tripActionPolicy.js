import { isTerminalTripStatus, TERMINAL_TRIP_STATUSES } from '../../utils/tripLifecycle';

// One role policy for every trip-card entry point. Presentation components
// may choose where to place an allowed action, but they must not widen this
// matrix based on viewport or menu location.
export const TRIP_TERMINAL_STATUSES = TERMINAL_TRIP_STATUSES;

export function isTripActionTerminal(tripOrStatus) {
  const trip = tripOrStatus && typeof tripOrStatus === 'object' ? tripOrStatus : null;
  if (trip?.completedAt) return true;
  return isTerminalTripStatus(trip ? trip.status : tripOrStatus);
}

const OPERATING_ROLES = new Set(['admin', 'dispatcher', 'fleet_manager']);

export function getTripActionCapabilities({ role, trip, hasAssignedDriver = false } = {}) {
  const isDriver = role === 'driver';
  const isOperator = OPERATING_ROLES.has(role);
  const isTerminal = isTripActionTerminal(trip);

  return {
    isDriver,
    isOperator,
    isTerminal,
    canOpenWorkflow: Boolean(hasAssignedDriver) && (isDriver || isOperator),
    canCommunicate: isOperator || (isDriver && Boolean(hasAssignedDriver)),
    // A terminal trip is a historical record. Operators may review/archive it,
    // but must restore it before changing assignment, trip data, or outcome.
    canAssign: isOperator && !isTerminal,
    canReassign: isOperator && !isTerminal,
    canCreate: role === 'admin' || role === 'dispatcher',
    canUpload: role === 'admin' || role === 'dispatcher',
    canArchive: role === 'admin' || role === 'dispatcher',
    canEdit: isOperator && !isTerminal,
    canMarkException: isOperator && !isTerminal,
    // Drivers report operational outcomes only from their own active workflow;
    // these are intentionally distinct from operator manifest mutations.
    canReportWorkflowException: isDriver && !isTerminal,
    canRequestTransfer: isDriver && !isTerminal,
    canRestore: role === 'admin',
    // The compact manifest keeps route navigation in the progress workspace,
    // where the current pickup/dropoff phase is authoritative for every role.
    canShowInlineNavigation: false,
  };
}
