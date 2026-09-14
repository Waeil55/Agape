import { useEffect } from 'react';
import { isNativeShell } from '../utils/platform';

/**
 * Locks the login page so the iOS keyboard overlay never shifts any content.
 *
 * The login is position:fixed, so window.scrollTo is irrelevant.
 * The scrollable container is .agape-login-stage (overflow-y:auto).
 * When the keyboard opens, iOS auto-scrolls that container to reveal the
 * focused input — we lock its scrollTop to 0 to prevent the jump.
 */
export default function useLoginKeyboardStability(enabled) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    let nativeKeyboardCancelled = false;
    let raf = 0;
    let locked = false;
    let stageEl = null;

    const findStage = () => {
      if (!stageEl) stageEl = document.querySelector('.agape-login-stage');
      return stageEl;
    };

    const lockScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = findStage();
        if (locked && el && el.scrollTop !== 0) {
          el.scrollTop = 0;
        }
      });
    };

    const handleViewportResize = () => {
      const height = window.visualViewport?.height;
      if (!height) return;
      const fullHeight = window.innerHeight;
      const keyboardOpen = height < fullHeight * 0.85;

      if (keyboardOpen && !locked) {
        locked = true;
        const el = findStage();
        if (el) {
          el.addEventListener('scroll', lockScroll, { passive: false });
          lockScroll();
        }
      } else if (!keyboardOpen && locked) {
        locked = false;
        const el = findStage();
        if (el) el.removeEventListener('scroll', lockScroll);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      }
    };

    window.visualViewport?.addEventListener('resize', handleViewportResize);

    if (isNativeShell()) {
      import('@capacitor/keyboard').then(async ({ Keyboard, KeyboardResize }) => {
        if (nativeKeyboardCancelled) return;
        await Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {});
      }).catch(() => {});
    }

    return () => {
      nativeKeyboardCancelled = true;
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      const el = findStage();
      if (el) el.removeEventListener('scroll', lockScroll);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
  }, [enabled]);
}
