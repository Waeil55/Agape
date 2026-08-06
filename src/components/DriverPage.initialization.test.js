import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('DriverPage initialization order', () => {
  it('initializes the time-tracking policy before reconciliation hooks consume it', () => {
    const source = readFileSync(new URL('./DriverPage.jsx', import.meta.url), 'utf8');
    const policyDeclaration = source.indexOf('const timeTrackingPolicyMode =');
    const boundaryReconciliation = source.indexOf('Final-trip home boundary reconciliation failed');

    expect(policyDeclaration).toBeGreaterThan(-1);
    expect(boundaryReconciliation).toBeGreaterThan(-1);
    expect(policyDeclaration).toBeLessThan(boundaryReconciliation);
  });
});
