export const AUTH_PROFILE_SERVER_TIMEOUT_MS = 12000;
export const AUTH_PROFILE_CACHE_TIMEOUT_MS = 1200;
export const AUTH_LOADING_RECOVERY_DELAY_MS = 8000;
export const AUTH_WATCHDOG_TIMEOUT_MS = 30000;
export const AUTH_OBSERVER_ACK_TIMEOUT_MS = 750;
export const AUTH_LOGIN_RETRY_DELAY_MS = 350;

function isTransientLoginFailure(error) {
  const code = String(error?.code || error?.name || '').trim().toLowerCase();
  return code.includes('network-request-failed') || code.includes('timeout');
}

/**
 * Retry a credential request once when the Firebase endpoint is temporarily
 * unreachable. Authentication/permission failures are never retried.
 */
export async function signInWithTransientRetry(
  operation,
  { maxAttempts = 2, retryDelayMs = AUTH_LOGIN_RETRY_DELAY_MS } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientLoginFailure(error) || attempt >= maxAttempts) throw error;
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  throw lastError;
}

/**
 * Firebase can resolve a repeated sign-in for an already-restored user without
 * emitting another auth-state event. Bound the normal observer handoff so the
 * caller can re-subscribe deterministically instead of requiring a page reload.
 */
export async function waitForMatchingAuthObserver(
  observerPromise,
  expectedUid,
  timeoutMs = AUTH_OBSERVER_ACK_TIMEOUT_MS,
) {
  let timeoutId;
  try {
    const observedUid = await Promise.race([
      Promise.resolve(observerPromise),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return Boolean(expectedUid) && String(observedUid || '') === String(expectedUid);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

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
