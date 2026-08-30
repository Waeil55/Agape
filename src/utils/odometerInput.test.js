import { describe, expect, it } from 'vitest';
import { ODOMETER_MAX_DIGITS, sanitizeOdometerInput } from './odometerInput';

describe('native odometer input', () => {
  it('keeps only digits typed by the mobile keyboard', () => {
    expect(sanitizeOdometerInput('272,234 mi')).toBe('272234');
  });

  it('handles empty values and limits oversized readings', () => {
    expect(sanitizeOdometerInput(null)).toBe('');
    expect(sanitizeOdometerInput('1'.repeat(ODOMETER_MAX_DIGITS + 2))).toHaveLength(ODOMETER_MAX_DIGITS);
  });
});
