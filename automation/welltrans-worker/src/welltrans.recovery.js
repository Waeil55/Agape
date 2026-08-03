export const REVIEW_SESSION_RESTART_EXIT_CODE = 42;

export function isPortalClosedError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('target page, context or browser has been closed')
    || message.includes('page has been closed')
    || message.includes('browser has been closed')
    || message.includes('browser closed before');
}

export function recoveryDecision(outcome = {}, { completedAttempts = 1, maxAttempts = 2 } = {}) {
  if (outcome.success) return { action: 'continue', reason: 'verified' };
  if (outcome.safeToContinue === true) return { action: 'continue', reason: 'rollback_verified' };
  return {
    action: 'restart_clean_session',
    reason: 'rollback_unverified',
    exitCode: REVIEW_SESSION_RESTART_EXIT_CODE,
    retryBooking: completedAttempts < maxAttempts,
  };
}
