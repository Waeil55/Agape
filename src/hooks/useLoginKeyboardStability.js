import { useEffect } from 'react';
import { isNativeShell } from '../utils/platform';

/**
 * Locks the login page so the iOS keyboard overlay never shifts any content.
 * Uses visualViewport.resize + window scroll lock — the only combination that
 * reliably prevents the layout-viewport jump on iOS Safari / WKWebView.
 */
export default function useLoginKeyboardStability(enabled) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    let nativeKeyboardCancelled = false;
    let frame = 0;
    let locked = false;

    const lockScroll = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (locked && window.scrollY !== 0) {
          window.scrollTo(0, 0);
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
        window.addEventListener('scroll', lockScroll, { passive: false });
        window.visualViewport?.addEventListener('scroll', lockScroll);
        lockScroll();
      } else if (!keyboardOpen && locked) {
        locked = false;
        window.removeEventListener('scroll', lockScroll);
        window.visualViewport?.removeEventListener('scroll', lockScroll);
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
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
      window.removeEventListener('scroll', lockScroll);
      window.visualViewport?.removeEventListener('scroll', lockScroll);
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
    };
  }, [enabled]);
}
