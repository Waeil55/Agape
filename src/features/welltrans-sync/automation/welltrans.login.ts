export type ManualLoginState = 'missing' | 'valid' | 'expired';

// Credentials are intentionally absent. The external worker opens a headed
// browser for manual login and encrypts Playwright storageState locally.
export const WELLTRANS_SESSION_POLICY = {
  storage: 'worker-encrypted-aes-256-gcm',
  firestoreCredentialsAllowed: false,
  manualLoginRequired: true,
} as const;

