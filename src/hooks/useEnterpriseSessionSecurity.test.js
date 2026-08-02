import { describe, expect, it } from 'vitest';
import { isEmploymentAccessActive, SESSION_SECURITY_POLICY } from './useEnterpriseSessionSecurity';

describe('enterprise session security policy', () => {
  it('keeps legacy active profiles authorized', () => {
    expect(isEmploymentAccessActive({ role: 'driver' })).toBe(true);
    expect(isEmploymentAccessActive({ accessStatus: 'active', disabled: false })).toBe(true);
  });

  it.each(['disabled', 'inactive', 'revoked', 'suspended', 'terminated', 'separated'])(
    'rejects %s employment access immediately',
    (accessStatus) => {
      expect(isEmploymentAccessActive({ accessStatus })).toBe(false);
    }
  );

  it('rejects explicit disabled and inactive flags', () => {
    expect(isEmploymentAccessActive({ disabled: true })).toBe(false);
    expect(isEmploymentAccessActive({ active: false })).toBe(false);
  });

  it('uses stricter idle limits for privileged portals', () => {
    expect(SESSION_SECURITY_POLICY.admin.idleMs).toBeLessThan(SESSION_SECURITY_POLICY.dispatcher.idleMs);
    expect(SESSION_SECURITY_POLICY.driver.absoluteMs).toBeGreaterThan(SESSION_SECURITY_POLICY.admin.absoluteMs);
  });
});
