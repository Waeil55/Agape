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

  it('keeps payroll gap reviews append-only and restricted to authorized reviewers', () => {
    const rules = readFileSync(firestoreRulesPath, 'utf8');
    const reviewRule = rules.match(/match \/timeTrackingGapReviews\/\{reviewId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    expect(reviewRule).toContain('allow create: if signedIn() && isDispatcher()');
    expect(reviewRule).toContain("request.resource.data.resolution in ['PAID_WAITING', 'PERSONAL_UNPAID']");
    expect(reviewRule).toContain('request.resource.data.correctedBy == request.auth.token.email');
    expect(reviewRule).toContain('allow update, delete: if false;');
  });

  it('allows only a driver to append a server-timestamped personal-time declaration', () => {
    const rules = readFileSync(firestoreRulesPath, 'utf8');
    const declarationRule = rules.match(/match \/timeTrackingDeclarations\/\{declarationId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    expect(declarationRule).toContain('request.resource.data.driverEmail == request.auth.token.email');
    expect(declarationRule).toContain('request.resource.data.userId == request.auth.uid');
    expect(declarationRule).toContain("request.resource.data.type in ['BREAK_START', 'BREAK_END']");
    expect(declarationRule).toContain('request.resource.data.createdAt == request.time');
    expect(declarationRule).toContain('allow update, delete: if false;');
  });

  it('preserves driver correction requests while restricting disposition to reviewers', () => {
    const rules = readFileSync(firestoreRulesPath, 'utf8');
    const requestRule = rules.match(/match \/timeTrackingCorrectionRequests\/\{requestId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    expect(requestRule).toContain('request.resource.data.driverEmail == request.auth.token.email');
    expect(requestRule).toContain("request.resource.data.status == 'pending'");
    expect(requestRule).toContain('request.resource.data.originalSnapshot is map');
    expect(requestRule).toContain('allow update: if signedIn() && isDispatcher()');
    expect(requestRule).toContain("'status', 'reviewerNote', 'reviewedBy', 'reviewedAt'");
    expect(requestRule).toContain('allow delete: if false;');
  });
});
