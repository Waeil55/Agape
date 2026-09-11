const crypto = require('crypto');

const CONFIRM_WORDS = ['yes', 'yea', 'yep', 'sure', 'confirm', 'confirmed', 'coming', '1', 'ok', 'okay'];
const DENY_WORDS = ['no', 'nah', 'nope', 'cancel', 'not coming', 'not', '0'];
const CONFIRMATION_VALUES = new Set(['confirmed', 'not_coming']);
const OPT_OUT_WORDS = new Set(['stop', 'unsubscribe', 'end', 'quit']);
const OPT_IN_WORDS = new Set(['start', 'unstop']);

function parseConfirmation(text) {
  const normalized = String(text || '').trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (CONFIRM_WORDS.some((word) => normalized === word || normalized.startsWith(`${word} `))) return 'confirmed';
  if (DENY_WORDS.some((word) => normalized === word || normalized.startsWith(`${word} `))) return 'not_coming';
  return null;
}

function parseSmsConsentAction(text) {
  const normalized = String(text || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (OPT_OUT_WORDS.has(normalized)) return 'opt_out';
  if (OPT_IN_WORDS.has(normalized)) return 'opt_in';
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

function smsConversationId(phone) {
  const normalized = normalizePhone(phone);
  return normalized ? crypto.createHash('sha256').update(normalized).digest('hex') : '';
}

function normalizeClientSmsText(value) {
  let text = Array.from(String(value || ''), (character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127
      ? ' '
      : character;
  }).join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (!/^agape care\b/i.test(text)) text = `Agape Care: ${text}`;
  if (!/\breply\s+stop\b/i.test(text)) text = `${text} Reply STOP to opt out.`;
  return text;
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

function buildInboundSmsLog({
  from,
  to,
  text,
  messageId,
  eventType,
  timestamp,
  conversationKey,
  tripId,
  tenantId,
  participantUserIds = [],
  consentAction,
}) {
  const log = {
    direction: 'inbound',
    from,
    to,
    text,
    messageId,
    eventType: eventType || 'message.received',
    timestamp,
  };
  if (conversationKey) log.conversationKey = conversationKey;
  if (tripId) log.tripId = tripId;
  if (tenantId) log.tenantId = tenantId;
  if (participantUserIds.length) log.participantUserIds = [...new Set(participantUserIds.filter(Boolean))];
  if (consentAction) log.consentAction = consentAction;
  return log;
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
  maskPhone,
  normalizePhone,
  normalizeClientSmsText,
  parseConfirmation,
  parseSmsConsentAction,
  resolveCanonicalClientPhone,
  smsConversationId,
  updateTripConfirmationById,
  verifyTelnyxSignature,
};
