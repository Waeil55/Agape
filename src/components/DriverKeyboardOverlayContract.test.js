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
    expect(read('index.html')).toContain('UI-LIGHT-ONLY-20260830L');
    expect(read('src/App.jsx')).toContain('interactive-widget=overlays-content');
  });

  it('uses keyboard bounds to move only the trip action window', () => {
    const driver = read('src/components/DriverPage.jsx');
    const css = read('src/index.css');
    expect(driver).toContain('virtualKeyboard.overlaysContent = true');
    expect(driver).toContain('Keyboard.setResizeMode({ mode: KeyboardResize.None })');
    expect(driver).toContain('applyWindowLock');
    expect(driver).toContain('const mutationObserver = new MutationObserver((records) =>');
    expect(driver).toContain("node.matches?.('.trip-window-panel')");
    expect(driver).toContain('Keyboard.setScroll({ isDisabled: true })');
    expect(driver).toContain('inputRect.bottom > bodyRect.bottom - edgePadding');
    expect(driver).toContain('baselineVisualPageTop = getVisualPageTop()');
    expect(driver).toContain('const viewportPan = Math.max(0, getVisualPageTop() - baselineVisualPageTop)');
    expect(driver).toContain('translate3d(0, ${viewportPan.toFixed(3)}px, 0)');
    expect(driver).toContain("visualViewport?.addEventListener('scroll', scheduleWindowLock)");
    expect(css).toContain('html.trip-window-open {');
    expect(css).toContain('background: #94979d !important');
    expect(driver).toContain("themeColorMeta.content = '#94979d'");
    expect(driver).not.toContain('trip-window-keyboard-visible');
    expect(driver).not.toContain('--trip-window-keyboard-inset');
    expect(css).not.toContain('trip-window-keyboard-visible');
    expect(css).not.toContain('--trip-window-keyboard-inset');
    expect(driver).not.toContain('trip-window-kb-open');
    expect(driver).not.toContain('trip-window-kb-native');
    expect(driver).not.toContain('trip-window-kb-bounds');
    expect(driver).not.toContain("window.setInterval(poll, 100)");
    expect(css).not.toContain('html.trip-window-kb-open');
    expect(css).not.toContain('html.trip-window-kb-native');
    expect(css).not.toContain('html.trip-window-kb-bounds');
  });

  it('opens the native numeric keyboard through a fixed proxy instead of scrolling visible fields', () => {
    const driver = read('src/components/DriverPage.jsx');
    const css = read('src/index.css');
    expect(driver.match(/inputMode="none"/g)).toHaveLength(4);
    expect(driver.match(/inputMode="numeric"/g)).toHaveLength(1);
    expect(driver).toContain('ref={odometerKeyboardProxyRef}');
    expect(driver).toContain('className="trip-odometer-native-proxy"');
    expect(driver).toContain("openNativeOdometerKeyboard('pickup')");
    expect(driver).toContain("openNativeOdometerKeyboard('route')");
    expect(driver).toContain("openNativeOdometerKeyboard('arrival')");
    expect(driver).toContain("openNativeOdometerKeyboard('complete')");
    expect(driver).toContain('proxy.focus({ preventScroll: true })');
    expect(css).toContain('.trip-odometer-native-proxy {');
    expect(css).toContain('position: fixed;');
    expect(css).toContain('top: max(1px, env(safe-area-inset-top, 0px));');
    expect(driver).not.toContain('OdometerKeypad');
    expect(css).not.toContain('.trip-odometer-keypad');
  });
});
