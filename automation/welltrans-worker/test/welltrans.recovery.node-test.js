import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPortalClosedError,
  REVIEW_SESSION_RESTART_EXIT_CODE,
  recoveryDecision,
} from '../src/welltrans.recovery.js';

test('browser closure is an interruption instead of a trip failure', () => {
  assert.equal(
    isPortalClosedError(new Error('locator.count: Target page, context or browser has been closed')),
    true,
  );
  assert.equal(isPortalClosedError(new Error('Arrival Time did not commit')), false);
});

test('verified work continues in the current review session', () => {
  assert.equal(recoveryDecision({ success: true }).action, 'continue');
});

test('a proven rollback continues without discarding prior staged work', () => {
  assert.deepEqual(recoveryDecision({ success: false, safeToContinue: true }), {
    action: 'continue',
    reason: 'rollback_verified',
  });
});

test('an unverified rollback automatically abandons the unsafe browser session', () => {
  assert.deepEqual(recoveryDecision({ success: false, safeToContinue: false }), {
    action: 'restart_clean_session',
    reason: 'rollback_unverified',
    exitCode: REVIEW_SESSION_RESTART_EXIT_CODE,
    retryBooking: true,
  });
});

test('the rollback circuit breaker stops retrying a persistently unsafe booking', () => {
  assert.equal(
    recoveryDecision(
      { success: false, safeToContinue: false },
      { completedAttempts: 2, maxAttempts: 2 },
    ).retryBooking,
    false,
  );
});
