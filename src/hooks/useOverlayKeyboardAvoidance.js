import { useEffect } from 'react';

/**
 * Keeps every full-screen window/sheet (position: fixed overlay) fully visible
 * above the on-screen keyboard.
 *
 * The shell never resizes for the keyboard (Keyboard resize = none and
 * `interactive-widget=overlays-content`), so an overlay's bottom edge sits
 * behind the keyboard. While an editable field inside an overlay is focused we
 * lift the overlay by the keyboard height (padding-bottom), cap its panel to
 * the space that remains, and scroll the field into view. Everything is
 * restored when the keyboard closes.
 *
 * Skipped on purpose: the driver trip windows (own keyboard architecture in
 * DriverPage + tripWindows.css) and the login screen (must never manipulate
 * scroll — see AGENTS.md).
 */

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'color', 'image', 'reset']);
const EXCLUDED = '.trip-window-overlay, .agape-login';
const MIN_KEYBOARD_PX = 90;

const isTextField = (el) => {
  if (!el || !el.matches || !el.matches(EDITABLE)) return false;
  return !(el.tagName === 'INPUT' && NON_TEXT_INPUTS.has(String(el.type).toLowerCase()));
};

// Only a real pop-up window qualifies: a full-screen scrim whose direct child
// is a rounded sheet/dialog panel. Full-screen *workspaces* (e.g. an embedded
// portal that is itself `fixed inset-0`) must never be lifted or squeezed
// when an ordinary search box inside them is focused.
const PANEL_CHILD = ':scope > :is([role="dialog"], [class*="rounded-t-"], [class*="rounded-2xl"], [class*="rounded-3xl"], [class*="rounded-[2"])';

const findOverlay = (el) => {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (!node.classList?.contains('fixed') || !node.classList.contains('inset-0')) continue;
    if (node.closest(EXCLUDED)) return null;
    let hasPanel = false;
    try { hasPanel = Boolean(node.querySelector(PANEL_CHILD)); } catch { hasPanel = false; }
    return hasPanel ? node : null;
  }
  return null;
};

export default function useOverlayKeyboardAvoidance(enabled) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const vv = window.visualViewport || null;
    let nativeInset = 0;
    let active = null; // { overlay, field, padding, transition, panels: [{ el, maxHeight }] }
    let rafId = 0;
    let blurTimer = 0;
    let scrollTimer = 0;
    const nativeHandles = [];

    const keyboardInset = () => {
      const webInset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      const inset = Math.max(webInset, nativeInset);
      return inset >= MIN_KEYBOARD_PX ? Math.round(inset) : 0;
    };

    const release = () => {
      if (!active) return;
      const { overlay, padding, transition, panels } = active;
      active = null;
      panels.forEach(({ el, maxHeight }) => { el.style.maxHeight = maxHeight; });
      if (overlay.isConnected) {
        overlay.style.paddingBottom = padding;
        overlay.style.transition = transition;
        overlay.removeAttribute('data-agape-kb');
      }
    };

    const revealField = (field) => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        if (document.activeElement !== field || !field.isConnected) return;
        try { field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch { /* old WebView */ }
      }, 180);
    };

    const apply = () => {
      rafId = 0;
      if (!active) return;
      const { overlay, field } = active;
      if (!overlay.isConnected || !field.isConnected) { release(); return; }
      const inset = keyboardInset();
      if (!inset) {
        if (overlay.style.paddingBottom !== active.padding) release();
        return;
      }
      overlay.setAttribute('data-agape-kb', 'open');
      overlay.style.transition = 'padding-bottom 140ms ease-out';
      overlay.style.paddingBottom = `${inset}px`;

      // Cap each direct panel to the space left above the keyboard so its
      // header/footer stay on screen and only the body scrolls.
      const available = overlay.clientHeight - inset;
      Array.from(overlay.children).forEach((child) => {
        const rect = child.getBoundingClientRect();
        if (rect.height <= 0 || window.getComputedStyle(child).position === 'absolute') return;
        let saved = active.panels.find((panel) => panel.el === child);
        if (!saved) {
          saved = { el: child, maxHeight: child.style.maxHeight };
          active.panels.push(saved);
        }
        if (available > 120) child.style.maxHeight = `${Math.floor(available - 8)}px`;
      });
      revealField(field);
    };

    const schedule = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(apply);
    };

    const handleFocusIn = (event) => {
      const field = event.target;
      if (!isTextField(field)) return;
      window.clearTimeout(blurTimer);
      const overlay = findOverlay(field);
      if (!overlay) return;
      if (active && active.overlay !== overlay) release();
      if (!active) {
        active = {
          overlay,
          field,
          padding: overlay.style.paddingBottom,
          transition: overlay.style.transition,
          panels: [],
        };
      }
      active.field = field;
      schedule();
    };

    const handleFocusOut = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (active && !isTextField(document.activeElement)) release();
      }, 120);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    if (vv) {
      vv.addEventListener('resize', schedule);
      vv.addEventListener('scroll', schedule);
    }

    // Native shells keep the WebView un-resized, so read the keyboard height
    // from the Capacitor plugin as well.
    let disposed = false;
    import('@capacitor/keyboard').then(async ({ Keyboard }) => {
      if (disposed || !Keyboard?.addListener) return;
      const show = await Keyboard.addListener('keyboardWillShow', (info) => {
        nativeInset = Number(info?.keyboardHeight) || 0;
        schedule();
      });
      const hide = await Keyboard.addListener('keyboardWillHide', () => {
        nativeInset = 0;
        schedule();
      });
      nativeHandles.push(show, hide);
      if (disposed) nativeHandles.forEach((handle) => handle?.remove?.());
    }).catch(() => { /* web build without the native plugin */ });

    return () => {
      disposed = true;
      window.clearTimeout(blurTimer);
      window.clearTimeout(scrollTimer);
      if (rafId) window.cancelAnimationFrame(rafId);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      if (vv) {
        vv.removeEventListener('resize', schedule);
        vv.removeEventListener('scroll', schedule);
      }
      nativeHandles.forEach((handle) => handle?.remove?.());
      release();
    };
  }, [enabled]);
}
