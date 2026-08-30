import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('override policy Firestore contract', () => {
  it('limits dispatcher writes to the validated shared override policy document', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain("document == 'overrideCostPolicy' && isDispatcher() && validOverrideCostPolicy()");
    expect(rules).toContain("document != 'overrideCostPolicy' && isAdmin()");
    expect(rules).toContain('data.updatedBy == request.auth.uid');
    expect(rules).toContain('data.waitRoundingMinutes >= 1');
    expect(rules).toMatch(/match \/systemConfig\/\{document\}[\s\S]*?allow delete: if isAdmin\(\);/);
  });

  it('requires the same validated schema for administrator and dispatcher policy writes', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).not.toMatch(/allow create, update: if isAdmin\(\)\s*\n\s*\|\| \(isDispatcher\(\)/);
    expect(rules).toContain("document == 'overrideCostPolicy' && isDispatcher() && validOverrideCostPolicy()");
  });
});
