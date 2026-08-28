export const resolveKeyboardViewport = ({
  keyboardHeight = 0,
  closedHeight = 0,
  layoutHeight = 0,
  visualHeight = 0,
  viewportTop = 0,
} = {}) => {
  const keyboard = Math.max(0, Number(keyboardHeight) || 0);
  const closed = Math.max(1, Number(closedHeight) || Number(layoutHeight) || Number(visualHeight) || 1);
  const layout = Math.max(1, Number(layoutHeight) || closed);
  const visual = Math.max(1, Number(visualHeight) || layout);
  const top = Math.max(0, Number(viewportTop) || 0);
  // Capacitor reports the keyboard in the same CSS-pixel coordinate system
  // as the keyboard-closed viewport. Always anchor native windows from that
  // stable baseline; layout/visual viewport values may already be resized and
  // subtracting from either one can count the keyboard twice.
  const visibleHeight = keyboard > 0 ? Math.max(1, closed - keyboard) : visual;

  return {
    visibleHeight,
    viewportTop: keyboard > 0 ? 0 : top,
  };
};

export const resolveBrowserKeyboardViewport = ({
  closedHeight = 0,
  layoutHeight = 0,
  visualHeight = 0,
  viewportTop = 0,
} = {}) => {
  const closed = Math.max(1, Number(closedHeight) || Number(layoutHeight) || Number(visualHeight) || 1);
  const layout = Math.max(1, Number(layoutHeight) || closed);
  const visual = Math.max(1, Number(visualHeight) || layout);
  const top = Math.max(0, Number(viewportTop) || 0);
  const layoutAlreadyReduced = layout < closed - 40;
  const visualReduced = visual + top < closed - 40;

  return {
    keyboardOpen: layoutAlreadyReduced || visualReduced,
    visibleHeight: layoutAlreadyReduced ? layout : visual,
    viewportTop: layoutAlreadyReduced ? 0 : top,
    layoutAlreadyReduced,
  };
};
