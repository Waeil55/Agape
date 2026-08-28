import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const driverSource = readFileSync(new URL('./DriverPage.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const indexHtmlSource = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('trip odometer caret positioning', () => {
  it('keeps iOS trip inputs in the same painting coordinate system as their caret', () => {
    expect(driverSource).not.toContain("setProperty('--agape-vv-top'");
    expect(driverSource).not.toContain("setProperty('--agape-vv-height'");
    expect(cssSource).toContain('.trip-window-overlay {\n  position: fixed;\n  inset: 0;\n  height: 100dvh;');
    expect(driverSource).toContain("el.focus({ preventScroll: true })");
    expect(driverSource).toContain("body.scrollTop = Math.max(0, target)");
    expect(cssSource).not.toContain('var(--agape-kb-inset, 0px)');
    expect(cssSource).not.toContain('translateY(calc(-1 * var(--agape-kb-shift');
  });

  it('runs completion and cancellation on the first keyboard-visible touch', () => {
    expect(driverSource).toContain('runTripActionOnFirstPress(event, submitComplete)');
    expect(driverSource).toContain('runTripActionOnFirstPress(event, () => { setShowCompleteModal(null)');
    expect(driverSource).toContain('event.preventDefault();');
    expect(driverSource).not.toContain('document.activeElement.blur();');
  });

  it('keeps the final odometer caret scoped to the actual input', () => {
    expect(driverSource).toContain('className={`trip-odometer-input');
    expect(driverSource).toContain("focusTripWindowInput('.trip-completion-odometer')");
    expect(driverSource).toContain("panel.querySelector(preferredSelector)");
    expect(cssSource).toContain('.trip-odometer-input');
    expect(cssSource).toContain('caret-color: #2a52ac');
  });

  it('lets drivers edit both completion times without silently rewriting either field', () => {
    expect(driverSource).toContain('setDepartedTime(value);');
    expect(driverSource).toContain('setArrivalDropoffTime(value);');
    expect(driverSource).not.toContain('setDepartedTime(normalized.pickupDeparture);\n    if (normalized.dropoffArrival');
    expect(driverSource).toContain('aria-label="Departed pickup time"');
    expect(driverSource).toContain('aria-label="Arrival dropoff time"');
  });

  it('preserves the resizing keyboard viewport policy after React starts', () => {
    expect(indexHtmlSource).toContain('interactive-widget=resizes-content');
    expect(appSource).toContain('interactive-widget=resizes-content');
  });

  it('centers the trip panel within the visible area above the keyboard', () => {
    // The visible-area vars must live on the ROOT element so the overlay rule
    // can resolve them (setting them on the panel only left the overlay at
    // full 100dvh, which pushed the window too high above the keyboard).
    expect(driverSource).toContain("document.documentElement.style.setProperty('--vvh'");
    expect(driverSource).toContain("document.documentElement.style.setProperty('--vvt'");
    expect(driverSource).not.toContain("panel.style.setProperty('--vvh'");
    expect(driverSource).not.toContain("panel.style.setProperty('--vvt'");
    // The overlay is sized to the live visible region and bottom-aligns the
    // panel immediately above the keyboard without pinning it to the top.
    expect(cssSource).toContain('html.trip-window-kb-open .trip-window-overlay {\n  top: var(--vvt, 0px);\n  height: var(--vvh, 100dvh);\n  align-items: flex-end;');
    expect(cssSource).toContain('html.trip-window-kb-open .trip-window-panel {\n  max-height: min(34rem, calc(var(--vvh, 100dvh) - 1rem));\n  margin-top: 0;\n  margin-bottom: 0.25rem;\n}');
    expect(cssSource).not.toContain('html.trip-window-kb-native .trip-window-overlay');
    expect(driverSource).toContain('closedHeight: keyboardClosedHeight');
    expect(driverSource).toContain('resolveKeyboardViewport({');
    expect(driverSource).toContain('resolveBrowserKeyboardViewport({');
    expect(driverSource).toContain("setProperty('--vvh', `${resolved.visibleHeight}px`)");
    // The visual-viewport path must run for NATIVE shells too. Capacitor's
    // WKWebView exposes visualViewport and resizes it when the keyboard opens,
    // so gating this behind isNativeShell() (and relying solely on the
    // Keyboard plugin) left the odometer window unbound and jumping to the top
    // inside the installed app when the plugin is unavailable.
    expect(driverSource).not.toContain('if (!isNativeShell()) {\n          document.documentElement.classList.toggle(\'trip-window-kb-open\'');
    expect(driverSource).not.toContain("if (!isNativeShell()) {\n          document.documentElement.style.setProperty('--vvh'");
    expect(driverSource).toContain("document.documentElement.style.setProperty('--vvh', `${resolved.visibleHeight}px`)");
    expect(driverSource).not.toContain("document.documentElement.style.setProperty('--kbh'");
  });

  it('falls back to driver GPS for the pickup anchor instead of blocking on an unverifiable address', () => {
    expect(driverSource).toContain('resolveWorkPickupAnchor(showOdometerPrompt, driverLocation)');
    expect(driverSource).toContain('resolveWorkPickupAnchor(showArrivalConfirm, driverLocation)');
    expect(driverSource).toContain("pickupCoordinatesSource: 'driver_gps_fallback'");
    expect(driverSource).toContain("source: 'driver_gps_fallback'");
    expect(driverSource).toContain('pickupLocationSource');
  });
});
