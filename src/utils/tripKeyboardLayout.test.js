import { describe, expect, it } from 'vitest';
import {
  calculateTripWindowLift,
  resolveTripKeyboardTop,
  TRIP_ODOMETER_WINDOW_EXTRA_LIFT_RATIO,
} from './tripKeyboardLayout';

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

  it('keeps the whole connected window safely above the keyboard boundary', () => {
    expect(calculateTripWindowLift({ windowBottom: 590, keyboardTop: 510 })).toBe(100);
    expect(calculateTripWindowLift({ windowBottom: 495, keyboardTop: 510 })).toBe(5);
    expect(calculateTripWindowLift({ windowBottom: 480, keyboardTop: 510 })).toBe(0);
  });

  it('adds exactly ten percent only when an odometer window requests the extra lift', () => {
    const panelHeight = 400;
    const extraLift = panelHeight * TRIP_ODOMETER_WINDOW_EXTRA_LIFT_RATIO;

    expect(calculateTripWindowLift({ windowBottom: 590, keyboardTop: 510, extraLift })).toBe(140);
    expect(calculateTripWindowLift({ windowBottom: 590, keyboardTop: 510 })).toBe(100);
    expect(calculateTripWindowLift({ windowBottom: 590, keyboardTop: null, extraLift })).toBe(0);
  });
});
