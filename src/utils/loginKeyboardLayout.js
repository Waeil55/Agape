const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

// iOS may pan the visual viewport after focusing a login field even when the
// layout viewport is configured to stay fixed. Move the login canvas by the
// inverse amount so it remains at the same screen coordinate.
export const calculateLoginKeyboardCounterPan = ({ baselinePageTop, currentPageTop } = {}) => (
  Math.max(0, finiteNumber(currentPageTop) - finiteNumber(baselinePageTop))
);
