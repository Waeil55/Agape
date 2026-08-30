import { describe, expect, it } from 'vitest';
import { applyOdometerKey, ODOMETER_KEYPAD_MAX_DIGITS } from './odometerKeypad';

describe('odometer keypad input', () => {
  it('adds digits without accepting other characters', () => {
    expect(applyOdometerKey('27223', '4')).toBe('272234');
    expect(applyOdometerKey('27x2', 'x')).toBe('272');
  });

  it('supports correction and clearing', () => {
    expect(applyOdometerKey('272234', 'backspace')).toBe('27223');
    expect(applyOdometerKey('272234', 'clear')).toBe('');
  });

  it('limits the reading to the supported number of digits', () => {
    const full = '1'.repeat(ODOMETER_KEYPAD_MAX_DIGITS);
    expect(applyOdometerKey(full, '2')).toBe(full);
  });
});
