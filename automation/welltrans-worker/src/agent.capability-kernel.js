import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const AGENT_ROLES = Object.freeze({
  SUPERVISOR: 'supervisor', RECONCILER: 'reconciler', INDEXER: 'portal_indexer',
  WRITER: 'portal_writer', VERIFIER: 'independent_verifier', RECOVERY: 'recovery',
  LOCAL_ANALYST: 'local_analyst',
});

const PERMISSIONS = Object.freeze({
  [AGENT_ROLES.SUPERVISOR]: ['health:publish', 'session:control'],
  [AGENT_ROLES.RECONCILER]: ['source:read', 'queue:write'],
  [AGENT_ROLES.INDEXER]: ['portal:read', 'contract:verify'],
  [AGENT_ROLES.WRITER]: ['portal:read', 'portal:stage'],
  [AGENT_ROLES.VERIFIER]: ['source:read', 'portal:read', 'correction:issue'],
  [AGENT_ROLES.RECOVERY]: ['portal:read', 'queue:recover'],
  [AGENT_ROLES.LOCAL_ANALYST]: ['diagnostic:read', 'diagnostic:explain'],
});

export function createCapabilityKernel(instanceId) {
  const secret = randomBytes(32);
  const issued = new Map();
  let activeWriter = null;
  const sign = value => createHmac('sha256', secret).update(value).digest('hex');
  const issue = role => {
    if (!PERMISSIONS[role]) throw new Error(`Unknown Agent role: ${role}`);
    const id = randomUUID();
    const body = `${instanceId}:${role}:${id}`;
    const token = Object.freeze({ id, role, instanceId, signature: sign(body) });
    issued.set(id, token);
    return token;
  };
  const assert = (token, permission) => {
    const known = token?.id ? issued.get(token.id) : null;
    const expected = known ? sign(`${instanceId}:${known.role}:${known.id}`) : '';
    const supplied = String(token?.signature || '');
    const validSignature = expected.length === supplied.length && expected.length > 0
      && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
    if (!known || known !== token || !validSignature || !PERMISSIONS[known.role].includes(permission)) {
      throw new Error(`Agent capability denied: ${permission}`);
    }
    return true;
  };
  const runExclusiveWrite = async (token, scope, operation) => {
    assert(token, 'portal:stage');
    if (activeWriter) throw new Error(`Portal writer concurrency violation: ${activeWriter.scope}`);
    activeWriter = { tokenId: token.id, scope, startedAt: Date.now() };
    try { return await operation(); } finally { activeWriter = null; }
  };
  return Object.freeze({ issue, assert, runExclusiveWrite, roles: AGENT_ROLES });
}

export const capabilityManifest = () => Object.entries(PERMISSIONS).map(([role, permissions]) => ({
  role, permissions: [...permissions], writeAuthority: permissions.includes('portal:stage'),
}));
