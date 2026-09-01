import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('driver odometer keyboard overlay contract', () => {
  it('does not allow web or native keyboards to resize the application shell', () => {
    const capacitor = JSON.parse(read('capacitor.config.json'));
    expect(capacitor.plugins.Keyboard.resize).toBe('none');
    expect(capacitor.plugins.Keyboard.resizeOnFullScreen).toBe(false);
    for (const generatedConfig of [
      'android/app/src/main/assets/capacitor.config.json',
      'ios/App/App/capacitor.config.json',
    ]) {
      expect(JSON.parse(read(generatedConfig)).plugins.Keyboard).toMatchObject({
        resize: 'none',
        resizeOnFullScreen: false,
      });
    }
    expect(read('index.html')).toContain('interactive-widget=overlays-content');
    expect(read('index.html')).toContain('id="build-tag"');
    expect(read('src/App.jsx')).toContain('interactive-widget=overlays-content');
  });

  it('uses keyboard bounds to keep the complete window together above the keyboard', () => {
    const driver = read('src/components/DriverPage.jsx');
    const css = read('src/styles/tripWindows.css');
    expect(driver).toContain('virtualKeyboard.overlaysContent = true');
    expect(driver).toContain('Keyboard.setResizeMode({ mode: KeyboardResize.None })');
    expect(driver).toContain('applyWindowLock');
    expect(driver).toContain('const mutationObserver = new MutationObserver((records) =>');
    expect(driver).toContain("node.matches?.('.trip-window-panel')");
    expect(driver).toContain('Keyboard.setScroll({ isDisabled: true })');
    expect(driver).toContain('fieldRect.bottom > footerTop - 12');
    expect(driver).toContain('baselineVisualPageTop = getVisualPageTop()');
    expect(driver).toContain('const viewportPan = Math.max(0, getVisualPageTop() - baselineVisualPageTop)');
    expect(driver).toContain('translate3d(0, ${viewportPan.toFixed(3)}px, 0)');
    expect(driver).toContain("visualViewport?.addEventListener('scroll', scheduleWindowLock)");
    expect(driver).toContain('resolveTripKeyboardTop({');
    expect(driver).toContain('calculateTripWindowLift({ windowBottom, keyboardTop })');
    expect(driver).toContain("root.style.setProperty('--trip-window-panel-lift', `${panelLift}px`)");
    expect(driver).toContain("root.style.setProperty('--trip-window-keyboard-top', `${keyboardTop}px`)");
    expect(driver).toContain('Math.abs(previousLift - panelLift) > 0.5');
    expect(driver).toContain("Keyboard.addListener('keyboardWillShow'");
    expect(driver).toContain("Keyboard.addListener('keyboardWillHide'");
    expect(driver).toContain('const resetTripKeyboardPresentation = () =>');
    expect(driver).toContain('if (nextPanel !== activePanel)');
    expect(driver).toContain("window.addEventListener('agape:trip-keyboard-open', handleKeyboardOpen)");
    expect(driver).toContain("document.addEventListener('focusout', handleKeyboardProxyBlur, true)");
    expect(driver).not.toContain('focusTripWindowInput');
    expect(driver).toMatch(/setShowOdometerPrompt\(trip\);\s*openNativeOdometerKeyboard\('pickup'\);/);
    expect(driver).toMatch(/setRouteStopOdometerPrompt\(stop\);\s*openNativeOdometerKeyboard\('route'\);/);
    expect(driver).not.toMatch(/readOnly\s+autoFocus\s+value=\{(?:odometerValue|routeStopOdometerValue|completeOdometer)\}/);
    expect(css).toContain('html.trip-window-open {');
    expect(css).toContain('background: #94979d !important');
    expect(driver).toContain("themeColorMeta.content = '#94979d'");
    expect(driver).toContain('trip-window-keyboard-visible');
    expect(driver).toContain('--trip-window-panel-lift');
    expect(css).toContain('trip-window-keyboard-visible');
    expect(css).toContain('--trip-window-panel-lift');
    expect(driver).not.toContain('--trip-window-keyboard-inset');
    expect(css).not.toContain('--trip-window-keyboard-inset');
    expect(driver).not.toContain('trip-window-kb-open');
    expect(driver).not.toContain('trip-window-kb-native');
    expect(driver).not.toContain('trip-window-kb-bounds');
    expect(driver).not.toContain("window.setInterval(poll, 100)");
    expect(css).not.toContain('html.trip-window-kb-open');
    expect(css).not.toContain('html.trip-window-kb-native');
    expect(css).not.toContain('html.trip-window-kb-bounds');
    expect(driver).not.toContain('--trip-window-footer-lift');
    expect(css).not.toContain('--trip-window-footer-lift');

    const footerBase = css.match(/\.trip-window-footer\s*\{([^}]*)\}/)?.[1] || '';
    const footerKeyboard = css.match(/html\.trip-window-keyboard-visible \.trip-window-footer\s*\{([^}]*)\}/)?.[1] || '';
    const panelKeyboard = css.match(/html\.trip-window-keyboard-visible \.trip-window-panel\s*\{([^}]*)\}/)?.[1] || '';
    expect(footerBase).not.toContain('transform:');
    expect(footerKeyboard).not.toContain('transform:');
    expect(footerKeyboard).not.toContain('box-shadow:');
    expect(panelKeyboard).toContain('transform: translate3d');
    expect(panelKeyboard).toContain('--trip-window-keyboard-top');
    expect(css).toContain('@keyframes trip-window-panel-in');
    expect(css).toContain('@keyframes trip-window-scrim-in');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('opens the native numeric keyboard through a fixed proxy instead of scrolling visible fields', () => {
    const driver = read('src/components/DriverPage.jsx');
    const css = read('src/styles/tripWindows.css');
    expect(driver.match(/inputMode="none"/g)).toHaveLength(4);
    expect(driver.match(/inputMode="numeric"/g)).toHaveLength(1);
    expect(driver).toContain('ref={odometerKeyboardProxyRef}');
    expect(driver).toContain('className="trip-odometer-native-proxy"');
    expect(driver).toContain("openNativeOdometerKeyboard('pickup')");
    expect(driver).toContain("openNativeOdometerKeyboard('route')");
    expect(driver).not.toContain("openNativeOdometerKeyboard('arrival')");
    expect(driver).toContain("openNativeOdometerKeyboard('complete')");
    expect(driver).toContain('proxy.focus({ preventScroll: true })');
    expect(css).toContain('.trip-odometer-native-proxy {');
    expect(css).toContain('position: fixed;');
    expect(css).toContain('top: max(1px, env(safe-area-inset-top, 0px));');
    expect(driver.match(/<OdometerEditingCaret active=/g)).toHaveLength(4);
    expect(css).toContain('.trip-odometer-visual-caret {');
    expect(driver).not.toContain('OdometerKeypad');
    expect(css).not.toContain('.trip-odometer-keypad');
  });

  it('loads one authoritative trip-window stylesheet after global application styles', () => {
    const main = read('src/main.jsx');
    const globalCss = read('src/index.css');
    const tripCss = read('src/styles/tripWindows.css');
    expect(main.indexOf("import './styles/tripWindows.css';")).toBeGreaterThan(main.indexOf("import './index.css';"));
    expect(globalCss).not.toContain('.trip-window-overlay');
    expect(tripCss).toContain('.trip-window-overlay {');
    expect(tripCss).toContain('.trip-window-footer {');
    expect(tripCss).toContain('background: #ffffff;');
  });
});
