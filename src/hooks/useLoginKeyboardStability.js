import { useEffect } from 'react';
import { isNativeShell } from '../utils/platform';

export default function useLoginKeyboardStability(enabled) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    let nativeKeyboardCancelled = false;

    if (isNativeShell()) {
      import('@capacitor/keyboard').then(async ({ Keyboard, KeyboardResize }) => {
        if (nativeKeyboardCancelled) return;
        await Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {});
      }).catch(() => {});
    }

    return () => {
      nativeKeyboardCancelled = true;
    };
  }, [enabled]);
}
