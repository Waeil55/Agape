import { describe, expect, it } from 'vitest';
import { resolveBrowserKeyboardViewport, resolveKeyboardViewport } from './keyboardViewport';

describe('trip window keyboard viewport', () => {
  it('does not subtract the keyboard twice after Capacitor resized the body', () => {
    expect(resolveKeyboardViewport({
      keyboardHeight: 300,
      closedHeight: 844,
      layoutHeight: 544,
      visualHeight: 544,
    }).visibleHeight).toBe(544);
  });

  it('uses the native keyboard height when WebKit did not resize', () => {
    expect(resolveKeyboardViewport({
      keyboardHeight: 300,
      closedHeight: 844,
      layoutHeight: 844,
      visualHeight: 844,
    }).visibleHeight).toBe(544);
  });

  it('uses the stable native keyboard top even when visual viewport values disagree', () => {
    expect(resolveKeyboardViewport({
      keyboardHeight: 300,
      closedHeight: 844,
      layoutHeight: 844,
      visualHeight: 430,
    }).visibleHeight).toBe(544);
  });
});

describe('browser trip window keyboard viewport', () => {
  it('uses the layout height when iOS already resized layout and visual viewport again', () => {
    expect(resolveBrowserKeyboardViewport({
      closedHeight: 844,
      layoutHeight: 544,
      visualHeight: 300,
    })).toMatchObject({
      keyboardOpen: true,
      visibleHeight: 544,
      viewportTop: 0,
      layoutAlreadyReduced: true,
    });
  });

  it('uses visual viewport height when the layout viewport stayed full height', () => {
    expect(resolveBrowserKeyboardViewport({
      closedHeight: 844,
      layoutHeight: 844,
      visualHeight: 544,
      viewportTop: 0,
    })).toMatchObject({
      keyboardOpen: true,
      visibleHeight: 544,
      layoutAlreadyReduced: false,
    });
  });
});
