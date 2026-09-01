const DEFAULT_KEYBOARD_THRESHOLD = 120;
export const TRIP_WINDOW_KEYBOARD_GAP = 20;
export const TRIP_ODOMETER_WINDOW_EXTRA_LIFT_RATIO = 0.1;

const finiteNonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

// Return the keyboard's top edge in layout-viewport coordinates. Browsers
// report it through VisualViewport while Capacitor reports its height. Prefer
// whichever source exposes the larger covered area.
export const resolveTripKeyboardTop = ({
  layoutHeight,
  visualHeight,
  visualOffsetTop = 0,
  nativeKeyboardHeight = 0,
  minimumKeyboardHeight = DEFAULT_KEYBOARD_THRESHOLD,
} = {}) => {
  const height = finiteNonNegative(layoutHeight);
  if (!height) return null;

  const candidates = [];
  const viewportHeight = finiteNonNegative(visualHeight);
  const viewportTop = finiteNonNegative(visualOffsetTop);
  const visualKeyboardHeight = Math.max(0, height - (viewportTop + viewportHeight));
  if (viewportHeight && visualKeyboardHeight >= minimumKeyboardHeight) {
    candidates.push(viewportTop + viewportHeight);
  }

  const nativeHeight = finiteNonNegative(nativeKeyboardHeight);
  if (nativeHeight >= minimumKeyboardHeight) candidates.push(height - nativeHeight);

  return candidates.length ? Math.min(...candidates) : null;
};

export const calculateTripWindowLift = ({
  windowBottom,
  keyboardTop,
  gap = TRIP_WINDOW_KEYBOARD_GAP,
  extraLift = 0,
} = {}) => {
  if (keyboardTop === null || keyboardTop === undefined || !Number.isFinite(Number(keyboardTop))) return 0;
  return Math.max(0, Math.ceil(
    finiteNonNegative(windowBottom)
      + finiteNonNegative(gap)
      - Number(keyboardTop)
      + finiteNonNegative(extraLift)
  ));
};
