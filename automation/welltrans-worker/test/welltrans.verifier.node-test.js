import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVerificationDecision,
  validateCorrectionCommand,
} from '../src/welltrans.verifier.js';

const payload = {
  bookingId: '107433162', serviceDate: '2026-07-27',
  driver: 'Mikhaeil Waeil', pickup: {}, dropoff: {},
};
const base = {
  logId: 'log-1', tripId: 'trip-1', payload,
  sourceFingerprint: 'source-a', stagedSourceFingerprint: 'source-a',
  reviewSessionId: 'session-1',
};

test('independent verifier issues a scoped integrity-bound correction', () => {
  const decision = buildVerificationDecision({
    ...base,
    portalAudit: {
      bookingId: payload.bookingId, selectedDate: payload.serviceDate,
      pickupRows: 1, dropoffRows: 1, verified: false,
      observations: [
        { row: 'pickup', column: 'Arrival Time', expected: '13:27', actual: '', matched: false },
        { row: 'dropoff', column: 'Driver', expected: 'Mikhaeil Waeil', actual: '', matched: false },
      ],
    },
  });
  assert.equal(decision.status, 'correction_required');
  assert.deepEqual(decision.command.fields, ['dropoff.Driver', 'pickup.Arrival Time']);
  assert.equal(validateCorrectionCommand({
    ...decision.command, status: 'pending', verificationRunId: 'run-1',
  }, base), true);
});

test('independent verifier blocks ambiguous booking rows', () => {
  const decision = buildVerificationDecision({
    ...base,
    portalAudit: {
      bookingId: payload.bookingId, selectedDate: payload.serviceDate,
      pickupRows: 2, dropoffRows: 1, verified: false, observations: [],
    },
  });
  assert.equal(decision.status, 'blocked');
  assert.equal(decision.command, null);
});

test('tampered and stale correction commands fail closed', () => {
  const decision = buildVerificationDecision({
    ...base,
    portalAudit: {
      bookingId: payload.bookingId, selectedDate: payload.serviceDate,
      pickupRows: 1, dropoffRows: 1, verified: false,
      observations: [{ row: 'pickup', column: 'Driver', expected: 'Mikhaeil Waeil', actual: '', matched: false }],
    },
  });
  assert.throws(() => validateCorrectionCommand(
    { ...decision.command, fields: ['pickup.Medical Diagnosis'] }, base,
  ), /integrity check failed/);
  assert.throws(() => validateCorrectionCommand(decision.command, {
    ...base, reviewSessionId: 'new-session',
  }), /stale browser session/);
});

test('an exact independent read-back produces no correction command', () => {
  const decision = buildVerificationDecision({
    ...base,
    portalAudit: {
      bookingId: payload.bookingId, selectedDate: payload.serviceDate,
      pickupRows: 1, dropoffRows: 1, verified: true,
      observations: [{ row: 'pickup', column: 'Driver', expected: 'Mikhaeil Waeil', actual: 'Mikhaeil Waeil', matched: true }],
    },
  });
  assert.equal(decision.status, 'verified');
  assert.equal(decision.command, null);
});
