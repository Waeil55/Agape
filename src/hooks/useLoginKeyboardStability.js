import { useEffect } from 'react';
import { isNativeShell } from '../utils/platform';
import { calculateLoginKeyboardCounterPan } from '../utils/loginKeyboardLayout';

export default function useLoginKeyboardStability(enabled) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const visualViewport = window.visualViewport || null;
    const root = document.documentElement;
    let activeLogin = null;
    let baselinePageTop = 0;
    let frame = 0;
    let nativeKeyboardCancelled = false;

    const getVisualPageTop = () => {
      const reportedPageTop = Number(visualViewport?.pageTop);
      if (Number.isFinite(reportedPageTop)) return reportedPageTop;
      return (window.scrollY || root.scrollTop || 0) + (Number(visualViewport?.offsetTop) || 0);
    };

    const clearLock = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      root.classList.remove('login-keyboard-open');
      if (activeLogin) {
        activeLogin.style.removeProperty('--login-keyboard-counter-pan');
        activeLogin.style.removeProperty('will-change');
      }
      activeLogin = null;
    };

    const applyLock = () => {
      frame = 0;
      if (!activeLogin?.isConnected) {
        clearLock();
        return;
      }

      const counterPan = calculateLoginKeyboardCounterPan({
        baselinePageTop,
        currentPageTop: getVisualPageTop(),
      });
      activeLogin.style.setProperty('--login-keyboard-counter-pan', `${counterPan.toFixed(3)}px`);
    };

    const scheduleLock = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyLock);
    };

    const handleFocusIn = (event) => {
      const login = event.target?.closest?.('.agape-login');
      if (!login || !event.target?.matches?.('input, textarea, select')) return;
      if (!activeLogin) {
        activeLogin = login;
        baselinePageTop = getVisualPageTop();
        login.style.willChange = 'transform';
        root.classList.add('login-keyboard-open');
      }
      scheduleLock();
    };

    const handleFocusOut = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        // Clear the keyboard lock when focus moves outside the login container,
        // OR when it moves to a non-input element (e.g. the submit button).
        // Without the second check, tapping "Authorize Access" keeps will-change
        // transform on the login panel, which can break touch events on WebKit.
        if (active?.closest?.('.agape-login') && active?.matches?.('input, textarea, select')) return;
        clearLock();
      });
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    window.addEventListener('scroll', scheduleLock, { passive: true });
    visualViewport?.addEventListener('resize', scheduleLock);
    visualViewport?.addEventListener('scroll', scheduleLock);

    if (isNativeShell()) {
      import('@capacitor/keyboard').then(async ({ Keyboard, KeyboardResize }) => {
        if (nativeKeyboardCancelled) return;
        await Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {});
      }).catch(() => {});
    }

    return () => {
      nativeKeyboardCancelled = true;
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      window.removeEventListener('scroll', scheduleLock);
      visualViewport?.removeEventListener('resize', scheduleLock);
      visualViewport?.removeEventListener('scroll', scheduleLock);
      clearLock();
    };
  }, [enabled]);
}
