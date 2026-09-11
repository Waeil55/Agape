import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_LOADING_RECOVERY_DELAY_MS,
  AUTH_OBSERVER_ACK_TIMEOUT_MS,
  AUTH_PROFILE_SERVER_TIMEOUT_MS,
  getAuthVerificationIssue,
  getLoginFailurePresentation,
  isRecoverableAuthVerificationFailure,
  signInWithTransientRetry,
  waitForMatchingAuthObserver,
} from './authStartup';

describe('authentication startup recovery', () => {
  it('allows realistic mobile startup time before presenting recovery actions', () => {
    expect(AUTH_LOADING_RECOVERY_DELAY_MS).toBeGreaterThanOrEqual(8000);
    expect(AUTH_PROFILE_SERVER_TIMEOUT_MS).toBeGreaterThan(AUTH_LOADING_RECOVERY_DELAY_MS);
  });

  it('keeps the authenticated session when Firestore is slow or temporarily unavailable', () => {
    const timeout = { ok: false, timeout: true };
    const unavailable = { ok: false, error: { code: 'firestore/unavailable' } };

    expect(isRecoverableAuthVerificationFailure(timeout)).toBe(true);
    expect(isRecoverableAuthVerificationFailure(unavailable)).toBe(true);
    expect(getAuthVerificationIssue(timeout)).toContain('sign-in is preserved');
    expect(getAuthVerificationIssue(timeout)).not.toContain('sign in again');
  });

  it('fails closed with a precise message for authorization failures', () => {
    const denied = { ok: false, error: { code: 'firestore/permission-denied' } };

    expect(isRecoverableAuthVerificationFailure(denied)).toBe(false);
    expect(getAuthVerificationIssue(denied)).toContain('No workspace data was opened');
  });

  it('uses cached profile recovery and never converts a short timeout into forced sign-in', () => {
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

    expect(app).toContain('getDocFromCache(userProfileRef)');
    expect(app).toContain('AUTH_PROFILE_SERVER_TIMEOUT_MS');
    expect(app).toContain('pauseBootForRetry(userDocResult)');
    expect(app).toContain('onClick={retryStartupSession}');
    expect(app).not.toContain('user profile retry');
    expect(app).not.toContain('Could not reach the server. Check your connection and sign in again.');
  });

  it('keeps credentials available for a network retry without telling the user to close the app', () => {
    const failure = getLoginFailurePresentation({ code: 'auth/network-request-failed' });

    expect(failure.clearPassword).toBe(false);
    expect(failure.message).toContain('do not need to close the app');
  });

  it('retries one transient login network failure and returns the successful credential', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ code: 'auth/network-request-failed' })
      .mockResolvedValueOnce({ user: { uid: 'driver-1' } });

    await expect(signInWithTransientRetry(operation, { retryDelayMs: 0 }))
      .resolves.toEqual({ user: { uid: 'driver-1' } });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry invalid credentials', async () => {
    const operation = vi.fn().mockRejectedValue({ code: 'auth/invalid-credential' });

    await expect(signInWithTransientRetry(operation, { retryDelayMs: 0 }))
      .rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('uses one local-first persistence authority and blocks overlapping sign-ins', () => {
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    const firebase = readFileSync(new URL('../config/firebase.js', import.meta.url), 'utf8');

    expect(firebase).toContain('persistence: [browserLocalPersistence, browserSessionPersistence]');
    expect(app).not.toContain('await setPersistence(auth');
    expect(app).toContain('if (loginInProgressRef.current) return;');
    expect(app).not.toContain('Session went null after boot — waiting 5s');
    expect(app).toContain('disabled={loginSubmitting}');
  });

  it('acknowledges the matching Firebase auth event and times out a missing event', async () => {
    await expect(waitForMatchingAuthObserver(
      Promise.resolve('user-1'),
      'user-1',
      AUTH_OBSERVER_ACK_TIMEOUT_MS,
    )).resolves.toBe(true);
    await expect(waitForMatchingAuthObserver(Promise.resolve('user-2'), 'user-1', 5))
      .resolves.toBe(false);
    await expect(waitForMatchingAuthObserver(new Promise(() => {}), 'user-1', 5))
      .resolves.toBe(false);
  });

  it('re-subscribes after a successful login when Firebase omits a repeated-user event', () => {
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

    expect(app).toContain('waitForMatchingAuthObserver(');
    expect(app).toContain('!observerHandledLogin && auth.currentUser?.uid === credential.user.uid');
    expect(app).toContain('setAuthBootAttempt((attempt) => attempt + 1)');
  });
});
