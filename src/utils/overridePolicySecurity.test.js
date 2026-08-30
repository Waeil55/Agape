import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('override policy Firestore contract', () => {
  it('limits dispatcher writes to the validated shared override policy document', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain("document == 'overrideCostPolicy' && isDispatcher() && validOverrideCostPolicy()");
    expect(rules).toContain("document != 'overrideCostPolicy' && isAdmin()");
    expect(rules).toContain('data.updatedBy == request.auth.uid');
    expect(rules).toContain('data.waitRoundingMinutes >= 1');
    expect(rules).toContain("'homeLat', 'homeLng', 'homeFormattedAddress'");
    expect(rules).toContain("'excludedCityPairs', 'overrideExclusionRules', 'updatedAt', 'updatedBy'");
    expect(rules).toContain("data.get('homeAddress', '') is string");
    expect(rules).toContain("data.get('overrideExclusionRules', []) is list");
    expect(rules).toMatch(/match \/systemConfig\/\{document\}[\s\S]*?allow delete: if isAdmin\(\);/);
  });

  it('requires the same validated schema for administrator and dispatcher policy writes', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).not.toMatch(/allow create, update: if isAdmin\(\)\s*\n\s*\|\| \(isDispatcher\(\)/);
    expect(rules).toContain("document == 'overrideCostPolicy' && isDispatcher() && validOverrideCostPolicy()");
  });

  it('keeps policy writes bounded and validates shared home coordinates', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain("data.get('homeLat', null) == null");
    expect(rules).toContain('data.homeLat >= -90 && data.homeLat <= 90');
    expect(rules).toContain('data.homeLng >= -180 && data.homeLng <= 180');
    expect(rules).toContain("data.get('overrideExclusionRules', []).size() <= 200");
    expect(rules).toContain('data.excludedCityPairs.size() <= 200');
  });
});
