import { useEffect } from 'react';
import { isNativeShell } from '../utils/platform';

/**
 * Stabilizes the login page on mobile when the virtual keyboard opens.
 *
 * With `interactive-widget=overlays-content`, the viewport doesn't shrink,
 * so iOS auto-scrolls the focused input into view above the keyboard. We
 * must NOT lock scrollTop — that would prevent the user from reaching the
 * submit button. We only set the native keyboard resize mode to "none" so
 * Capacitor doesn't fight the viewport meta.
 */
export default function useLoginKeyboardStability(enabled) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    if (isNativeShell()) {
      let cancelled = false;
      import('@capacitor/keyboard').then(async ({ Keyboard, KeyboardResize }) => {
        if (cancelled) return;
        await Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {});
      }).catch(() => {});
      return () => { cancelled = true; };
    }

    return undefined;
  }, [enabled]);
}
