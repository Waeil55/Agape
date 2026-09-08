export const AUTH_PROFILE_SERVER_TIMEOUT_MS = 12000;
export const AUTH_PROFILE_CACHE_TIMEOUT_MS = 1200;
export const AUTH_LOADING_RECOVERY_DELAY_MS = 8000;
export const AUTH_WATCHDOG_TIMEOUT_MS = 30000;

const normalizedErrorCode = (result) => String(result?.error?.code || result?.error?.name || '')
  .trim()
  .toLowerCase();

export function isRecoverableAuthVerificationFailure(result) {
  if (!result || result.ok) return false;
  if (result.timeout) return true;

  const code = normalizedErrorCode(result);
  return [
    'aborted',
    'deadline-exceeded',
    'network-request-failed',
    'resource-exhausted',
    'unavailable',
  ].some((candidate) => code.includes(candidate));
}

export function getAuthVerificationIssue(result) {
  if (result?.timeout) {
    return 'Account verification is taking longer than expected. Your sign-in is preserved; retry when the connection is stable.';
  }

  if (isRecoverableAuthVerificationFailure(result)) {
    return 'Account verification is temporarily unavailable. Your sign-in is preserved; retry when the connection is stable.';
  }

  return 'Account access could not be verified. No workspace data was opened; contact an administrator if this continues.';
}

export function getLoginFailurePresentation(error) {
  const code = String(error?.code || error?.name || '').trim().toLowerCase();
  if (code.includes('network-request-failed') || code.includes('timeout')) {
    return {
      clearPassword: false,
      message: 'The login service could not be reached. Check the connection and retry; you do not need to close the app.',
    };
  }
  if (code.includes('too-many-requests')) {
    return {
      clearPassword: true,
      message: 'Login is temporarily limited after repeated attempts. Wait briefly, then try once.',
    };
  }
  if (
    code.includes('invalid-credential')
    || code.includes('wrong-password')
    || code.includes('user-not-found')
    || code.includes('invalid-email')
  ) {
    return { clearPassword: true, message: 'The username or password is incorrect.' };
  }
  if (code.includes('user-disabled')) {
    return { clearPassword: true, message: 'This account is disabled. Contact an administrator.' };
  }
  return {
    clearPassword: true,
    message: 'Login could not be completed. Retry once; if it continues, contact an administrator.',
  };
}
