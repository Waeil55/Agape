import { describe, expect, it } from 'vitest';
import {
  validatePasswordStrength,
  resolveEnterpriseIdentifier,
  translateAuthError,
  TEMPORARY_AUTHORIZED_PASSWORD,
  normalizeUsername,
} from './enterpriseAuth';

describe('enterpriseAuth utilities', () => {
  describe('normalizeUsername', () => {
    it('normalizes uppercase, spaces, and disallowed characters', () => {
      expect(normalizeUsername('  Waeil.Admin  ')).toBe('waeil.admin');
      expect(normalizeUsername('User@#$123')).toBe('user123');
      expect(normalizeUsername('driver_01-test.sub')).toBe('driver_01-test.sub');
    });
  });

  describe('validatePasswordStrength', () => {
    it('authorizes the temporary migration password explicitly', () => {
      const result = validatePasswordStrength(TEMPORARY_AUTHORIZED_PASSWORD);
      expect(result.isValid).toBe(true);
      expect(result.isTemporary).toBe(true);
      expect(result.score).toBe(4);
      expect(result.percent).toBe(100);
      expect(result.label).toBe('Temporary Authorized');
      expect(result.color).toBe('emerald');
    });

    it('rejects passwords shorter than 8 characters', () => {
      const result = validatePasswordStrength('Abc1!');
      expect(result.isValid).toBe(false);
      expect(result.requirements.minLength).toBe(false);
    });

    it('evaluates complexity checks for strong passwords', () => {
      const weak = validatePasswordStrength('12345678');
      expect(weak.isValid).toBe(false);
      expect(weak.requirements.mixedCase).toBe(false);

      const strong = validatePasswordStrength('AgapeCare2026!');
      expect(strong.isValid).toBe(true);
      expect(strong.requirements.minLength).toBe(true);
      expect(strong.requirements.mixedCase).toBe(true);
      expect(strong.requirements.numberOrSymbol).toBe(true);
      expect(strong.score).toBeGreaterThanOrEqual(3);
    });
  });

  describe('resolveEnterpriseIdentifier', () => {
    it('resolves real corporate emails directly', () => {
      const res = resolveEnterpriseIdentifier('waeil@agapecare.com');
      expect(res.isEmail).toBe(true);
      expect(res.authEmail).toBe('waeil@agapecare.com');
      expect(res.candidates).toEqual(['waeil@agapecare.com']);
    });

    it('resolves usernames with internal auth domain and aliases', () => {
      const res = resolveEnterpriseIdentifier('waeil.admin');
      expect(res.isEmail).toBe(false);
      expect(res.authEmail).toBe('waeil.admin@auth.agapecare.local');
      expect(res.candidates).toContain('waeil.admin@auth.agapecare.local');
      expect(res.candidates).toContain('waeil@auth.agapecare.local');
    });

    it('resolves base usernames with candidate suffix', () => {
      const res = resolveEnterpriseIdentifier('waeil');
      expect(res.authEmail).toBe('waeil@auth.agapecare.local');
      expect(res.candidates).toContain('waeil@auth.agapecare.local');
      expect(res.candidates).toContain('waeil.admin@auth.agapecare.local');
    });
  });

  describe('translateAuthError', () => {
    it('returns user-friendly diagnostics for invalid credentials', () => {
      expect(translateAuthError({ code: 'auth/invalid-credential' }))
        .toBe('Invalid username or password. Please verify your credentials.');
      expect(translateAuthError({ code: 'auth/wrong-password' }))
        .toBe('Invalid username or password. Please verify your credentials.');
    });

    it('returns user-friendly diagnostics for deactivated accounts', () => {
      expect(translateAuthError({ code: 'auth/user-disabled' }))
        .toBe('This Agape Care account has been deactivated. Contact your administrator.');
    });
  });
});
