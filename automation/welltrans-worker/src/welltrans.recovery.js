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
    action: 'hold_for_manual_review_reset',
    reason: 'rollback_unverified',
    retryBooking: completedAttempts < maxAttempts,
  };
}
