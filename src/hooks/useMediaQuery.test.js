import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMediaQueryStore } from './useMediaQuery';

const originalWindow = globalThis.window;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});
describe('shared media-query store', () => {
  it('shares one native listener across subscribers and removes it after the last unsubscribe', () => {
    const nativeListeners = new Set();
    const queryList = {
      matches: true,
      addEventListener: vi.fn((_type, listener) => nativeListeners.add(listener)),
      removeEventListener: vi.fn((_type, listener) => nativeListeners.delete(listener)),
    };
    const matchMedia = vi.fn(() => queryList);
    globalThis.window = { matchMedia };

    const store = createMediaQueryStore('(max-width: 767px)');
    const firstSubscriber = vi.fn();
    const secondSubscriber = vi.fn();
    const unsubscribeFirst = store.subscribe(firstSubscriber);
    const unsubscribeSecond = store.subscribe(secondSubscriber);

    expect(store.getSnapshot()).toBe(true);
    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(queryList.addEventListener).toHaveBeenCalledTimes(1);

    nativeListeners.forEach((listener) => listener({ matches: false }));
    expect(firstSubscriber).toHaveBeenCalledTimes(1);
    expect(secondSubscriber).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    expect(queryList.removeEventListener).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(queryList.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('is safe when matchMedia is unavailable during server rendering', () => {
    delete globalThis.window;
    const store = createMediaQueryStore('(max-width: 767px)');

    expect(store.getSnapshot()).toBe(false);
    expect(() => store.subscribe(() => {})()).not.toThrow();
  });

  it('supports legacy MediaQueryList listeners', () => {
    const queryList = {
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    globalThis.window = { matchMedia: vi.fn(() => queryList) };
    const store = createMediaQueryStore('(max-width: 767px)');

    const unsubscribe = store.subscribe(() => {});
    expect(queryList.addListener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(queryList.removeListener).toHaveBeenCalledTimes(1);
  });
});
