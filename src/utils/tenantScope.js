export const DEFAULT_TENANT_ID = 'agape-care';

const TENANT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function normalizeTenantId(value, fallback = DEFAULT_TENANT_ID) {
  const normalized = String(value || '').trim().toLowerCase();
  return TENANT_ID_PATTERN.test(normalized) ? normalized : fallback;
}

export function tenantIdFromProfile(profile = {}) {
  return normalizeTenantId(profile.tenantId || profile.organizationId || profile.orgId);
}

export function attachTenantScope(record, tenantId) {
  return { ...record, tenantId: normalizeTenantId(tenantId) };
}

// Existing production documents predate tenancy. They are visible only to the
// original Agape tenant during migration; other tenants fail closed.
export function recordBelongsToTenant(record = {}, tenantId) {
  const requestedTenant = normalizeTenantId(tenantId);
  const recordTenant = String(record?.tenantId || '').trim().toLowerCase();
  if (!recordTenant) return requestedTenant === DEFAULT_TENANT_ID;
  return recordTenant === requestedTenant;
}

