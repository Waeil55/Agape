import { describe, expect, it } from 'vitest';
import { normalizeTripStatusValue } from './tripIntegrity';

describe('normalizeTripStatusValue', () => {
  it('unwraps status objects before they reach workflow rendering', () => {
    expect(normalizeTripStatusValue({ status: { status: 'Completed' } })).toBe('Completed');
    expect(normalizeTripStatusValue({ label: 'At Pickup' })).toBe('At Pickup');
  });

  it('rejects unsupported object shapes instead of returning a React child', () => {
    expect(normalizeTripStatusValue({ unexpected: 'value' })).toBe('');
  });
});
