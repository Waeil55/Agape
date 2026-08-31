import { describe, expect, it } from 'vitest';
import { calculateTripFooterLift, resolveTripKeyboardTop } from './tripKeyboardLayout';

describe('trip keyboard layout', () => {
  it('finds the browser keyboard boundary without treating small viewport changes as a keyboard', () => {
    expect(resolveTripKeyboardTop({ layoutHeight: 844, visualHeight: 510, visualOffsetTop: 0 })).toBe(510);
    expect(resolveTripKeyboardTop({ layoutHeight: 844, visualHeight: 780, visualOffsetTop: 0 })).toBeNull();
  });

  it('uses the higher boundary when native and browser keyboard measurements disagree', () => {
    expect(resolveTripKeyboardTop({
      layoutHeight: 844,
      visualHeight: 540,
      nativeKeyboardHeight: 344,
    })).toBe(500);
  });

  it('lifts the footer only by the amount that overlaps the keyboard', () => {
    expect(calculateTripFooterLift({ footerBottom: 590, keyboardTop: 510, gap: 8 })).toBe(88);
    expect(calculateTripFooterLift({ footerBottom: 480, keyboardTop: 510, gap: 8 })).toBe(0);
  });
});
