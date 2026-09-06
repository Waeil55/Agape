const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  buildInboundSmsLog,
  driverOwnsTrip,
  maskPhone,
  normalizePhone,
  parseConfirmation,
  resolveCanonicalClientPhone,
  updateTripConfirmationById,
  validateDriverSmsAccess,
  verifyTelnyxSignature,
} = require('./telnyxWebhook');

test('confirmation parsing is deterministic', () => {
  assert.equal(parseConfirmation('Yes, I am coming'), 'confirmed');
  assert.equal(parseConfirmation('NO - cancel it'), 'not_coming');
  assert.equal(parseConfirmation('Please call me'), null);
});

test('Telnyx verification fails closed without configuration and accepts a valid signature', () => {
  const payload = JSON.stringify({ data: { event_type: 'message.received' } });
  const nowMs = Date.parse('2026-09-06T12:00:00.000Z');
  const timestamp = String(Math.floor(nowMs / 1000));
  assert.equal(verifyTelnyxSignature({ signature: 'anything', timestamp, payload, nowMs }), false);

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const signedPayload = Buffer.from(`${timestamp}|${payload}`, 'utf8');
  const signature = crypto.sign(null, signedPayload, privateKey).toString('base64');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  assert.equal(verifyTelnyxSignature({ publicKey: publicKeyPem, signature, timestamp, payload, nowMs }), true);
  assert.equal(verifyTelnyxSignature({ publicKey: publicKeyPem, signature, timestamp: '1', payload, nowMs }), false);
});

test('inbound log stores only the operational fields and omits the raw webhook body', () => {
  const log = buildInboundSmsLog({
    from: '+13175550101',
    to: '+13175550102',
    text: 'Yes',
    messageId: 'message-1',
    eventType: 'message.received',
    timestamp: 'server-time',
  });
  assert.deepEqual(Object.keys(log).sort(), [
    'direction', 'eventType', 'from', 'messageId', 'text', 'timestamp', 'to',
  ]);
  assert.equal(Object.hasOwn(log, 'raw'), false);
  assert.equal(maskPhone('+1 (317) 555-0101'), '***0101');
  assert.equal(normalizePhone('(317) 555-0101'), '+13175550101');
  assert.equal(normalizePhone('123'), '');
});

test('driver SMS access requires the assigned trip and its canonical client phone', () => {
  const trip = {
    driverId: 'driver-profile-1',
    driverEmail: 'driver@example.com',
    tenantId: 'agape-care',
    clientPhone: '(317) 555-0101',
    pickupPhone: '(317) 555-0199',
    hospitalPhone: '(317) 555-0188',
  };
  const actor = { profileId: 'driver-profile-1', tenantId: 'agape-care' };
  assert.equal(driverOwnsTrip({ trip, actor, uid: 'auth-1' }), true);
  assert.equal(resolveCanonicalClientPhone(trip), '+13175550101');
  assert.deepEqual(validateDriverSmsAccess({
    trip,
    actor,
    uid: 'auth-1',
    recipient: '+1 317 555 0101',
  }), { allowed: true, reason: '', clientPhone: '+13175550101' });
  assert.equal(validateDriverSmsAccess({
    trip,
    actor,
    uid: 'auth-1',
    recipient: trip.pickupPhone,
  }).reason, 'recipient_not_client');
  assert.equal(validateDriverSmsAccess({
    trip,
    actor: { profileId: 'another-driver', tenantId: 'agape-care' },
    uid: 'auth-2',
    recipient: trip.clientPhone,
  }).reason, 'trip_not_assigned');
});

test('driver SMS access fails closed for an unverified client phone or tenant mismatch', () => {
  const actor = { profileId: 'driver-1', tenantId: 'agape-care' };
  const baseTrip = { driverId: 'driver-1', tenantId: 'agape-care', clientPhone: '3175550101' };
  assert.equal(validateDriverSmsAccess({
    trip: { ...baseTrip, phoneNeedsReview: true },
    actor,
    recipient: baseTrip.clientPhone,
  }).reason, 'client_phone_unverified');
  assert.equal(validateDriverSmsAccess({
    trip: { ...baseTrip, tenantId: 'another-tenant' },
    actor,
    recipient: baseTrip.clientPhone,
  }).reason, 'tenant_mismatch');
});

test('confirmation updates the authoritative trip document and fails closed if it is missing', async () => {
  const writes = [];
  const db = {
    doc(path) {
      return {
        async get() { return { exists: path.endsWith('/trip-1') }; },
        async set(data, options) { writes.push({ path, data, options }); },
      };
    },
  };
  const updated = await updateTripConfirmationById({
    db,
    tripId: 'trip-1',
    confirmation: 'confirmed',
    serverTimestamp: 'server-time',
    nowIso: '2026-09-06T12:00:00.000Z',
  });
  assert.equal(updated, true);
  assert.deepEqual(writes[0], {
    path: 'trips/trip-1',
    data: {
      clientConfirmation: 'confirmed',
      clientConfirmationSource: 'telnyx_inbound_sms',
      clientConfirmationUpdatedAt: 'server-time',
      workflowUpdatedAt: '2026-09-06T12:00:00.000Z',
      updatedAtLocal: '2026-09-06T12:00:00.000Z',
    },
    options: { merge: true },
  });

  const missing = await updateTripConfirmationById({
    db,
    tripId: 'missing',
    confirmation: 'confirmed',
    serverTimestamp: 'server-time',
  });
  assert.equal(missing, false);
  assert.equal(writes.length, 1);
});
