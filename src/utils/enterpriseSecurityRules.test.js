import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const firestoreRulesPath = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

describe('enterprise evidence controls', () => {
  it('keeps audit records immutable from every client role', () => {
    const rules = readFileSync(firestoreRulesPath, 'utf8');
    const auditRule = rules.match(/match \/audit_logs\/\{auditId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    expect(auditRule).toContain('allow read: if signedIn() && isDispatcher();');
    expect(auditRule).toContain('allow create, update, delete: if false;');
    expect(auditRule).not.toContain('allow create: if signedIn()');
  });
});
