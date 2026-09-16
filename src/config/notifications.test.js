/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authMock, getTokenMock, getMessagingMock, onMessageMock } = vi.hoisted(() => ({
  authMock: { currentUser: null },
  getTokenMock: vi.fn(),
  getMessagingMock: vi.fn(() => ({})),
  onMessageMock: vi.fn(() => () => {}),
}));

vi.mock('../config/firebase', () => ({
  default: {},
  app: {},
  getMessaging: getMessagingMock,
  getToken: getTokenMock,
  onMessage: onMessageMock,
  db: {},
  auth: authMock,
  doc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ forEach: () => {} })),
}));

const { getFcmToken, isAuthCredentialFailure, requestNotificationPermission } = await import('../config/notifications');

describe('isAuthCredentialFailure', () => {
  it('detects the FCM 401 auth-credential message', () => {
    const error = new Error(
      'Messaging: A problem occurred while subscribing the user to FCM: Request is missing required authentication credential. Expected OAuth 2 access token, login cookie or other valid authentication credential.'
    );
    expect(isAuthCredentialFailure(error)).toBe(true);
  });

  it('does not misclassify transient failures', () => {
    expect(isAuthCredentialFailure(new Error('Network request failed'))).toBe(false);
    expect(isAuthCredentialFailure(new Error('Aborted'))).toBe(false);
  });
});

describe('getFcmToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never calls the fetch when no user is signed in', async () => {
    authMock.currentUser = null;
    const fetchToken = vi.fn(() => Promise.resolve('tok'));
    const store = { read: () => null, write: vi.fn() };
    const result = await getFcmToken(3, { fetchToken, store });
    expect(result).toBeNull();
    expect(fetchToken).not.toHaveBeenCalled();
  });

  it('fails fast on an auth-credential 401 instead of retrying', async () => {
    authMock.currentUser = { uid: 'u1' };
    const fetchToken = vi.fn(() =>
      Promise.reject(new Error('Request is missing required authentication credential. Expected OAuth 2 access token.'))
    );
    const store = { read: () => null, write: vi.fn() };
    const saveToken = vi.fn(() => Promise.resolve());
    const warn = vi.fn();
    const result = await getFcmToken(3, { fetchToken, store, saveToken, warn });
    expect(result).toBeNull();
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(store.write).not.toHaveBeenCalled();
    expect(saveToken).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors and returns a token once registration succeeds', async () => {
    authMock.currentUser = { uid: 'u1' };
    const fetchToken = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network hiccup'))
      .mockResolvedValueOnce('tok-123');
    const store = { read: () => null, write: vi.fn() };
    const saveToken = vi.fn(() => Promise.resolve());
    const result = await getFcmToken(3, { fetchToken, store, saveToken });
    expect(result).toBe('tok-123');
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(store.write).toHaveBeenCalledWith('tok-123');
    expect(saveToken).toHaveBeenCalledWith('tok-123');
  });

  it('returns null after exhausting transient retries (fail closed)', async () => {
    authMock.currentUser = { uid: 'u1' };
    const fetchToken = vi.fn(() => Promise.reject(new Error('stall')));
    const store = { read: () => null, write: vi.fn() };
    const saveToken = vi.fn(() => Promise.resolve());
    const result = await getFcmToken(2, { fetchToken, store, saveToken });
    expect(result).toBeNull();
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(saveToken).not.toHaveBeenCalled();
  });

  it('runs a single flight for concurrent registration requests', async () => {
    authMock.currentUser = { uid: 'u1' };
    let resolveFetch;
    const fetchToken = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const store = { read: () => null, write: vi.fn() };
    const p1 = getFcmToken(3, { fetchToken, store });
    const p2 = getFcmToken(3, { fetchToken, store });
    resolveFetch('tok-single');
    const results = await Promise.all([p1, p2]);
    expect(results).toEqual(['tok-single', 'tok-single']);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });
});

describe('requestNotificationPermission', () => {
  it('returns null without prompting when no user is signed in', async () => {
    authMock.currentUser = null;
    const result = await requestNotificationPermission();
    expect(result).toBeNull();
  });
});