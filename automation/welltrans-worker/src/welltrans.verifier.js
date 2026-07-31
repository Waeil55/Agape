import { createHash } from 'node:crypto';

export const CORRECTABLE_FIELDS = Object.freeze([
  'pickup.Driver',
  'pickup.Vehicle',
  'pickup.Arrival Time',
  'pickup.Departure Time',
  'pickup.Mileage/Odometer',
  'pickup.Signature Captured?',
  'dropoff.Driver',
  'dropoff.Vehicle',
  'dropoff.Arrival Time',
  'dropoff.Departure Time',
  'dropoff.Mileage/Odometer',
  'dropoff.Signature Captured?',
]);

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
};

export const verificationFingerprint = value => createHash('sha256')
  .update(JSON.stringify(stable(value)))
  .digest('hex');

const normalizedBooking = value => String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();
const fieldKey = observation => `${String(observation.row || '').toLowerCase()}.${observation.column}`;
const signedCommandEnvelope = command => ({
  schemaVersion: command.schemaVersion,
  action: command.action,
  provider: command.provider,
  logId: command.logId,
  tripId: command.tripId,
  bookingId: command.bookingId,
  serviceDate: command.serviceDate,
  reviewSessionId: command.reviewSessionId,
  sourceFingerprint: command.sourceFingerprint,
  fields: command.fields,
  evidenceFingerprint: command.evidenceFingerprint,
});

export function buildVerificationDecision({
  logId,
  tripId,
  payload,
  sourceFingerprint,
  stagedSourceFingerprint,
  reviewSessionId,
  portalAudit,
}) {
  const blockers = [];
  if (!payload?.bookingId || normalizedBooking(portalAudit?.bookingId) !== normalizedBooking(payload.bookingId)) {
    blockers.push('Exact Booking ID verification failed');
  }
  if (portalAudit?.selectedDate !== payload?.serviceDate) blockers.push('Service date verification failed');
  if (portalAudit?.pickupRows !== 1 || portalAudit?.dropoffRows !== 1) {
    blockers.push('Exactly one Pickup and one Dropoff row are required');
  }
  if (!reviewSessionId) blockers.push('A live review session is required');
  const sourceChanged = Boolean(stagedSourceFingerprint && stagedSourceFingerprint !== sourceFingerprint);
  const observations = Array.isArray(portalAudit?.observations) ? portalAudit.observations : [];
  const mismatches = observations.filter(item => item.matched === false);
  const unsupported = mismatches.filter(item => !CORRECTABLE_FIELDS.includes(fieldKey(item)));
  if (unsupported.length) blockers.push(`Unsupported correction field: ${unsupported.map(fieldKey).join(', ')}`);
  if (!observations.length && portalAudit?.verified !== true) blockers.push('Structured portal evidence is unavailable');

  const correctionFields = sourceChanged
    ? CORRECTABLE_FIELDS.filter(key => key !== 'pickup.Vehicle' && key !== 'dropoff.Vehicle')
    : mismatches.map(fieldKey);
  const status = blockers.length
    ? 'blocked'
    : ((sourceChanged || correctionFields.length) ? 'correction_required' : 'verified');
  const evidence = {
    provider: 'welltrans', verifierVersion: '1.0.0', logId, tripId,
    bookingId: String(payload?.bookingId || ''), serviceDate: payload?.serviceDate || '',
    sourceFingerprint, stagedSourceFingerprint: stagedSourceFingerprint || null,
    reviewSessionId, sourceChanged, observations, blockers,
  };
  const evidenceFingerprint = verificationFingerprint(evidence);
  const command = status === 'correction_required' ? {
    schemaVersion: 1,
    action: 'restage_authoritative_fields',
    provider: 'welltrans',
    logId,
    tripId,
    bookingId: evidence.bookingId,
    serviceDate: evidence.serviceDate,
    reviewSessionId,
    sourceFingerprint,
    fields: [...new Set(correctionFields)].sort(),
    evidenceFingerprint,
  } : null;
  if (command) command.commandFingerprint = verificationFingerprint(signedCommandEnvelope(command));
  return { status, evidence, evidenceFingerprint, command };
}

export function validateCorrectionCommand(command, {
  logId, tripId, payload, sourceFingerprint, reviewSessionId,
}) {
  if (!command || command.schemaVersion !== 1 || command.action !== 'restage_authoritative_fields') {
    throw new Error('Correction command schema is invalid');
  }
  const suppliedFingerprint = command.commandFingerprint;
  if (verificationFingerprint(signedCommandEnvelope(command)) !== suppliedFingerprint) {
    throw new Error('Correction command integrity check failed');
  }
  if (command.logId !== logId || command.tripId !== tripId) throw new Error('Correction command target does not match the claimed job');
  if (normalizedBooking(command.bookingId) !== normalizedBooking(payload.bookingId)) throw new Error('Correction command Booking ID does not match exactly');
  if (command.serviceDate !== payload.serviceDate) throw new Error('Correction command service date does not match');
  if (command.reviewSessionId !== reviewSessionId) throw new Error('Correction command belongs to a stale browser session');
  if (command.sourceFingerprint !== sourceFingerprint) throw new Error('Correction command source fingerprint is stale');
  if (!Array.isArray(command.fields) || !command.fields.length
    || command.fields.some(field => !CORRECTABLE_FIELDS.includes(field))) {
    throw new Error('Correction command contains an unauthorized field');
  }
  return true;
}
