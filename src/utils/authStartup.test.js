import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AUTH_LOADING_RECOVERY_DELAY_MS,
  AUTH_PROFILE_SERVER_TIMEOUT_MS,
  getAuthVerificationIssue,
  isRecoverableAuthVerificationFailure,
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
});
