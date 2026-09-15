import { useEffect } from 'react';

/**
 * Keeps the login form's submit button reachable when the virtual keyboard opens
 * on mobile. With `interactive-widget=overlays-content`, the keyboard overlays
 * the content instead of shrinking the viewport. We scroll the focused input
 * into view above the keyboard — we never lock scrollTop to 0.
 */
export default function useLoginKeyboardStability(enabled) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const vv = window.visualViewport;
    if (!vv) return undefined;

    const handleResize = () => {
      const height = vv.height;
      const fullHeight = window.innerHeight;
      if (!height || !fullHeight) return;
      const keyboardOpen = height < fullHeight * 0.75;

      if (keyboardOpen) {
        const active = document.activeElement;
        if (active && active.tagName !== 'BODY') {
          const login = document.querySelector('.agape-login');
          if (login) {
            setTimeout(() => {
              active.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
        }
      }
    };

    vv.addEventListener('resize', handleResize);
    return () => { vv.removeEventListener('resize', handleResize); };
  }, [enabled]);
}
