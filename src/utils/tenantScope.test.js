import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TENANT_ID,
  attachTenantScope,
  normalizeTenantId,
  recordBelongsToTenant,
  tenantIdFromProfile,
} from './tenantScope';

describe('tenant scope', () => {
  it('resolves the existing company as the migration-safe default', () => {
    expect(tenantIdFromProfile({})).toBe(DEFAULT_TENANT_ID);
    expect(recordBelongsToTenant({ bookingId: '1' }, DEFAULT_TENANT_ID)).toBe(true);
  });

  it('never exposes unscoped legacy data to a new tenant', () => {
    expect(recordBelongsToTenant({ bookingId: '1' }, 'other-company')).toBe(false);
  });

  it('requires exact normalized tenant equality', () => {
    expect(recordBelongsToTenant({ tenantId: 'north-fleet' }, 'north-fleet')).toBe(true);
    expect(recordBelongsToTenant({ tenantId: 'north-fleet' }, 'south-fleet')).toBe(false);
  });

  it('rejects unsafe identifiers and scopes writes', () => {
    expect(normalizeTenantId('../escape')).toBe(DEFAULT_TENANT_ID);
    expect(attachTenantScope({ id: 't1' }, 'North-Fleet')).toEqual({ id: 't1', tenantId: 'north-fleet' });
  });
});
