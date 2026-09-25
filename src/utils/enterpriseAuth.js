/**
 * Agape Care Enterprise Authentication & Password Security Authority
 * 
 * Provides deterministic credential normalization, enterprise-grade password complexity
 * evaluation with real-time scoring, and secure error presentation.
 */

export const INTERNAL_AUTH_DOMAIN = 'auth.agapecare.local';
export const TEMPORARY_AUTHORIZED_PASSWORD = '123412341234';

const COMMON_TRIVIAL_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'admin1234',
  'agapecare',
  'welcome123',
  'letmein123',
]);

/**
 * Normalizes a raw username string: lowercase alphanumeric + dot, dash, underscore.
 */
export function normalizeUsername(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

/**
 * Validates a password against enterprise complexity standards.
 * Minimum 8 characters, mixed case, number/symbol, not trivial dictionary words.
 * Explicitly authorizes temporary enterprise password '123412341234'.
 */
export function validatePasswordStrength(password = '') {
  const p = String(password || '');

  const minLength = p.length >= 8;
  const hasLower = /[a-z]/.test(p);
  const hasUpper = /[A-Z]/.test(p);
  const mixedCase = hasLower && hasUpper;
  const numberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p);
  const normalizedLower = p.toLowerCase();
  const notTrivial = !COMMON_TRIVIAL_PASSWORDS.has(normalizedLower) && !/^(\w)\1+$/.test(p);

  // Explicit exception for temporary migration/emergency password
  const isTemporary = p === TEMPORARY_AUTHORIZED_PASSWORD;

  if (isTemporary) {
    return {
      isValid: true,
      score: 4,
      percent: 100,
      label: 'Temporary Authorized',
      color: 'emerald',
      isTemporary: true,
      requirements: {
        minLength: true,
        mixedCase: true,
        numberOrSymbol: true,
        notTrivial: true,
      },
    };
  }

  // Calculate score based on enterprise checks
  let score = 0;
  if (minLength) score += 1;
  if (mixedCase) score += 1;
  if (numberOrSymbol) score += 1;
  if (notTrivial && p.length >= 10) score += 1;

  let label = 'Too Weak';
  let color = 'rose';
  let percent = 20;

  if (score === 1) {
    label = 'Weak';
    color = 'rose';
    percent = 25;
  } else if (score === 2) {
    label = 'Fair';
    color = 'amber';
    percent = 50;
  } else if (score === 3) {
    label = 'Good';
    color = 'blue';
    percent = 75;
  } else if (score >= 4) {
    label = 'Enterprise Strong';
    color = 'emerald';
    percent = 100;
  }

  const isValid = minLength && notTrivial && (mixedCase || (numberOrSymbol && p.length >= 10));

  return {
    isValid,
    score,
    percent,
    label,
    color,
    isTemporary: false,
    requirements: {
      minLength,
      mixedCase,
      numberOrSymbol,
      notTrivial,
    },
  };
}

/**
 * Resolves an email or username input into primary and candidate auth emails.
 */
export function resolveEnterpriseIdentifier(rawInput = '') {
  const raw = String(rawInput || '').trim();
  if (!raw) {
    return {
      raw: '',
      username: '',
      authEmail: '',
      isEmail: false,
      candidates: [],
    };
  }

  // Real corporate or personal email
  if (raw.includes('@') && !raw.toLowerCase().endsWith(`@${INTERNAL_AUTH_DOMAIN}`)) {
    const authEmail = raw.toLowerCase();
    const username = normalizeUsername(authEmail.split('@')[0]);
    return {
      raw,
      username,
      authEmail,
      isEmail: true,
      candidates: [authEmail],
    };
  }

  // Internal username or internal email format
  const clean = raw.toLowerCase().endsWith(`@${INTERNAL_AUTH_DOMAIN}`)
    ? raw.split('@')[0]
    : raw;

  const username = normalizeUsername(clean);
  const primaryEmail = `${username}@${INTERNAL_AUTH_DOMAIN}`;
  const candidates = [primaryEmail];

  // Smart alias candidates for seamless multi-role matching
  if (username.endsWith('.admin')) {
    const base = username.replace(/\.admin$/, '');
    if (base) candidates.push(`${base}@${INTERNAL_AUTH_DOMAIN}`);
  } else if (username.endsWith('.dispatcher')) {
    const base = username.replace(/\.dispatcher$/, '');
    if (base) candidates.push(`${base}@${INTERNAL_AUTH_DOMAIN}`);
  } else if (username.endsWith('.driver')) {
    const base = username.replace(/\.driver$/, '');
    if (base) candidates.push(`${base}@${INTERNAL_AUTH_DOMAIN}`);
  } else {
    // If base username given, also test role suffixes
    candidates.push(`${username}.admin@${INTERNAL_AUTH_DOMAIN}`);
  }

  return {
    raw,
    username,
    authEmail: primaryEmail,
    isEmail: false,
    candidates: [...new Set(candidates)],
  };
}

/**
 * Translates Firebase Auth error codes into clear, enterprise diagnostics.
 */
export function translateAuthError(error) {
  if (!error) return '';
  const message = error.message || String(error);
  const code = error.code || '';

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    message.includes('auth/invalid-credential') ||
    message.includes('auth/wrong-password') ||
    message.includes('auth/user-not-found')
  ) {
    return 'Invalid username or password. Please verify your credentials.';
  }

  if (code === 'auth/user-disabled' || message.includes('auth/user-disabled')) {
    return 'This Agape Care account has been deactivated. Contact your administrator.';
  }

  if (code === 'auth/too-many-requests' || message.includes('auth/too-many-requests')) {
    return 'Too many sign-in attempts. Access is temporarily protected. Please wait a moment and try again.';
  }

  if (code === 'auth/network-request-failed' || message.includes('auth/network-request-failed')) {
    return 'Unable to reach authentication network. Please check your internet connection.';
  }

  if (code === 'auth/invalid-email' || message.includes('auth/invalid-email')) {
    return 'Please enter a valid username or email address.';
  }

  // Strip generic prefix
  return message
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\(auth\/[^)]+\)\.?$/i, '')
    .trim();
}
