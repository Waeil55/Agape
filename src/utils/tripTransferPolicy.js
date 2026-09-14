const normalize = (value) => String(value || '').trim();
const normalizeEmail = (value) => normalize(value).toLowerCase();
const normalizeStatus = (value) => normalize(value).toLowerCase();

const RESUMABLE_TRANSFER_STATUSES = new Map([
  ['assigned', 'Assigned'],
  ['in mission', 'In Mission'],
  ['en route', 'En Route'],
  ['in progress', 'In Progress'],
  ['navigating pickup', 'Navigating Pickup'],
  ['at pickup', 'At Pickup'],
  ['in transit', 'In Transit'],
  ['navigating dropoff', 'Navigating Dropoff'],
  ['at dropoff', 'At Dropoff'],
  ['arrived', 'Arrived'],
]);

const DECISION_FIELDS = new Set([
  'driverId', 'driverEmail', 'driverName', 'transferStatus', 'transferRequest',
]);

export function getTransferReturnStatus(request = {}) {
  return RESUMABLE_TRANSFER_STATUSES.get(normalizeStatus(request.previousStatus)) || 'Assigned';
}

export function isPendingTripTransferRecipient({ trip, currentUser = '', driverIds = [] } = {}) {
  const request = trip?.transferRequest;
  if (!request || normalizeStatus(request.status) !== 'pending') return false;
  const targetEmail = normalizeEmail(request.toDriverEmail);
  const userEmail = normalizeEmail(currentUser);
  const knownIds = new Set((driverIds || []).map(normalize).filter(Boolean));
  const targetId = normalize(request.toDriverId);
  // A caller with multiple candidate profile IDs is ambiguous. Reconcile the
  // duplicate profiles rather than accepting whichever ID happens to match.
  if (knownIds.size !== 1) return false;
  const idMatches = !targetId || knownIds.has(targetId);
  const emailMatches = !targetEmail || (userEmail && targetEmail === userEmail);
  return Boolean((targetId || targetEmail) && idMatches && emailMatches);
}

function preservesOriginalTransferRequest(original, decision) {
  if (!original || !decision || typeof decision !== 'object' || Array.isArray(decision)) return false;
  const mutable = new Set(['status', 'decidedAt', 'decidedBy']);
  const originalKeys = Object.keys(original).filter((key) => !mutable.has(key)).sort();
  const decisionKeys = Object.keys(decision).filter((key) => !mutable.has(key)).sort();
  if (JSON.stringify(originalKeys) !== JSON.stringify(decisionKeys)) return false;
  return originalKeys.every((key) => JSON.stringify(original[key]) === JSON.stringify(decision[key]));
}

// A transfer recipient is temporarily allowed to touch a trip they do not yet
// own, but only for one exact accept/decline mutation. This prevents that
// temporary grant from becoming a general workflow/odometer/edit permission.
export function isValidTripTransferDecision({
  trip,
  currentUser = '',
  selfDriver = null,
  status,
  extraData = {},
} = {}) {
  const selfId = normalize(selfDriver?.id);
  const userEmail = normalizeEmail(currentUser);
  const selfEmail = normalizeEmail(selfDriver?.email);
  if (!selfId || !userEmail || (selfEmail && selfEmail !== userEmail)) return false;
  if (!isPendingTripTransferRecipient({ trip, currentUser, driverIds: selfId ? [selfId] : [] })) return false;
  if (normalizeStatus(trip?.status) !== 'transferred') return false;
  if (!extraData || typeof extraData !== 'object' || Array.isArray(extraData)) return false;
  if (Object.keys(extraData).some((key) => !DECISION_FIELDS.has(key))) return false;

  const original = trip.transferRequest;
  const decision = extraData.transferRequest;
  const outcome = normalizeStatus(decision?.status);
  if (!['accepted', 'declined'].includes(outcome)) return false;
  if (normalizeStatus(extraData.transferStatus) !== outcome) return false;
  if (!normalize(decision.decidedAt) || normalizeEmail(decision.decidedBy) !== userEmail) return false;
  if (!preservesOriginalTransferRequest(original, decision)) return false;
  if (normalizeStatus(status) !== normalizeStatus(getTransferReturnStatus(original))) return false;

  if (outcome === 'declined') {
    return !Object.prototype.hasOwnProperty.call(extraData, 'driverId')
      && !Object.prototype.hasOwnProperty.call(extraData, 'driverEmail')
      && !Object.prototype.hasOwnProperty.call(extraData, 'driverName');
  }

  const assignedId = normalize(extraData.driverId);
  const assignedEmail = normalizeEmail(extraData.driverEmail);
  return Boolean(
    selfId
    && assignedId === selfId
    && assignedEmail
    && assignedEmail === userEmail,
  );
}
