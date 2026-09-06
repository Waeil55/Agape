const crypto = require('crypto');

const CONFIRM_WORDS = ['yes', 'yea', 'yep', 'sure', 'confirm', 'confirmed', 'coming', '1', 'ok', 'okay'];
const DENY_WORDS = ['no', 'nah', 'nope', 'cancel', 'not coming', 'not', '0', 'stop'];
const CONFIRMATION_VALUES = new Set(['confirmed', 'not_coming']);

function parseConfirmation(text) {
  const normalized = String(text || '').trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (CONFIRM_WORDS.some((word) => normalized === word || normalized.startsWith(`${word} `))) return 'confirmed';
  if (DENY_WORDS.some((word) => normalized === word || normalized.startsWith(`${word} `))) return 'not_coming';
  return null;
}

function verifyTelnyxSignature({
  publicKey,
  signature,
  timestamp,
  payload,
  nowMs = Date.now(),
}) {
  if (!publicKey || !signature || !timestamp || !payload) return false;
  try {
    const timestampValue = Number(timestamp);
    const timestampMs = timestampValue > 1e12 ? timestampValue : timestampValue * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > 5 * 60 * 1000) return false;

    const publicKeyMaterial = String(publicKey).trim();
    let keyObject;
    if (publicKeyMaterial.includes('BEGIN PUBLIC KEY')) {
      keyObject = crypto.createPublicKey(publicKeyMaterial);
    } else {
      const rawKey = Buffer.from(
        publicKeyMaterial,
        /^[0-9a-f]{64}$/i.test(publicKeyMaterial) ? 'hex' : 'base64',
      );
      const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
      keyObject = crypto.createPublicKey({
        key: rawKey.length === 32 ? Buffer.concat([spkiPrefix, rawKey]) : rawKey,
        format: 'der',
        type: 'spki',
      });
    }

    const signedPayload = Buffer.from(`${timestamp}|${payload}`, 'utf8');
    return crypto.verify(null, signedPayload, keyObject, Buffer.from(signature, 'base64'));
  } catch (_error) {
    return false;
  }
}

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `***${digits.slice(-4)}` : '';
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

function resolveCanonicalClientPhone(trip = {}) {
  if (trip.phoneNeedsReview === true) return '';
  const candidates = [
    trip.clientPhone,
    trip.patientPhone,
    trip.patientMobile,
    trip.memberPhone,
    trip.riderPhone,
  ];
  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function driverOwnsTrip({ trip = {}, actor = {}, uid = '', tokenEmail = '' }) {
  const actorIds = new Set([
    uid,
    actor.id,
    actor.profileId,
    actor.driverId,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
  const assignedIds = [
    trip.driverId,
    trip.assignedDriverId,
    trip.driverProfileId,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (assignedIds.some((value) => actorIds.has(value))) return true;

  const actorEmails = new Set([
    tokenEmail,
    actor.email,
    actor.driverEmail,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
  const assignedEmails = [
    trip.driverEmail,
    trip.assignedDriverEmail,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  return assignedEmails.some((value) => actorEmails.has(value));
}

function validateDriverSmsAccess({ trip = {}, actor = {}, uid = '', tokenEmail = '', recipient = '' }) {
  if (!driverOwnsTrip({ trip, actor, uid, tokenEmail })) {
    return { allowed: false, reason: 'trip_not_assigned', clientPhone: '' };
  }
  if (actor.tenantId && trip.tenantId && actor.tenantId !== trip.tenantId) {
    return { allowed: false, reason: 'tenant_mismatch', clientPhone: '' };
  }
  const clientPhone = resolveCanonicalClientPhone(trip);
  if (!clientPhone) {
    return { allowed: false, reason: 'client_phone_unverified', clientPhone: '' };
  }
  if (normalizePhone(recipient) !== clientPhone) {
    return { allowed: false, reason: 'recipient_not_client', clientPhone };
  }
  return { allowed: true, reason: '', clientPhone };
}

function buildInboundSmsLog({ from, to, text, messageId, eventType, timestamp }) {
  return {
    direction: 'inbound',
    from,
    to,
    text,
    messageId,
    eventType: eventType || 'message.received',
    timestamp,
  };
}

async function updateTripConfirmationById({
  db,
  tripId,
  confirmation,
  serverTimestamp,
  nowIso = new Date().toISOString(),
}) {
  const safeTripId = String(tripId || '').trim();
  if (!safeTripId || !CONFIRMATION_VALUES.has(confirmation)) return false;
  const tripRef = db.doc(`trips/${safeTripId}`);
  const snapshot = await tripRef.get();
  if (!snapshot.exists) return false;
  await tripRef.set({
    clientConfirmation: confirmation,
    clientConfirmationSource: 'telnyx_inbound_sms',
    clientConfirmationUpdatedAt: serverTimestamp,
    workflowUpdatedAt: nowIso,
    updatedAtLocal: nowIso,
  }, { merge: true });
  return true;
}

module.exports = {
  buildInboundSmsLog,
  driverOwnsTrip,
  maskPhone,
  normalizePhone,
  parseConfirmation,
  resolveCanonicalClientPhone,
  updateTripConfirmationById,
  validateDriverSmsAccess,
  verifyTelnyxSignature,
};
